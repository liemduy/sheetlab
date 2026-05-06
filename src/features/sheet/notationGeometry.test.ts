import { describe, expect, it } from 'vitest';
import {
  FIRST_MEASURE_LEFT_PADDING,
  FIRST_STAFF_Y,
  STAFF_LEFT,
  getMeasureContentLeft,
  getMeasureContentWidth,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';

describe('notation geometry', () => {
  it('maps pitch back to the expected treble staff y coordinate', () => {
    expect(getPitchY({ step: 'E', octave: 4 }, 'treble', 0)).toBe(
      FIRST_STAFF_Y + 44,
    );
  });

  it('maps beat position to the expected measure x coordinate', () => {
    expect(getBeatX(1, 2, 4)).toBe(
      getMeasureContentLeft(1) + getMeasureContentWidth(1) / 2,
    );
  });

  it('reserves first-measure notation space before beat zero', () => {
    expect(getBeatX(0, 0, 4)).toBe(getMeasureContentLeft(0));
    expect(getBeatX(0, 0, 4)).toBeGreaterThan(STAFF_LEFT);
    expect(getBeatX(0, 0, 4) - STAFF_LEFT).toBe(FIRST_MEASURE_LEFT_PADDING);
  });
});
