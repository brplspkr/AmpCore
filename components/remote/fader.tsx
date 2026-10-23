"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const FADER_STEPS = 1000;

interface FaderProps {
  /** 0…1 travel position */
  position: number;
  onPositionChange: (position: number) => void;
  disabled?: boolean;
  muted?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Touch-sized horizontal fader. Position is linear travel; callers apply the dB taper. */
export function Fader({ position, onPositionChange, disabled, muted, className, ...props }: FaderProps) {
  return (
    <SliderPrimitive.Root
      value={[Math.round(position * FADER_STEPS)]}
      min={0}
      max={FADER_STEPS}
      step={1}
      disabled={disabled}
      onValueChange={(values) => onPositionChange((values[0] ?? 0) / FADER_STEPS)}
      className={cn(
        "relative flex h-11 w-full touch-none items-center select-none data-disabled:opacity-40",
        className
      )}
      aria-label={props["aria-label"]}
    >
      <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className={cn("absolute h-full", muted ? "bg-muted-foreground/40" : "bg-chart-1")} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-9 w-5 rounded-md border border-border bg-foreground shadow-md outline-none focus-visible:ring-4 focus-visible:ring-ring/50" />
    </SliderPrimitive.Root>
  );
}
