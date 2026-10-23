"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCcw, Send } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { computeEqCurve, EQ_BAND_SHORT_LABELS, EQ_FREQ_TICKS, formatFreq, formatFreqFull } from "@/lib/eq";
import {
  EQ_FILTER_TYPE_NAMES,
  HPLP_FILTER_TYPE_NAMES,
  getEqFilterTypeCapabilities,
  type EqBand
} from "@/lib/parse-channel-data";
import {
  CROSSOVER_FREQ_MAX_HZ,
  CROSSOVER_FREQ_MIN_HZ,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_Q_MAX,
  EQ_BAND_Q_MIN
} from "@/lib/constants";
import type { RemoteAmp } from "@/lib/remote/state";
import type { SystemEqTarget } from "@/lib/remote/system-eq";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const VIEW_W = 600;
const VIEW_H = 380;
/** Keeps the HP/LP handles at 20 Hz / 20 kHz fully on screen. */
const PAD_X = 24;
const GAIN_RANGE_DB = 18;
const LOG_MIN = Math.log10(CROSSOVER_FREQ_MIN_HZ);
const LOG_MAX = Math.log10(CROSSOVER_FREQ_MAX_HZ);

const PLOT_W = VIEW_W - PAD_X * 2;
const freqToX = (f: number) => PAD_X + ((Math.log10(f) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_W;
const xToFreq = (x: number) =>
  Math.pow(10, LOG_MIN + (Math.min(PLOT_W, Math.max(0, x - PAD_X)) / PLOT_W) * (LOG_MAX - LOG_MIN));
const gainToY = (g: number) => VIEW_H / 2 - (g / GAIN_RANGE_DB) * (VIEW_H / 2);
const yToGain = (y: number) => ((VIEW_H / 2 - y) / (VIEW_H / 2)) * GAIN_RANGE_DB;

const roundFreq = (f: number) => (f < 100 ? Math.round(f) : f < 1000 ? Math.round(f / 5) * 5 : Math.round(f / 50) * 50);
const roundGain = (g: number) => Math.round(Math.min(EQ_BAND_GAIN_MAX_DB, Math.max(EQ_BAND_GAIN_MIN_DB, g)) * 2) / 2;
const isCrossover = (index: number) => index === 0 || index === 9;

// Log-scaled slider helpers (0…1000 steps)
const STEPS = 1000;
const logToPos = (v: number, min: number, max: number) =>
  Math.round(((Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * STEPS);
const posToLog = (p: number, min: number, max: number) =>
  Math.pow(10, Math.log10(min) + (p / STEPS) * (Math.log10(max) - Math.log10(min)));

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ParamSlider({
  label,
  display,
  value,
  min,
  max,
  disabled,
  onChange
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={cn("block", disabled && "opacity-40")}>
      <span className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{display}</span>
      </span>
      <SliderPrimitive.Root
        value={[value]}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        onValueChange={(values) => onChange(values[0] ?? min)}
        className="relative flex h-10 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-chart-1" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-7 rounded-full border border-border bg-foreground shadow-md outline-none focus-visible:ring-4 focus-visible:ring-ring/50" />
      </SliderPrimitive.Root>
    </label>
  );
}

function EqCurve({
  bands,
  selected,
  onSelect,
  onDrag
}: {
  bands: EqBand[];
  selected: number;
  onSelect: (index: number) => void;
  onDrag: (index: number, freq: number, gain: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const path = useMemo(() => {
    const points = computeEqCurve(bands, 200);
    return points
      .map((p, i) => {
        const g = Math.max(-GAIN_RANGE_DB * 1.5, Math.min(GAIN_RANGE_DB * 1.5, p.gain));
        return `${i === 0 ? "M" : "L"}${freqToX(p.freq).toFixed(1)},${gainToY(g).toFixed(1)}`;
      })
      .join(" ");
  }, [bands]);

  const toView = (event: ReactPointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H
    };
  };

  const handleMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const index = dragging.current;
    if (index === null) return;
    const point = toView(event);
    if (!point) return;
    const freq = roundFreq(xToFreq(point.x));
    const supportsGain = !isCrossover(index) && getEqFilterTypeCapabilities(bands[index].type).supportsGain;
    onDrag(index, freq, supportsGain ? roundGain(yToGain(point.y)) : null);
  };

  const endDrag = () => {
    dragging.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto w-full max-w-3xl touch-none rounded-lg border bg-card select-none"
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {EQ_FREQ_TICKS.map((f) => (
        <g key={f}>
          <line x1={freqToX(f)} x2={freqToX(f)} y1={0} y2={VIEW_H} className="stroke-border" strokeWidth={1} />
          <text
            x={f === CROSSOVER_FREQ_MAX_HZ ? freqToX(f) - 4 : freqToX(f) + 4}
            y={VIEW_H - 8}
            textAnchor={f === CROSSOVER_FREQ_MAX_HZ ? "end" : "start"}
            className="fill-muted-foreground"
            fontSize={14}
          >
            {formatFreq(f)}
          </text>
        </g>
      ))}
      {[-12, -6, 0, 6, 12].map((g) => (
        <g key={g}>
          <line
            x1={0}
            x2={VIEW_W}
            y1={gainToY(g)}
            y2={gainToY(g)}
            className={g === 0 ? "stroke-muted-foreground/60" : "stroke-border"}
            strokeWidth={1}
          />
          <text x={6} y={gainToY(g) - 4} className="fill-muted-foreground" fontSize={14}>
            {g > 0 ? `+${g}` : g}
          </text>
        </g>
      ))}

      <path d={path} fill="none" className="stroke-chart-1" strokeWidth={4} />

      {bands.map((band, index) => {
        const x = freqToX(band.freq);
        const y = isCrossover(index)
          ? gainToY(0)
          : gainToY(Math.max(-GAIN_RANGE_DB, Math.min(GAIN_RANGE_DB, band.gain)));
        const active = index === selected;
        return (
          <g
            key={index}
            onPointerDown={(event) => {
              event.preventDefault();
              svgRef.current?.setPointerCapture(event.pointerId);
              dragging.current = index;
              onSelect(index);
            }}
            className="cursor-grab"
          >
            {/* Large invisible hit area for fingers */}
            <circle cx={x} cy={y} r={30} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={active ? 17 : 14}
              className={cn(
                band.bypass
                  ? "fill-card stroke-muted-foreground"
                  : active
                    ? "fill-chart-1 stroke-foreground"
                    : "fill-secondary stroke-foreground"
              )}
              strokeWidth={3}
              strokeDasharray={band.bypass ? "6 4" : undefined}
            />
            <text
              x={x}
              y={y + 4.5}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              className={active && !band.bypass ? "fill-background" : "fill-foreground"}
              pointerEvents="none"
            >
              {EQ_BAND_SHORT_LABELS[index]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BandEditor({ band, index, onChange }: { band: EqBand; index: number; onChange: (band: EqBand) => void }) {
  const crossover = isCrossover(index);
  const caps = crossover ? { supportsGain: false, supportsQ: false } : getEqFilterTypeCapabilities(band.type);
  const typeNames = crossover ? HPLP_FILTER_TYPE_NAMES : EQ_FILTER_TYPE_NAMES;
  const title = index === 0 ? "High-pass" : index === 9 ? "Low-pass" : `Band ${index}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <select
            value={band.type}
            onChange={(e) => onChange({ ...band, type: Number(e.target.value) })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={`${title} filter type`}
          >
            {Object.entries(typeNames).map(([code, name]) => (
              <option key={code} value={code}>
                {name.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <Button
            variant={band.bypass ? "outline" : "default"}
            onClick={() => onChange({ ...band, bypass: !band.bypass })}
            aria-pressed={!band.bypass}
          >
            {band.bypass ? "Off" : "On"}
          </Button>
        </div>
      </div>

      <ParamSlider
        label="Frequency"
        display={`${formatFreqFull(band.freq)} Hz`}
        value={logToPos(band.freq, CROSSOVER_FREQ_MIN_HZ, CROSSOVER_FREQ_MAX_HZ)}
        min={0}
        max={STEPS}
        onChange={(p) =>
          onChange({ ...band, freq: roundFreq(posToLog(p, CROSSOVER_FREQ_MIN_HZ, CROSSOVER_FREQ_MAX_HZ)) })
        }
      />
      {!crossover && (
        <ParamSlider
          label="Gain"
          display={`${band.gain > 0 ? "+" : ""}${band.gain.toFixed(1)} dB`}
          value={Math.round(band.gain * 2)}
          min={EQ_BAND_GAIN_MIN_DB * 2}
          max={EQ_BAND_GAIN_MAX_DB * 2}
          disabled={!caps.supportsGain}
          onChange={(v) => onChange({ ...band, gain: v / 2 })}
        />
      )}
      {!crossover && (
        <ParamSlider
          label="Q"
          display={band.q.toFixed(2)}
          value={logToPos(band.q, EQ_BAND_Q_MIN, EQ_BAND_Q_MAX)}
          min={0}
          max={STEPS}
          disabled={!caps.supportsQ}
          onChange={(p) => onChange({ ...band, q: Math.round(posToLog(p, EQ_BAND_Q_MIN, EQ_BAND_Q_MAX) * 100) / 100 })}
        />
      )}
    </div>
  );
}

function TargetPicker({
  amps,
  targets,
  onChange
}: {
  amps: RemoteAmp[];
  targets: SystemEqTarget[];
  onChange: (targets: SystemEqTarget[]) => void;
}) {
  const keyOf = (mac: string, channel: number) => `${mac.toUpperCase()}#${channel}`;
  const selected = new Set(targets.map((t) => keyOf(t.mac, t.channel)));
  const all = amps.flatMap((amp) => amp.channels.map((ch) => ({ mac: amp.mac.toUpperCase(), channel: ch.index })));
  const allSelected = all.length > 0 && all.every((t) => selected.has(keyOf(t.mac, t.channel)));

  const toggle = (mac: string, channel: number) => {
    const key = keyOf(mac, channel);
    onChange(
      selected.has(key)
        ? targets.filter((t) => keyOf(t.mac, t.channel) !== key)
        : [...targets, { mac: mac.toUpperCase(), channel }]
    );
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Applies to inputs</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(allSelected ? [] : all)}
          disabled={all.length === 0}
        >
          {allSelected ? "Clear" : "Select all"}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        The system EQ replaces the input EQ on every selected channel. Output EQ and speaker presets are not touched.
      </p>
      <div className="flex flex-col gap-3">
        {amps.map((amp) => (
          <div key={amp.mac}>
            <div className="mb-1 text-sm font-medium">{amp.name}</div>
            <div className="flex flex-wrap gap-2">
              {amp.channels.map((ch) => {
                const on = selected.has(keyOf(amp.mac, ch.index));
                return (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() => toggle(amp.mac, ch.index)}
                    aria-pressed={on}
                    className={cn(
                      "h-10 rounded-md border px-3 text-sm transition-colors",
                      on ? "border-chart-1 bg-chart-1 text-background" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {ch.inputName.trim() || `In ${ch.index + 1}`}
                  </button>
                );
              })}
              {amp.channels.length === 0 && <span className="text-xs text-muted-foreground">Offline</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export interface SystemEqViewProps {
  amps: RemoteAmp[];
  bands: EqBand[];
  targets: SystemEqTarget[];
  status: string | null;
  onBandsChange: (bands: EqBand[]) => void;
  onTargetsChange: (targets: SystemEqTarget[]) => void;
  onResend: () => void;
}

export function SystemEqView({
  amps,
  bands,
  targets,
  status,
  onBandsChange,
  onTargetsChange,
  onResend
}: SystemEqViewProps) {
  const [selected, setSelected] = useState(1);

  const updateBand = (index: number, band: EqBand) => {
    onBandsChange(bands.map((b, i) => (i === index ? band : b)));
  };

  const flatten = () => onBandsChange(bands.map((b, i) => (isCrossover(i) ? b : { ...b, gain: 0 })));

  return (
    <div className="flex flex-col gap-4">
      <EqCurve
        bands={bands}
        selected={selected}
        onSelect={setSelected}
        onDrag={(index, freq, gain) => updateBand(index, { ...bands[index], freq, gain: gain ?? bands[index].gain })}
      />

      <div className="grid grid-cols-10 gap-1">
        {bands.map((band, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelected(index)}
            className={cn(
              "h-10 rounded-md border text-sm font-medium",
              index === selected ? "border-chart-1 bg-chart-1 text-background" : "bg-secondary",
              band.bypass && index !== selected && "text-muted-foreground line-through"
            )}
          >
            {EQ_BAND_SHORT_LABELS[index]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BandEditor band={bands[selected]} index={selected} onChange={(band) => updateBand(selected, band)} />
        <TargetPicker amps={amps} targets={targets} onChange={onTargetsChange} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={flatten}>
          <RotateCcw /> Flatten gains
        </Button>
        <Button variant="outline" onClick={onResend} disabled={targets.length === 0}>
          <Send /> Resend to amps
        </Button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}
