/**
 * system-eq.ts
 *
 * Server-only. One "system" input EQ per project that the phone remote edits
 * and pushes to the input EQ of every targeted amp channel.
 *
 * The system EQ owns the input EQ of its targets: pushing it overwrites
 * whatever input EQ those channels had before. Output EQ (speaker tuning) is
 * never touched. Removing a target leaves its input EQ as it was last pushed.
 *
 * Stored at <APP_USER_DATA|cwd>/storage/remote/system-eq/<projectId>.json
 */

import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { executeAmpAction } from "@/lib/amp-action-executor";
import type { AmpActionRequest } from "@/lib/validation/amp-actions";
import type { EqBand } from "@/lib/parse-channel-data";
import {
  CROSSOVER_FREQ_MAX_HZ,
  CROSSOVER_FREQ_MIN_HZ,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_Q_MAX,
  EQ_BAND_Q_MIN
} from "@/lib/constants";

export const SYSTEM_EQ_BAND_COUNT = 10;

/** Default PEQ centre frequencies for bands 1–8 (octave spaced). */
const DEFAULT_PEQ_FREQS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

export interface SystemEqTarget {
  mac: string;
  /** Input channel index (0-based). */
  channel: number;
}

export interface SystemEq {
  projectId: string;
  bands: EqBand[];
  targets: SystemEqTarget[];
  updatedAt: string;
}

const bandSchema = z.object({
  type: z.number().int().min(0).max(10),
  gain: z.number().min(EQ_BAND_GAIN_MIN_DB).max(EQ_BAND_GAIN_MAX_DB),
  freq: z.number().min(CROSSOVER_FREQ_MIN_HZ).max(CROSSOVER_FREQ_MAX_HZ),
  q: z.number().min(EQ_BAND_Q_MIN).max(EQ_BAND_Q_MAX),
  bypass: z.boolean()
});

const targetSchema = z.object({
  mac: z.string().trim().min(1),
  channel: z.number().int().min(0).max(15)
});

export const systemEqUpdateSchema = z.object({
  projectId: z.string().trim().min(1),
  bands: z.array(bandSchema).length(SYSTEM_EQ_BAND_COUNT).optional(),
  targets: z.array(targetSchema).max(256).optional()
});

export type SystemEqUpdate = z.infer<typeof systemEqUpdateSchema>;

export function createDefaultSystemEqBands(): EqBand[] {
  return Array.from({ length: SYSTEM_EQ_BAND_COUNT }, (_, idx) => {
    // HP/LP start bypassed so the system EQ is flat until someone engages them.
    if (idx === 0) return { type: 4, gain: 0, freq: 30, q: 0.71, bypass: true };
    if (idx === 9) return { type: 4, gain: 0, freq: 18000, q: 0.71, bypass: true };
    return { type: 0, gain: 0, freq: DEFAULT_PEQ_FREQS[idx - 1], q: 1.4, bypass: false };
  });
}

function getStoreDir(): string {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "remote", "system-eq");
}

function getStorePath(projectId: string): string {
  // Project IDs are UUIDs; strip anything that could escape the directory.
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(getStoreDir(), `${safeId}.json`);
}

function targetKey(target: SystemEqTarget): string {
  return `${target.mac.toUpperCase()}#${target.channel}`;
}

function dedupeTargets(targets: SystemEqTarget[]): SystemEqTarget[] {
  const seen = new Map<string, SystemEqTarget>();
  for (const target of targets) {
    seen.set(targetKey(target), { mac: target.mac.toUpperCase(), channel: target.channel });
  }
  return [...seen.values()];
}

export async function loadSystemEq(projectId: string): Promise<SystemEq> {
  try {
    const raw = JSON.parse(await fs.readFile(getStorePath(projectId), "utf-8")) as Partial<SystemEq>;
    const bands = z.array(bandSchema).length(SYSTEM_EQ_BAND_COUNT).safeParse(raw.bands);
    const targets = z.array(targetSchema).safeParse(raw.targets);
    return {
      projectId,
      bands: bands.success ? bands.data : createDefaultSystemEqBands(),
      targets: targets.success ? dedupeTargets(targets.data) : [],
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString()
    };
  } catch {
    return { projectId, bands: createDefaultSystemEqBands(), targets: [], updatedAt: new Date(0).toISOString() };
  }
}

async function saveSystemEq(eq: SystemEq): Promise<void> {
  await fs.mkdir(getStoreDir(), { recursive: true });
  await fs.writeFile(getStorePath(eq.projectId), JSON.stringify(eq, null, 2));
}

// ---------------------------------------------------------------------------
// Pushing to amps
// ---------------------------------------------------------------------------

function bandsEqual(a: EqBand, b: EqBand): boolean {
  return a.type === b.type && a.gain === b.gain && a.freq === b.freq && a.q === b.q && a.bypass === b.bypass;
}

/**
 * Builds the commands that move one band from `prev` to `next`.
 * Only changed fields are sent so a fader-style drag stays cheap on the wire.
 * HP/LP (bands 0 and 9) only carry type/freq, matching the crossover path.
 */
function buildBandCommands(
  target: SystemEqTarget,
  band: number,
  prev: EqBand | null,
  next: EqBand
): AmpActionRequest[] {
  const base = { mac: target.mac, channel: target.channel };
  const commands: AmpActionRequest[] = [];

  if (band === 0 || band === 9) {
    const kind = band === 0 ? "hp" : "lp";
    if (!prev || prev.type !== next.type || prev.bypass !== next.bypass) {
      commands.push({
        ...base,
        action: "crossoverEnabled",
        target: "input",
        kind,
        value: !next.bypass,
        filterType: next.type
      });
    }
    if (!prev || prev.freq !== next.freq) {
      commands.push({ ...base, action: "crossoverFreq", target: "input", kind, value: next.freq });
    }
    return commands;
  }

  if (!prev || prev.type !== next.type || prev.bypass !== next.bypass) {
    commands.push({ ...base, action: "eqBandType", target: "input", band, value: next.type, bypass: next.bypass });
  }
  if (!prev || prev.freq !== next.freq) {
    commands.push({ ...base, action: "eqBandFreq", target: "input", band, value: next.freq });
  }
  if (!prev || prev.gain !== next.gain) {
    commands.push({ ...base, action: "eqBandGain", target: "input", band, value: next.gain });
  }
  if (!prev || prev.q !== next.q) {
    commands.push({ ...base, action: "eqBandQ", target: "input", band, value: next.q });
  }
  return commands;
}

export interface PushFailure {
  mac: string;
  channel: number;
  error: string;
}

/**
 * Sends `next` to every target. `prev` is what the target already has
 * (null = unknown, send everything). Amps run in parallel; channels and
 * commands on one amp run in order.
 */
async function pushBands(targets: SystemEqTarget[], prev: EqBand[] | null, next: EqBand[]): Promise<PushFailure[]> {
  const byMac = new Map<string, SystemEqTarget[]>();
  for (const target of targets) {
    const list = byMac.get(target.mac) ?? [];
    list.push(target);
    byMac.set(target.mac, list);
  }

  const failures: PushFailure[] = [];

  await Promise.all(
    [...byMac.values()].map(async (ampTargets) => {
      for (const target of ampTargets) {
        for (let band = 0; band < SYSTEM_EQ_BAND_COUNT; band++) {
          const prevBand = prev?.[band] ?? null;
          if (prevBand && bandsEqual(prevBand, next[band])) continue;

          for (const command of buildBandCommands(target, band, prevBand, next[band])) {
            const response = await executeAmpAction(command);
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              failures.push({
                mac: target.mac,
                channel: target.channel,
                error: body.error ?? `HTTP ${response.status}`
              });
              return; // Skip the rest of this amp; it is likely offline.
            }
          }
        }
      }
    })
  );

  return failures;
}

// Updates for one project run one at a time so a fast drag can't reorder writes.
const projectQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const previous = projectQueues.get(projectId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  projectQueues.set(projectId, run);
  void run.finally(() => {
    if (projectQueues.get(projectId) === run) projectQueues.delete(projectId);
  });
  return run;
}

export interface SystemEqUpdateResult {
  eq: SystemEq;
  failures: PushFailure[];
}

/**
 * Saves the update and pushes it:
 * - existing targets get only the bands that changed,
 * - newly added targets get the full EQ.
 */
export function updateSystemEq(update: SystemEqUpdate): Promise<SystemEqUpdateResult> {
  return enqueue(update.projectId, async () => {
    const current = await loadSystemEq(update.projectId);
    const nextBands = update.bands ?? current.bands;
    const nextTargets = update.targets ? dedupeTargets(update.targets) : current.targets;

    const currentKeys = new Set(current.targets.map(targetKey));
    const keptTargets = nextTargets.filter((target) => currentKeys.has(targetKey(target)));
    const addedTargets = nextTargets.filter((target) => !currentKeys.has(targetKey(target)));

    const failures = [
      ...(await pushBands(keptTargets, current.bands, nextBands)),
      ...(await pushBands(addedTargets, null, nextBands))
    ];

    const eq: SystemEq = {
      projectId: update.projectId,
      bands: nextBands,
      targets: nextTargets,
      updatedAt: new Date().toISOString()
    };
    await saveSystemEq(eq);
    return { eq, failures };
  });
}

/** Re-sends the full EQ to every target, e.g. after an amp was power-cycled or edited elsewhere. */
export function resendSystemEq(projectId: string): Promise<SystemEqUpdateResult> {
  return enqueue(projectId, async () => {
    const eq = await loadSystemEq(projectId);
    const failures = await pushBands(eq.targets, null, eq.bands);
    return { eq, failures };
  });
}
