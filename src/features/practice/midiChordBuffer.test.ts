import { describe, expect, it } from 'vitest';
import {
  getMidiChordSettleMs,
  getMidiChordWindowLabel,
  mergeBufferedMidiNotes,
} from './midiChordBuffer';

describe('midi chord buffering', () => {
  it('merges active and freshly buffered notes into a sorted chord', () => {
    expect(mergeBufferedMidiNotes([64, 60], [67, 60])).toEqual([60, 64, 67]);
  });

  it('formats the chord settle window label', () => {
    expect(getMidiChordWindowLabel(100)).toBe('100ms');
    expect(getMidiChordSettleMs('beginner')).toBe(160);
    expect(getMidiChordSettleMs('strict')).toBe(65);
  });
});
