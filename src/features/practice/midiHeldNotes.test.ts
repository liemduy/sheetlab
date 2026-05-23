import { describe, expect, it } from 'vitest';
import {
  applyMidiHeldNoteEvent,
  createMidiHeldNoteState,
  getActiveMidiNotesForHeldState,
} from './midiHeldNotes';

describe('midi held note state', () => {
  it('keeps released notes active while sustain pedal is down', () => {
    const noteOn = {
      channel: 1,
      midiNote: 60,
      rawData: [0x90, 60, 96],
      timestampMs: 0,
      type: 'note-on' as const,
      velocity: 96,
    };
    const noteOff = {
      channel: 1,
      midiNote: 60,
      rawData: [0x80, 60, 0],
      timestampMs: 20,
      type: 'note-off' as const,
      velocity: 0,
    };
    const pedalDown = {
      channel: 1,
      controller: 64,
      rawData: [0xb0, 64, 127],
      timestampMs: 10,
      type: 'control-change' as const,
      value: 127,
    };
    const pedalUp = {
      ...pedalDown,
      rawData: [0xb0, 64, 0],
      timestampMs: 30,
      value: 0,
    };

    const sustainedState = [noteOn, pedalDown, noteOff].reduce(
      applyMidiHeldNoteEvent,
      createMidiHeldNoteState(),
    );

    expect(getActiveMidiNotesForHeldState(sustainedState)).toEqual([60]);
    expect(
      getActiveMidiNotesForHeldState(
        applyMidiHeldNoteEvent(sustainedState, pedalUp),
      ),
    ).toEqual([]);
  });
});
