/**
 * state.ts
 *
 * Server-only. Builds the compact snapshot the phone remote polls:
 * projects, and for the chosen project each amp's channels with
 * names, output volume and mutes.
 */

import { promises as fs } from "fs";
import path from "path";
import { ampController } from "@/lib/amp-controller";
import { parseFC27Channels } from "@/lib/parse-channel-data";
import { buildSimulatedFc27Hex, getSimulatedScanDevices, isSimulatedMac } from "@/lib/simulated-amps";

const FRESH_SNAPSHOT_MS = 1000;

export interface RemoteChannel {
  index: number;
  inputName: string;
  outputName: string;
  volumeOut: number;
  muteOut: boolean;
  muteIn: boolean;
}

export interface RemoteAmp {
  mac: string;
  name: string;
  online: boolean;
  /** true when the channel data is the last good snapshot rather than a live read. */
  stale: boolean;
  channels: RemoteChannel[];
}

export interface RemoteProjectSummary {
  id: string;
  name: string;
  projectMode: "real" | "demo";
}

interface StoredProject {
  id: string;
  name: string;
  projectMode?: "real" | "demo";
  assigned_amps?: Array<{ mac: string; lastKnownName?: string; lastKnownIp?: string }>;
}

function getProjectsDir(): string {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "projects");
}

export async function listStoredProjects(): Promise<StoredProject[]> {
  const dir = getProjectsDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const projects: StoredProject[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const project = JSON.parse(await fs.readFile(path.join(dir, file), "utf-8")) as StoredProject;
      if (typeof project.id === "string" && typeof project.name === "string") projects.push(project);
    } catch {
      // Skip unreadable project files; the desktop app reports those itself.
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function toRemoteChannels(hex: string): RemoteChannel[] {
  return parseFC27Channels(hex).map((channel) => ({
    index: channel.channel,
    inputName: channel.inputName,
    outputName: channel.outputName,
    volumeOut: channel.volumeOut,
    muteOut: channel.muteOut,
    muteIn: channel.muteIn
  }));
}

async function readAmp(amp: { mac: string; lastKnownName?: string; lastKnownIp?: string }): Promise<RemoteAmp> {
  const fallbackName = amp.lastKnownName ?? amp.mac;

  if (isSimulatedMac(amp.mac)) {
    const hex = buildSimulatedFc27Hex(amp.mac);
    const sim = getSimulatedScanDevices().find((device) => device.mac.toUpperCase() === amp.mac.toUpperCase());
    return {
      mac: amp.mac,
      name: sim?.name ?? fallbackName,
      online: hex !== null,
      stale: false,
      channels: hex ? toRemoteChannels(hex) : []
    };
  }

  ampController.start();
  const ip = ampController.getIpForMac(amp.mac);
  if (!ip) {
    // Help discovery find amps on other subnets the desktop app has seen before.
    if (amp.lastKnownIp) ampController.seedIp(amp.lastKnownIp);
    return { mac: amp.mac, name: fallbackName, online: false, stale: false, channels: [] };
  }

  const name = ampController.getMacForIp(ip)?.name || fallbackName;

  // The desktop UI polls FC=27 too; reuse a fresh snapshot instead of doubling traffic.
  const recent = ampController.getLastFC27(amp.mac);
  if (recent && Date.now() - recent.at < FRESH_SNAPSHOT_MS) {
    return { mac: amp.mac, name, online: true, stale: false, channels: toRemoteChannels(recent.body.toString("hex")) };
  }

  try {
    const data = await ampController.requestFC27(amp.mac, 0);
    return { mac: amp.mac, name, online: true, stale: false, channels: toRemoteChannels(data.toString("hex")) };
  } catch {
    const cached = ampController.getLastFC27(amp.mac);
    return {
      mac: amp.mac,
      name,
      online: false,
      stale: cached !== null,
      channels: cached ? toRemoteChannels(cached.body.toString("hex")) : []
    };
  }
}

export interface RemoteState {
  projects: RemoteProjectSummary[];
  projectId: string | null;
  amps: RemoteAmp[];
}

export async function buildRemoteState(projectId: string | null): Promise<RemoteState> {
  const stored = await listStoredProjects();
  const projects = stored.map((project) => ({
    id: project.id,
    name: project.name,
    projectMode: project.projectMode === "demo" ? ("demo" as const) : ("real" as const)
  }));

  const project = stored.find((p) => p.id === projectId) ?? stored[0];
  if (!project) return { projects, projectId: null, amps: [] };

  const amps = await Promise.all((project.assigned_amps ?? []).map(readAmp));
  return { projects, projectId: project.id, amps };
}
