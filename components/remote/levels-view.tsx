"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Fader } from "@/components/remote/fader";
import { clampVolumeDb, dbToFaderPos, faderPosToDb, formatDb } from "@/lib/remote/client";
import type { RemoteAmp, RemoteChannel } from "@/lib/remote/state";
import { cn } from "@/lib/utils";

const CHANNEL_LETTERS = "ABCDEFGHIJKLMNOP";
const NUDGE_DB = 1;

export interface LevelsViewProps {
  amps: RemoteAmp[];
  onVolume: (mac: string, channel: number, db: number) => void;
  onMute: (mac: string, channel: number, muted: boolean) => void;
}

function channelLabel(channel: RemoteChannel): string {
  return channel.outputName.trim() || `Out ${CHANNEL_LETTERS[channel.index] ?? channel.index + 1}`;
}

function ChannelStrip({
  amp,
  channel,
  onVolume,
  onMute
}: { amp: RemoteAmp; channel: RemoteChannel } & Omit<LevelsViewProps, "amps">) {
  const disabled = !amp.online;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onMute(amp.mac, channel.index, !channel.muteOut)}
        className={cn(
          "h-11 w-11 shrink-0 rounded-md border text-sm font-semibold transition-colors disabled:opacity-40",
          channel.muteOut
            ? "border-destructive bg-destructive text-destructive-foreground"
            : "border-border bg-secondary text-secondary-foreground"
        )}
        aria-pressed={channel.muteOut}
        aria-label={`Mute ${channelLabel(channel)}`}
      >
        M
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="truncate font-medium">{channelLabel(channel)}</span>
          <span className={cn("tabular-nums", channel.muteOut ? "text-muted-foreground line-through" : "")}>
            {formatDb(channel.volumeOut)} dB
          </span>
        </div>
        <Fader
          position={dbToFaderPos(channel.volumeOut)}
          onPositionChange={(pos) => onVolume(amp.mac, channel.index, clampVolumeDb(faderPosToDb(pos)))}
          disabled={disabled}
          muted={channel.muteOut}
          aria-label={`${channelLabel(channel)} level`}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          onClick={() => onVolume(amp.mac, channel.index, clampVolumeDb(channel.volumeOut + NUDGE_DB))}
          aria-label={`${channelLabel(channel)} up ${NUDGE_DB} dB`}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          onClick={() => onVolume(amp.mac, channel.index, clampVolumeDb(channel.volumeOut - NUDGE_DB))}
          aria-label={`${channelLabel(channel)} down ${NUDGE_DB} dB`}
        >
          <Minus />
        </Button>
      </div>
    </div>
  );
}

export function LevelsView({ amps, onVolume, onMute }: LevelsViewProps) {
  const onlineChannels = amps.filter((amp) => amp.online).flatMap((amp) => amp.channels.map((ch) => ({ amp, ch })));

  const nudgeAll = (delta: number) => {
    for (const { amp, ch } of onlineChannels) {
      onVolume(amp.mac, ch.index, clampVolumeDb(ch.volumeOut + delta));
    }
  };

  if (amps.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No amps in this project yet. Assign amps in the desktop app first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
        <span className="text-sm font-medium">All channels</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={onlineChannels.length === 0} onClick={() => nudgeAll(-NUDGE_DB)}>
            <Minus /> {NUDGE_DB} dB
          </Button>
          <Button variant="outline" disabled={onlineChannels.length === 0} onClick={() => nudgeAll(NUDGE_DB)}>
            <Plus /> {NUDGE_DB} dB
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {amps.map((amp) => (
          <section key={amp.mac} className="rounded-lg border bg-card p-3">
            <header className="mb-1 flex items-center justify-between">
              <h2 className="truncate font-semibold">{amp.name}</h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", amp.online ? "bg-green-500" : "bg-destructive")} />
                {amp.online ? "Online" : amp.stale ? "Offline (last known)" : "Offline"}
              </span>
            </header>
            {amp.channels.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Waiting for this amp…</p>
            ) : (
              amp.channels.map((channel) => (
                <ChannelStrip key={channel.index} amp={amp} channel={channel} onVolume={onVolume} onMute={onMute} />
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
