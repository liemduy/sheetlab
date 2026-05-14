import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import { placeScoreEvent } from './editing';
import {
  applyActiveOttavaToPitch,
  getActiveOttavaOctaveShift,
  getOttavaMarkForSource,
  tryClearOttavaForEvent,
  tryToggleOttavaToNext,
} from './ottava';

function createTwoNoteScore() {
  const firstScore = placeScoreEvent(createEmptyScore('treble'), {
    beat: 0,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'ottava-source',
    measureIndex: 0,
    pitch: { step: 'C', octave: 4 },
    staffId: 'treble',
  });

  return placeScoreEvent(firstScore, {
    beat: 1,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'ottava-target',
    measureIndex: 0,
    pitch: { step: 'D', octave: 4 },
    staffId: 'treble',
  });
}

describe('ottava marks', () => {
  it('toggles an ottava range from the selected note to the next pitched note', () => {
    const result = tryToggleOttavaToNext(createTwoNoteScore(), 'ottava-source', '8va');

    expect(result.updated).toBe(true);
    expect(getOttavaMarkForSource(result.score, 'ottava-source')).toMatchObject({
      kind: 'ottava',
      ottava: '8va',
      placement: 'above',
      scope: 'range',
      sourceEventId: 'ottava-source',
      targetEventId: 'ottava-target',
      start: {
        beat: 0,
        measureIndex: 0,
        staffId: 'treble',
        voiceIndex: 0,
      },
      end: {
        beat: 2,
        measureIndex: 0,
        staffId: 'treble',
        voiceIndex: 0,
      },
    });
  });

  it('toggles the same ottava off without leaving an empty marks array', () => {
    const markedScore = tryToggleOttavaToNext(
      createTwoNoteScore(),
      'ottava-source',
      '8va',
    ).score;
    const result = tryToggleOttavaToNext(markedScore, 'ottava-source', '8va');

    expect(result.updated).toBe(true);
    expect(result.score.marks).toBeUndefined();
  });

  it('clears an ottava mark from its source event', () => {
    const markedScore = tryToggleOttavaToNext(
      createTwoNoteScore(),
      'ottava-source',
      '15mb',
    ).score;
    const result = tryClearOttavaForEvent(markedScore, 'ottava-source');

    expect(result.updated).toBe(true);
    expect(result.score.marks).toBeUndefined();
  });

  it('applies octave shift only inside the marked range', () => {
    const markedScore = tryToggleOttavaToNext(
      createTwoNoteScore(),
      'ottava-source',
      '15ma',
    ).score;

    expect(getActiveOttavaOctaveShift(markedScore, 'treble', 0, 0)).toBe(2);
    expect(getActiveOttavaOctaveShift(markedScore, 'treble', 0, 1.5)).toBe(2);
    expect(getActiveOttavaOctaveShift(markedScore, 'treble', 0, 2)).toBe(0);
    expect(
      applyActiveOttavaToPitch(markedScore, 'treble', 0, 1, {
        octave: 4,
        step: 'E',
      }),
    ).toEqual({ octave: 6, step: 'E' });
  });

  it('rejects ottava creation when there is no next pitched target', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'last-note',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const result = tryToggleOttavaToNext(score, 'last-note', '8vb');

    expect(result).toMatchObject({
      reason: 'target-not-found',
      updated: false,
    });
    expect(result.score).toBe(score);
  });
});
