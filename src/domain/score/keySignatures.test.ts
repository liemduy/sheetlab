import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import {
  applyKeySignatureToPitch,
  getActiveKeySignature,
  getKeySignatureAccidentalCount,
  getKeySignatureAccidentalMap,
} from './keySignatures';
import { setMeasureKeySignature } from './editing';

describe('key signatures', () => {
  it('maps common sharp and flat keys to the correct accidental sets', () => {
    expect(getKeySignatureAccidentalCount('D')).toBe(2);
    expect(getKeySignatureAccidentalMap('D')).toEqual(
      new Map([
        ['F', 'sharp'],
        ['C', 'sharp'],
      ]),
    );
    expect(getKeySignatureAccidentalCount('Bb')).toBe(-2);
    expect(getKeySignatureAccidentalMap('Bb')).toEqual(
      new Map([
        ['B', 'flat'],
        ['E', 'flat'],
      ]),
    );
  });

  it('resolves the active key signature from the latest measure change', () => {
    const score = setMeasureKeySignature(
      setMeasureKeySignature(createEmptyScore('treble', { measureCount: 4 }), 0, 'G'),
      2,
      'F',
    );

    expect(getActiveKeySignature(score, 0)).toBe('G');
    expect(getActiveKeySignature(score, 1)).toBe('G');
    expect(getActiveKeySignature(score, 2)).toBe('F');
    expect(getActiveKeySignature(score, 3)).toBe('F');
  });

  it('does not override explicit accidentals on a pitch', () => {
    expect(
      applyKeySignatureToPitch({ step: 'F', octave: 4 }, 'G'),
    ).toEqual({
      accidental: 'sharp',
      octave: 4,
      step: 'F',
    });
    expect(
      applyKeySignatureToPitch({ step: 'F', octave: 4, accidental: 'natural' }, 'G'),
    ).toEqual({
      accidental: 'natural',
      octave: 4,
      step: 'F',
    });
  });
});
