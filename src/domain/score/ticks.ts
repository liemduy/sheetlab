import { getDurationBeats } from './durations';
import type { DurationValue, TimeSignature } from './types';

export const TICKS_PER_QUARTER = 480;

const DURATION_VALUES_DESC: DurationValue[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  'sixteenth',
  'thirtySecond',
];

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

export function splitTicksIntoDurations(ticks: number): DurationValue[] {
  const durations: DurationValue[] = [];
  let remainingTicks = roundTick(ticks);

  for (const duration of DURATION_VALUES_DESC) {
    const durationTicks = getDurationTicks(duration);

    while (remainingTicks >= durationTicks) {
      durations.push(duration);
      remainingTicks -= durationTicks;
    }
  }

  if (remainingTicks !== 0) {
    throw new Error(`Cannot represent ${ticks} ticks with supported durations`);
  }

  return durations;
}
