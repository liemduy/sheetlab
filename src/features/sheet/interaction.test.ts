import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { STAFF_LEFT, getMeasureContentLeft } from './layout';
import { formatPitch, mapPointToMusicPosition } from './interaction';
import { getBeatX, getPitchY } from './notationGeometry';

describe('sheet interaction mapping', () => {
  it('maps a treble staff point to staff, measure, beat, and pitch', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(1, 1, score.timeSignature.beats),
        y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId: 'treble',
      staffIndex: 0,
      measureIndex: 1,
      beat: 1,
    });
    expect(result ? formatPitch(result.pitch) : null).toBe('E4');
  });

  it('maps bass staff points in a grand staff score', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(2, 2, score.timeSignature.beats),
        y: getPitchY({ step: 'D', octave: 3 }, 'bass', 1),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId: 'bass',
      staffIndex: 1,
      measureIndex: 2,
      beat: 2,
    });
    expect(result ? formatPitch(result.pitch) : null).toBe('D3');
  });

  it('clamps pointer positions before the note content area to beat zero', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getMeasureContentLeft(0) - 24,
        y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      },
      score,
    );

    expect(result).toMatchObject({
      measureIndex: 0,
      beat: 0,
    });
  });

  it('returns null outside the editable staff area', () => {
    const score = createEmptyScore('treble');

    expect(mapPointToMusicPosition({ x: 20, y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0) }, score)).toBeNull();
    expect(mapPointToMusicPosition({ x: STAFF_LEFT, y: 20 }, score)).toBeNull();
  });
});
