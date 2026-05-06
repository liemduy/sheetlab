import type { DurationValue } from './types';

export const DURATION_BEATS: Record<DurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
};

export function getDurationBeats(duration: DurationValue) {
  return DURATION_BEATS[duration];
}
