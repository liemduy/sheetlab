import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_QUARTER,
  beatToTick,
  getDurationTicks,
  getMeasureTicks,
  tickToBeat,
} from './ticks';

describe('score ticks', () => {
  it('uses 480 ticks as the quarter-note base unit', () => {
    expect(TICKS_PER_QUARTER).toBe(480);
    expect(getDurationTicks('whole')).toBe(1920);
    expect(getDurationTicks('half')).toBe(960);
    expect(getDurationTicks('quarter')).toBe(480);
    expect(getDurationTicks('eighth')).toBe(240);
    expect(getDurationTicks('sixteenth')).toBe(120);
    expect(getDurationTicks('thirtySecond')).toBe(60);
  });

  it('derives measure ticks from the time signature beats', () => {
    expect(getMeasureTicks({ beats: 4, beatUnit: 4 })).toBe(1920);
    expect(getMeasureTicks({ beats: 3, beatUnit: 4 })).toBe(1440);
  });

  it('converts between beat offsets and tick offsets', () => {
    expect(beatToTick(2.5)).toBe(1200);
    expect(tickToBeat(1200)).toBe(2.5);
    expect(tickToBeat(60)).toBe(0.125);
  });
});
