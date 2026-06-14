export type MidiChordTimingLevel = 'beginner' | 'normal' | 'strict';

export const MIDI_CHORD_SETTLE_MS = 100;

export const MIDI_CHORD_SETTLE_MS_BY_TIMING_LEVEL: Record<
  MidiChordTimingLevel,
  number
> = {
  beginner: 160,
  normal: MIDI_CHORD_SETTLE_MS,
  strict: 65,
};

export function mergeBufferedMidiNotes(
  activeMidiNotes: readonly number[],
  bufferedMidiNotes: readonly number[],
) {
  return [...new Set([...activeMidiNotes, ...bufferedMidiNotes])].sort(
    (a, b) => a - b,
  );
}

export function getMidiChordWindowLabel(windowMs = MIDI_CHORD_SETTLE_MS) {
  return `${windowMs}ms`;
}

export function getMidiChordSettleMs(
  timingLevel: MidiChordTimingLevel = 'normal',
) {
  return MIDI_CHORD_SETTLE_MS_BY_TIMING_LEVEL[timingLevel];
}
