import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import {
  applyKeySignatureToPitch,
  createKeySignatureSymbols,
  getActiveKeySignature,
  getActiveKeySignatureAccidentalMap,
  getActiveKeySignatureSelection,
  getKeySignatureAccidentalCount,
  getKeySignatureAccidentalMap,
  inferKeySignatureFromSymbols,
} from './keySignatures';
import { setMeasureKeySignature, tryMoveKeySignatureSymbol } from './editing';

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

  it('marks edited key-signature symbols as custom but preserves playback accidentals', () => {
    const symbols = createKeySignatureSymbols('G');
    const customSymbols = symbols.map((symbol, index) =>
      index === 0
        ? {
            ...symbol,
            step: 'E' as const,
          }
        : symbol,
    );

    expect(inferKeySignatureFromSymbols(symbols)).toBe('G');
    expect(inferKeySignatureFromSymbols(customSymbols)).toBeNull();
  });

  it('uses dragged key-signature symbols as the active accidental map', () => {
    const scoreWithKey = setMeasureKeySignature(
      createEmptyScore('treble', { measureCount: 2 }),
      0,
      'G',
    );
    const result = tryMoveKeySignatureSymbol(scoreWithKey, 0, 0, {
      octave: 5,
      step: 'E',
    });

    expect(result.moved).toBe(true);
    expect(getActiveKeySignatureSelection(result.score, 0)).toBe('custom');
    expect(getActiveKeySignatureSelection(result.score, 1)).toBe('custom');
    expect(getActiveKeySignatureAccidentalMap(result.score, 1)).toEqual(
      new Map([['E', 'sharp']]),
    );
  });
});
