import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import type { Score, ScoreEvent, StaffId } from '../../domain/score/types';
import { buildFingeringHints } from './fingeringHints';

function withMeasureEvents(
  score: Score,
  staffId: StaffId,
  events: ScoreEvent[],
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 0
                  ? {
                      ...measure,
                      voices: [{ ...measure.voices[0], events }],
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };
}

describe('buildFingeringHints', () => {
  it('suggests a natural right-hand scale shape for treble notes', () => {
    const score = withMeasureEvents(createEmptyScore('treble', { measureCount: 1 }), 'treble', [
      {
        beat: 0,
        duration: 'quarter',
        id: 'rh-c',
        kind: 'note',
        pitch: { octave: 4, step: 'C' },
      },
      {
        beat: 1,
        duration: 'quarter',
        id: 'rh-d',
        kind: 'note',
        pitch: { octave: 4, step: 'D' },
      },
      {
        beat: 2,
        duration: 'quarter',
        id: 'rh-e',
        kind: 'note',
        pitch: { octave: 4, step: 'E' },
      },
      {
        beat: 3,
        duration: 'quarter',
        id: 'rh-f',
        kind: 'note',
        pitch: { octave: 4, step: 'F' },
      },
    ]);

    expect(buildFingeringHints(score).map((hint) => hint.finger)).toEqual([
      1,
      2,
      3,
      4,
    ]);
  });

  it('keeps right-hand triads in low-to-high finger order', () => {
    const score = withMeasureEvents(createEmptyScore('treble', { measureCount: 1 }), 'treble', [
      {
        beat: 0,
        duration: 'whole',
        id: 'rh-triad',
        kind: 'chord',
        pitches: [
          { octave: 4, step: 'C' },
          { octave: 4, step: 'E' },
          { octave: 4, step: 'G' },
        ],
      },
    ]);

    const hints = buildFingeringHints(score);

    expect(hints.map((hint) => [hint.pitchIndex, hint.finger])).toEqual([
      [0, 1],
      [1, 3],
      [2, 5],
    ]);
    expect(hints.every((hint) => hint.hand === 'right')).toBe(true);
  });

  it('reverses the natural shape for left-hand bass notes', () => {
    const score = withMeasureEvents(createEmptyScore('grand', { measureCount: 1 }), 'bass', [
      {
        beat: 0,
        duration: 'quarter',
        id: 'lh-c',
        kind: 'note',
        pitch: { octave: 3, step: 'C' },
      },
      {
        beat: 1,
        duration: 'quarter',
        id: 'lh-d',
        kind: 'note',
        pitch: { octave: 3, step: 'D' },
      },
      {
        beat: 2,
        duration: 'quarter',
        id: 'lh-e',
        kind: 'note',
        pitch: { octave: 3, step: 'E' },
      },
      {
        beat: 3,
        duration: 'quarter',
        id: 'lh-f',
        kind: 'note',
        pitch: { octave: 3, step: 'F' },
      },
    ]);

    expect(buildFingeringHints(score).map((hint) => hint.finger)).toEqual([
      5,
      4,
      3,
      2,
    ]);
  });
});
