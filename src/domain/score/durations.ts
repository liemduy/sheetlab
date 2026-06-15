import type { DurationValue } from './types';

export const DURATION_BEATS: Record<DurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtySecond: 0.125,
  sixtyFourth: 0.0625,
};

export function getDurationDotMultiplier(dots = 0) {
  let multiplier = 1;
  let dotValue = 0.5;

  for (let dotIndex = 0; dotIndex < dots; dotIndex += 1) {
    multiplier += dotValue;
    dotValue /= 2;
  }

  return multiplier;
}

export function getDurationBeats(duration: DurationValue, dots = 0) {
  return DURATION_BEATS[duration] * getDurationDotMultiplier(dots);
}
