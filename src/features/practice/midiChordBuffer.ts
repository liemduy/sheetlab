export const MIDI_CHORD_SETTLE_MS = 70;

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
