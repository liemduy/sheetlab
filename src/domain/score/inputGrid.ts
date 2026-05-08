import { getDurationBeats } from './durations';
import type { DurationValue } from './types';

function roundBeat(beat: number) {
  return Number(beat.toFixed(4));
}

export function getInputGridStepBeats(duration: DurationValue, dots = 0) {
  return getDurationBeats(duration, dots);
}

export function getInputSlotBeats(
  duration: DurationValue,
  beatsPerMeasure: number,
  dots = 0,
) {
  const durationBeats = getInputGridStepBeats(duration, dots);
  const slotCount = Math.max(1, Math.floor(beatsPerMeasure / durationBeats));

  return Array.from({ length: slotCount }, (_, slotIndex) =>
    roundBeat(slotIndex * durationBeats),
  );
}

export function snapBeatToInputSlot(
  beat: number,
  duration: DurationValue,
  beatsPerMeasure: number,
  dots = 0,
) {
  const durationBeats = getInputGridStepBeats(duration, dots);
  const maxBeat = Math.max(0, beatsPerMeasure - durationBeats);
  const snappedBeat = Math.round(beat / durationBeats) * durationBeats;

  return roundBeat(Math.min(maxBeat, Math.max(0, snappedBeat)));
}
