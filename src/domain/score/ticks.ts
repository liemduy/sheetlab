import { getDurationBeats } from './durations';
import type { DurationValue, TimeSignature } from './types';

export const TICKS_PER_QUARTER = 480;

export function getDurationTicks(duration: DurationValue) {
  return getDurationBeats(duration) * TICKS_PER_QUARTER;
}

export function getMeasureTicks(timeSignature: TimeSignature) {
  return timeSignature.beats * TICKS_PER_QUARTER;
}

export function beatToTick(beat: number) {
  return Math.round(beat * TICKS_PER_QUARTER);
}

export function tickToBeat(tick: number) {
  return Number((tick / TICKS_PER_QUARTER).toFixed(4));
}

export function roundTick(tick: number) {
  return Math.round(tick);
}
