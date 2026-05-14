import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_QUARTER,
  beatToTick,
  getDurationTicks,
  getMeasureTicks,
  splitTicksIntoDurations,
  tickToBeat,
} from './ticks';

describe('score ticks', () => {
  it('uses a high-resolution quarter-note base unit for tuplets 2 through 9', () => {
    expect(TICKS_PER_QUARTER).toBe(10080);
    expect(getDurationTicks('whole')).toBe(40320);
    expect(getDurationTicks('half')).toBe(20160);
    expect(getDurationTicks('quarter')).toBe(10080);
    expect(getDurationTicks('eighth')).toBe(5040);
    expect(getDurationTicks('sixteenth')).toBe(2520);
    expect(getDurationTicks('thirtySecond')).toBe(1260);
    expect(getDurationTicks('quarter', 1)).toBe(15120);
  });

  it('derives measure ticks from the time signature beats', () => {
    expect(getMeasureTicks({ beats: 4, beatUnit: 4 })).toBe(40320);
    expect(getMeasureTicks({ beats: 3, beatUnit: 4 })).toBe(30240);
  });

  it('converts between beat offsets and tick offsets', () => {
    expect(beatToTick(2.5)).toBe(25200);
    expect(tickToBeat(25200)).toBe(2.5);
    expect(tickToBeat(1260)).toBe(0.125);
  });

  it('splits tick ranges into supported duration values', () => {
    expect(splitTicksIntoDurations(30240)).toEqual(['half', 'quarter']);
    expect(splitTicksIntoDurations(6300)).toEqual(['eighth', 'thirtySecond']);
    expect(() => splitTicksIntoDurations(1259)).toThrow(
      'Cannot represent 1259 ticks with supported durations',
    );
  });
});
