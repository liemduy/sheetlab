import type { TimeSignature } from './types';

export const TIME_SIGNATURE_OPTIONS = [
  { beats: 2, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 4, beatUnit: 4 },
  { beats: 5, beatUnit: 4 },
  { beats: 6, beatUnit: 8 },
  { beats: 9, beatUnit: 8 },
  { beats: 12, beatUnit: 8 },
] satisfies readonly TimeSignature[];

export function getTimeSignatureId(timeSignature: TimeSignature) {
  return `${timeSignature.beats}/${timeSignature.beatUnit}`;
}

export function getTimeSignatureLabel(timeSignature: TimeSignature) {
  return getTimeSignatureId(timeSignature);
}

export function parseTimeSignatureId(value: string): TimeSignature | null {
  const match = /^(\d+)\/(\d+)$/.exec(value);

  if (!match) {
    return null;
  }

  const beats = Number(match[1]);
  const beatUnit = Number(match[2]);

  return TIME_SIGNATURE_OPTIONS.some(
    (option) => option.beats === beats && option.beatUnit === beatUnit,
  )
    ? { beats, beatUnit }
    : null;
}

export function getMeasureBeats(timeSignature: TimeSignature) {
  return timeSignature.beats * (4 / timeSignature.beatUnit);
}
