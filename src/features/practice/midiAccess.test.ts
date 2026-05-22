import { describe, expect, it } from 'vitest';
import {
  formatMidiNote,
  getMidiSupportStatus,
  isSustainPedalEvent,
  parseMidiMessage,
} from './midiAccess';

describe('midi access helpers', () => {
  it('parses note on and note off messages', () => {
    expect(parseMidiMessage({ data: [0x90, 60, 96], timeStamp: 12 })).toEqual({
      channel: 1,
      midiNote: 60,
      rawData: [0x90, 60, 96],
      timestampMs: 12,
      type: 'note-on',
      velocity: 96,
    });
    expect(parseMidiMessage({ data: [0x90, 60, 0], timeStamp: 18 })).toMatchObject({
      midiNote: 60,
      type: 'note-off',
    });
    expect(parseMidiMessage({ data: [0x80, 60, 40], timeStamp: 19 })).toMatchObject({
      midiNote: 60,
      type: 'note-off',
    });
  });

  it('parses sustain pedal control changes', () => {
    const event = parseMidiMessage({ data: [0xb0, 64, 127], timeStamp: 30 });

    expect(event).toMatchObject({
      controller: 64,
      type: 'control-change',
      value: 127,
    });
    expect(event && isSustainPedalEvent(event)).toBe(true);
  });

  it('formats MIDI note names', () => {
    expect(formatMidiNote(60)).toBe('C4');
    expect(formatMidiNote(61)).toBe('C#4');
    expect(formatMidiNote(58)).toBe('Bb3');
  });

  it('detects insecure and unsupported browser states', () => {
    expect(
      getMidiSupportStatus({
        isSecureContext: false,
        navigatorLike: {},
      }),
    ).toBe('insecure');
    expect(
      getMidiSupportStatus({
        isSecureContext: true,
        navigatorLike: {},
      }),
    ).toBe('unsupported');
    expect(
      getMidiSupportStatus({
        isSecureContext: true,
        navigatorLike: { requestMIDIAccess: async () => ({ inputs: new Map(), onstatechange: null }) },
      }),
    ).toBe('idle');
  });
});
