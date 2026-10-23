"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LevelsView } from "@/components/remote/levels-view";
import { SystemEqView } from "@/components/remote/system-eq-view";
import { createLatestSender, postJson } from "@/lib/remote/client";
import type { EqBand } from "@/lib/parse-channel-data";
import type { RemoteAmp, RemoteProjectSummary } from "@/lib/remote/state";
import type { SystemEq, SystemEqTarget } from "@/lib/remote/system-eq";
import { cn } from "@/lib/utils";

const POLL_MS = 1500;
/** Local edits win over polled values for this long, so faders don't jump back mid-drag. */
const LOCAL_HOLD_MS = 2500;
const VOLUME_SEND_INTERVAL_MS = 80;
const EQ_SEND_INTERVAL_MS = 120;
const PROJECT_STORAGE_KEY = "ampcore-remote-project";

interface RemoteStateResponse {
  success: boolean;
  error?: string;
  projects: RemoteProjectSummary[];
  projectId: string | null;
  amps: RemoteAmp[];
  systemEq: SystemEq | null;
}

interface SystemEqResponse {
  success: boolean;
  systemEq: SystemEq;
  failures: Array<{ mac: string; channel: number; error: string }>;
}

interface ChannelOverride {
  volumeOut?: number;
  muteOut?: boolean;
  at: number;
}

type Tab = "levels" | "eq";

function readStoredProject(): string | null {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function describeFailures(response: SystemEqResponse): string {
  if (response.failures.length === 0) return `Sent to ${response.systemEq.targets.length} channel(s)`;
  const macs = new Set(response.failures.map((f) => f.mac));
  return `Could not reach ${macs.size} amp(s): ${response.failures[0].error}`;
}

export function RemoteApp() {
  const [tab, setTab] = useState<Tab>("levels");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<RemoteProjectSummary[]>([]);
  const [amps, setAmps] = useState<RemoteAmp[]>([]);
  const [connected, setConnected] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ChannelOverride>>({});

  const [eqBands, setEqBands] = useState<EqBand[] | null>(null);
  const [eqTargets, setEqTargets] = useState<SystemEqTarget[]>([]);
  const [eqStatus, setEqStatus] = useState<string | null>(null);
  const eqEditedAt = useRef(0);
  const projectIdRef = useRef<string | null>(null);

  useEffect(() => {
    setProjectId(readStoredProject());
  }, []);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Polling
  // -------------------------------------------------------------------------

  const poll = useCallback(async () => {
    const query = projectIdRef.current ? `?projectId=${encodeURIComponent(projectIdRef.current)}` : "";
    try {
      const response = await fetch(`/api/remote/state${query}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/remote-login";
        return;
      }
      const data = (await response.json()) as RemoteStateResponse;
      if (!data.success) throw new Error(data.error);

      setConnected(true);
      setLoaded(true);
      setProjects(data.projects);
      setAmps(data.amps);
      if (data.projectId !== projectIdRef.current) setProjectId(data.projectId);
      if (data.systemEq && Date.now() - eqEditedAt.current > LOCAL_HOLD_MS) {
        setEqBands(data.systemEq.bands);
        setEqTargets(data.systemEq.targets);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll, projectId]);

  // -------------------------------------------------------------------------
  // Levels
  // -------------------------------------------------------------------------

  const sendControl = useMemo(
    () =>
      createLatestSender<{ mac: string; channel: number; action: string; value: number | boolean }>(
        async (_key, body) => {
          await postJson("/api/remote/control", body);
        },
        VOLUME_SEND_INTERVAL_MS
      ),
    []
  );

  const setOverride = (mac: string, channel: number, patch: Omit<ChannelOverride, "at">) => {
    const key = `${mac}#${channel}`;
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch, at: Date.now() } }));
  };

  const handleVolume = (mac: string, channel: number, db: number) => {
    setOverride(mac, channel, { volumeOut: db });
    sendControl(`${mac}#${channel}#vol`, { mac, channel, action: "volumeOut", value: db });
  };

  const handleMute = (mac: string, channel: number, muted: boolean) => {
    setOverride(mac, channel, { muteOut: muted });
    sendControl(`${mac}#${channel}#mute`, { mac, channel, action: "muteOut", value: muted });
  };

  const displayAmps = useMemo(() => {
    const now = Date.now();
    return amps.map((amp) => ({
      ...amp,
      channels: amp.channels.map((ch) => {
        const override = overrides[`${amp.mac}#${ch.index}`];
        if (!override || now - override.at > LOCAL_HOLD_MS) return ch;
        return {
          ...ch,
          volumeOut: override.volumeOut ?? ch.volumeOut,
          muteOut: override.muteOut ?? ch.muteOut
        };
      })
    }));
    // `amps` refreshes every poll, which also expires stale overrides.
  }, [amps, overrides]);

  // -------------------------------------------------------------------------
  // System EQ
  // -------------------------------------------------------------------------

  const sendEq = useMemo(
    () =>
      createLatestSender<{ projectId: string; bands?: EqBand[]; targets?: SystemEqTarget[] }>(async (_key, body) => {
        try {
          const response = (await postJson("/api/remote/system-eq", body, "PUT")) as SystemEqResponse;
          setEqStatus(describeFailures(response));
        } catch (error) {
          setEqStatus(error instanceof Error ? error.message : String(error));
        }
      }, EQ_SEND_INTERVAL_MS),
    []
  );

  const handleBands = (bands: EqBand[]) => {
    if (!projectId) return;
    eqEditedAt.current = Date.now();
    setEqBands(bands);
    sendEq(`${projectId}#bands`, { projectId, bands });
  };

  const handleTargets = (targets: SystemEqTarget[]) => {
    if (!projectId) return;
    eqEditedAt.current = Date.now();
    setEqTargets(targets);
    setEqStatus("Sending…");
    sendEq(`${projectId}#targets`, { projectId, targets });
  };

  const handleResend = async () => {
    if (!projectId) return;
    setEqStatus("Sending…");
    try {
      setEqStatus(describeFailures((await postJson("/api/remote/system-eq", { projectId })) as SystemEqResponse));
    } catch (error) {
      setEqStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const selectProject = (id: string) => {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, id);
    } catch {
      // Private mode: selection just won't persist.
    }
    setOverrides({});
    setEqBands(null);
    eqEditedAt.current = 0;
    setProjectId(id);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="dark h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn("size-2.5 shrink-0 rounded-full", connected ? "bg-green-500" : "bg-destructive")}
              title={connected ? "Connected" : "Can't reach the AmpCore desktop app"}
            />
            <h1 className="truncate text-lg font-semibold">AmpCore Remote</h1>
          </div>
          {projects.length > 0 && (
            <select
              value={projectId ?? ""}
              onChange={(e) => selectProject(e.target.value)}
              className="h-10 max-w-[55%] rounded-md border bg-card px-2 text-sm"
              aria-label="Project"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.projectMode === "demo" ? " (demo)" : ""}
                </option>
              ))}
            </select>
          )}
        </header>

        {!connected && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
            Can&apos;t reach the AmpCore desktop app. Check that it is running and that this device is on the same
            network.
          </div>
        )}

        <nav className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["levels", "Levels"],
              ["eq", "System EQ"]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "h-10 rounded-md text-sm font-medium",
                tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {!loaded ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Connecting…</p>
        ) : projects.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No projects yet. Create one in the AmpCore desktop app.
          </p>
        ) : tab === "levels" ? (
          <LevelsView amps={displayAmps} onVolume={handleVolume} onMute={handleMute} />
        ) : eqBands ? (
          <SystemEqView
            amps={amps}
            bands={eqBands}
            targets={eqTargets}
            status={eqStatus}
            onBandsChange={handleBands}
            onTargetsChange={handleTargets}
            onResend={handleResend}
          />
        ) : null}
      </div>
    </div>
  );
}
