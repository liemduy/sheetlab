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
  SVG_WIDTH,
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

  it('keeps staff systems near 1.2cm paper margins on the 920-unit page', () => {
    const expectedMargin = 36;

    expect(STAFF_LEFT).toBe(expectedMargin);
    expect(SVG_WIDTH - STAFF_RIGHT).toBe(expectedMargin);
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

  it('keeps sparse measures readable when a neighboring measure is dense', () => {
    const score = Array.from({ length: 16 }, (_, index) => index).reduce(
      (currentScore, index) =>
        placeScoreEvent(currentScore, {
          eventId: `dense-sixteenth-${index}`,
          staffId: 'treble',
          measureIndex: 0,
          beat: index / 4,
          duration: 'sixteenth',
          entryMode: 'note',
          pitch: {
            step: index % 2 === 0 ? 'E' : 'G',
            octave: 4,
          },
        }),
      createEmptyScore('treble', { measureCount: 4 }),
    );
    const denseMeasureWidth = getMeasureWidth(0, score);
    const sparseMeasureWidth = getMeasureWidth(1, score);

    expect(denseMeasureWidth).toBeGreaterThan(sparseMeasureWidth);
    expect(sparseMeasureWidth).toBeGreaterThan(150);
    expect(denseMeasureWidth / sparseMeasureWidth).toBeLessThan(2);
    expect(getMeasureRight(3, score)).toBeCloseTo(STAFF_RIGHT, 2);
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
