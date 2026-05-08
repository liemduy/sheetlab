import { describe, expect, it } from 'vitest';
import {
  getInputSlotBeats,
  snapBeatToInputSlot,
} from './inputGrid';

describe('input grid', () => {
  it('snaps to the active duration grid', () => {
    expect(snapBeatToInputSlot(1.22, 'quarter', 4)).toBe(1);
    expect(snapBeatToInputSlot(1.22, 'eighth', 4)).toBe(1);
    expect(snapBeatToInputSlot(1.22, 'sixteenth', 4)).toBe(1.25);
    expect(snapBeatToInputSlot(1.12, 'thirtySecond', 4)).toBe(1.125);
  });

  it('keeps supported dotted durations inside the measure', () => {
    expect(getInputSlotBeats('quarter', 4, 1)).toEqual([0, 1.5]);
    expect(snapBeatToInputSlot(3.9, 'quarter', 4, 1)).toBe(2.5);
  });
});
