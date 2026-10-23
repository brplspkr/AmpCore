/**
 * client.ts
 *
 * Browser-safe helpers for the phone remote: fader taper and a
 * "latest value wins" sender so drags don't flood the amps.
 */

import { OUTPUT_VOLUME_MAX_DB, OUTPUT_VOLUME_MIN_DB } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Fader taper — the bottom quarter of travel covers -80…-30 dB, the rest
// -30…+18 dB, so the useful range gets most of the throw on a phone screen.
// ---------------------------------------------------------------------------

const TAPER_KNEE_POS = 0.25;
const TAPER_KNEE_DB = -30;

export function faderPosToDb(pos: number): number {
  const p = Math.min(1, Math.max(0, pos));
  if (p <= TAPER_KNEE_POS) {
    return OUTPUT_VOLUME_MIN_DB + (p / TAPER_KNEE_POS) * (TAPER_KNEE_DB - OUTPUT_VOLUME_MIN_DB);
  }
  return TAPER_KNEE_DB + ((p - TAPER_KNEE_POS) / (1 - TAPER_KNEE_POS)) * (OUTPUT_VOLUME_MAX_DB - TAPER_KNEE_DB);
}

export function dbToFaderPos(db: number): number {
  const d = Math.min(OUTPUT_VOLUME_MAX_DB, Math.max(OUTPUT_VOLUME_MIN_DB, db));
  if (d <= TAPER_KNEE_DB) {
    return ((d - OUTPUT_VOLUME_MIN_DB) / (TAPER_KNEE_DB - OUTPUT_VOLUME_MIN_DB)) * TAPER_KNEE_POS;
  }
  return TAPER_KNEE_POS + ((d - TAPER_KNEE_DB) / (OUTPUT_VOLUME_MAX_DB - TAPER_KNEE_DB)) * (1 - TAPER_KNEE_POS);
}

export function clampVolumeDb(db: number): number {
  return Math.round(Math.min(OUTPUT_VOLUME_MAX_DB, Math.max(OUTPUT_VOLUME_MIN_DB, db)) * 2) / 2;
}

export function formatDb(db: number): string {
  if (db <= OUTPUT_VOLUME_MIN_DB) return "-∞";
  return `${db > 0 ? "+" : ""}${db.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Latest-value sender
// ---------------------------------------------------------------------------

/**
 * Wraps an async send so that, per key, at most one request is in flight and
 * at most one runs per `intervalMs`. Values arriving meanwhile replace each
 * other; the last one is always sent.
 */
export function createLatestSender<T>(send: (key: string, value: T) => Promise<void>, intervalMs: number) {
  const pending = new Map<string, T>();
  const busy = new Set<string>();
  const lastSentAt = new Map<string, number>();

  const pump = (key: string) => {
    if (busy.has(key) || !pending.has(key)) return;

    const wait = (lastSentAt.get(key) ?? 0) + intervalMs - Date.now();
    if (wait > 0) {
      busy.add(key);
      setTimeout(() => {
        busy.delete(key);
        pump(key);
      }, wait);
      return;
    }

    const value = pending.get(key) as T;
    pending.delete(key);
    busy.add(key);
    lastSentAt.set(key, Date.now());
    send(key, value)
      .catch(() => undefined)
      .finally(() => {
        busy.delete(key);
        pump(key);
      });
  };

  return (key: string, value: T) => {
    pending.set(key, value);
    pump(key);
  };
}

export async function postJson(url: string, body: unknown, method = "POST"): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
