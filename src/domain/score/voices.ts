import type { Measure, StaffId, Voice } from './types';

export function normalizeVoiceIndex(voiceIndex?: number) {
  if (typeof voiceIndex !== 'number' || !Number.isFinite(voiceIndex)) {
    return 0;
  }

  return Math.max(0, Math.floor(voiceIndex));
}

export function createVoiceId(
  staffId: StaffId,
  measureIndex: number,
  voiceIndex: number,
) {
  return voiceIndex === 0
    ? `voice-${staffId}-${measureIndex + 1}-main`
    : `voice-${staffId}-${measureIndex + 1}-voice-${voiceIndex + 1}`;
}

export function createEmptyVoice(
  staffId: StaffId,
  measureIndex: number,
  voiceIndex: number,
): Voice {
  return {
    id: createVoiceId(staffId, measureIndex, voiceIndex),
    events: [],
  };
}

export function ensureMeasureVoiceCount(
  measure: Measure,
  staffId: StaffId,
  voiceIndex: number,
): Measure {
  const normalizedVoiceIndex = normalizeVoiceIndex(voiceIndex);

  if (measure.voices[normalizedVoiceIndex]) {
    return measure;
  }

  return {
    ...measure,
    voices: [
      ...measure.voices,
      ...Array.from(
        { length: normalizedVoiceIndex - measure.voices.length + 1 },
        (_, offset) =>
          createEmptyVoice(
            staffId,
            measure.index,
            measure.voices.length + offset,
          ),
      ),
    ],
  };
}
