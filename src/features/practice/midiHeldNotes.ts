import {
  isSustainPedalEvent,
  type ParsedMidiEvent,
} from './midiAccess';

export interface MidiHeldNoteState {
  physicalMidiNotes: number[];
  sustainedMidiNotes: number[];
  sustainPedalDown: boolean;
}

const EMPTY_HELD_NOTE_STATE: MidiHeldNoteState = {
  physicalMidiNotes: [],
  sustainedMidiNotes: [],
  sustainPedalDown: false,
};

function uniqueSorted(notes: readonly number[]) {
  return [...new Set(notes)].sort((a, b) => a - b);
}

function removeNote(notes: readonly number[], midiNote: number) {
  return notes.filter((note) => note !== midiNote);
}

export function createMidiHeldNoteState(): MidiHeldNoteState {
  return { ...EMPTY_HELD_NOTE_STATE };
}

export function getActiveMidiNotesForHeldState(state: MidiHeldNoteState) {
  return uniqueSorted([
    ...state.physicalMidiNotes,
    ...state.sustainedMidiNotes,
  ]);
}

export function applyMidiHeldNoteEvent(
  state: MidiHeldNoteState,
  event: ParsedMidiEvent,
): MidiHeldNoteState {
  if (event.type === 'note-on') {
    return {
      ...state,
      physicalMidiNotes: uniqueSorted([
        ...state.physicalMidiNotes,
        event.midiNote,
      ]),
      sustainedMidiNotes: removeNote(state.sustainedMidiNotes, event.midiNote),
    };
  }

  if (event.type === 'note-off') {
    const physicalMidiNotes = removeNote(state.physicalMidiNotes, event.midiNote);
    const sustainedMidiNotes = state.sustainPedalDown
      ? uniqueSorted([...state.sustainedMidiNotes, event.midiNote])
      : removeNote(state.sustainedMidiNotes, event.midiNote);

    return {
      ...state,
      physicalMidiNotes,
      sustainedMidiNotes,
    };
  }

  if (isSustainPedalEvent(event)) {
    const sustainPedalDown = event.value >= 64;

    return {
      ...state,
      sustainPedalDown,
      sustainedMidiNotes: sustainPedalDown ? state.sustainedMidiNotes : [],
    };
  }

  return state;
}
