import { describe, expect, it } from 'vitest';
import {
  getMidiChordWindowLabel,
  mergeBufferedMidiNotes,
} from './midiChordBuffer';

describe('midi chord buffering', () => {
  it('merges active and freshly buffered notes into a sorted chord', () => {
    expect(mergeBufferedMidiNotes([64, 60], [67, 60])).toEqual([60, 64, 67]);
  });

  it('formats the chord settle window label', () => {
    expect(getMidiChordWindowLabel(70)).toBe('70ms');
  });
});
