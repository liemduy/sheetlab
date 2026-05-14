import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import {
  deleteClefChange,
  findClefChange,
  getActiveClef,
  tryMoveClefChange,
  trySetClefChange,
} from './clefChanges';
import { findScoreEvent, placeScoreEvent } from './editing';

describe('clef changes', () => {
  it('sets a staff-level clef change that remains active until another change', () => {
    const score = createEmptyScore('grand', { measureCount: 3 });
    const trebleResult = trySetClefChange(score, 'bass', 0, 2, 'treble');
    const bassResult = trySetClefChange(trebleResult.score, 'bass', 2, 0, 'bass');

    expect(trebleResult.updated).toBe(true);
    expect(bassResult.updated).toBe(true);
    expect(getActiveClef(bassResult.score, 'bass', 0, 1)).toBe('bass');
    expect(getActiveClef(bassResult.score, 'bass', 0, 2)).toBe('treble');
    expect(getActiveClef(bassResult.score, 'bass', 1, 0)).toBe('treble');
    expect(getActiveClef(bassResult.score, 'bass', 2, 0)).toBe('bass');
  });

  it('rejects redundant clef changes that do not alter the active clef', () => {
    const score = createEmptyScore('grand');
    const result = trySetClefChange(score, 'bass', 0, 1, 'bass');

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('redundant-clef');
  });

  it('rejects replacing a selected clef change with the already-active clef', () => {
    const score = createEmptyScore('grand');
    const trebleResult = trySetClefChange(score, 'bass', 0, 1, 'treble');
    const result = trySetClefChange(
      trebleResult.score,
      'bass',
      0,
      1,
      'bass',
    );

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('redundant-clef');
    expect(getActiveClef(result.score, 'bass', 0, 1)).toBe('treble');
  });

  it('moves a clef change and keeps its effect from the new beat onward', () => {
    const score = createEmptyScore('grand');
    const trebleResult = trySetClefChange(score, 'bass', 0, 1, 'treble');
    const clefChangeId =
      trebleResult.score.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const result = tryMoveClefChange(
      trebleResult.score,
      'bass',
      clefChangeId,
      'bass',
      0,
      2,
    );

    expect(result.updated).toBe(true);
    expect(findClefChange(result.score, 'bass', clefChangeId)).toMatchObject({
      change: { beat: 2, clef: 'treble', id: clefChangeId },
      measureIndex: 0,
    });
    expect(getActiveClef(result.score, 'bass', 0, 1)).toBe('bass');
    expect(getActiveClef(result.score, 'bass', 0, 2)).toBe('treble');
  });

  it('rejects moving a clef change onto another clef change', () => {
    const score = createEmptyScore('grand');
    const trebleResult = trySetClefChange(score, 'bass', 0, 1, 'treble');
    const bassResult = trySetClefChange(
      trebleResult.score,
      'bass',
      0,
      2,
      'bass',
    );
    const clefChangeId =
      bassResult.score.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const result = tryMoveClefChange(
      bassResult.score,
      'bass',
      clefChangeId,
      'bass',
      0,
      2,
    );

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('target-occupied');
  });

  it('deletes a clef change so later music inherits the previous clef', () => {
    const score = createEmptyScore('grand');
    const trebleResult = trySetClefChange(score, 'bass', 0, 1, 'treble');
    const clefChangeId =
      trebleResult.score.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const result = deleteClefChange(trebleResult.score, 'bass', clefChangeId);

    expect(findClefChange(result, 'bass', clefChangeId)).toBeNull();
    expect(getActiveClef(result, 'bass', 0, 2)).toBe('bass');
  });

  it('uses the active clef range when placing notes after a clef change', () => {
    const score = createEmptyScore('grand');
    const clefResult = trySetClefChange(score, 'bass', 0, 0, 'treble');
    const nextScore = placeScoreEvent(clefResult.score, {
      eventId: 'left-hand-high-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'A', octave: 5 },
    });

    expect(findScoreEvent(nextScore, 'left-hand-high-note')?.event)
      .toMatchObject({
        pitch: { step: 'A', octave: 5 },
      });
  });
});
