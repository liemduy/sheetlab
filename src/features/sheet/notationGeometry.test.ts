import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import {
  FIRST_MEASURE_LEFT_PADDING,
  FIRST_STAFF_Y,
  MEASURES_PER_SYSTEM,
  STAFF_GAP,
  STAFF_LEFT,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getMeasureX,
  getScoreSystemGap,
  getStaffTop,
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

  it('wraps measure x positions and moves later systems down the page', () => {
    const score = createEmptyScore('treble');
    const systemGap = getScoreSystemGap(score);

    expect(getMeasureX(MEASURES_PER_SYSTEM)).toBe(getMeasureX(0));
    expect(
      getStaffTop(0, STAFF_GAP, MEASURES_PER_SYSTEM, systemGap),
    ).toBe(getStaffTop(0, STAFF_GAP, 0, systemGap) + systemGap);
    expect(
      getPitchY(
        { step: 'B', octave: 4 },
        'treble',
        0,
        STAFF_GAP,
        MEASURES_PER_SYSTEM,
        systemGap,
      ),
    ).toBe(
      getPitchY({ step: 'B', octave: 4 }, 'treble', 0, STAFF_GAP, 0, systemGap) +
        systemGap,
    );
  });
});
