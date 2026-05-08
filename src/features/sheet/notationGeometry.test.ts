import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import {
  FIRST_MEASURE_LEFT_PADDING,
  FIRST_STAFF_Y,
  MEASURES_PER_SYSTEM,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_RIGHT,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getMeasureRight,
  getMeasureSlotWeight,
  getMeasureWidth,
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

  it('widens a measure when short note boundaries add extra input slots', () => {
    const score = placeScoreEvent(
      createEmptyScore('treble', { measureCount: 4 }),
      {
        eventId: 'eighth-note-1',
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'eighth',
        entryMode: 'note',
        pitch: { step: 'E', octave: 4 },
      },
    );

    expect(getMeasureSlotWeight(score, 0)).toBe(5);
    expect(getMeasureSlotWeight(score, 1)).toBe(4);
    expect(getMeasureWidth(0, score)).toBeGreaterThan(getMeasureWidth(1, score));
    expect(getMeasureRight(3, score)).toBeCloseTo(STAFF_RIGHT, 2);
    expect(getBeatX(0, 0.5, 4, score)).toBeGreaterThan(getBeatX(0, 0.5, 4));
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
