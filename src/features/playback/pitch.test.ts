import { describe, expect, it } from 'vitest';
import { midiToFrequency, pitchToMidi, pitchToToneNote } from './pitch';

describe('playback pitch helpers', () => {
  it('converts pitch to midi and frequency', () => {
    expect(pitchToMidi({ step: 'A', octave: 4 })).toBe(69);
    expect(midiToFrequency(69)).toBe(440);
  });

  it('formats pitch names for Tone.js', () => {
    expect(pitchToToneNote({ step: 'C', octave: 4, accidental: 'sharp' })).toBe(
      'C#4',
    );
    expect(pitchToToneNote({ step: 'B', octave: 3, accidental: 'flat' })).toBe(
      'Bb3',
    );
  });
});
