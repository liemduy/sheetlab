import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import type { MusicPosition } from '../sheet/interaction';
import {
  advanceInputCursor,
  createInputCursorFromPosition,
  formatInputCursor,
  updateInputCursorDuration,
} from './inputCursor';

function createPosition(
  beat: number,
  measureIndex = 0,
  staffId: MusicPosition['staffId'] = 'treble',
  staffIndex = 0,
): MusicPosition {
  return {
    beat,
    measureIndex,
    pitch: { step: 'B', octave: 4 },
    staffId,
    staffIndex,
    x: 0,
    y: 0,
  };
}

describe('input cursor', () => {
  it('creates a cursor from the current music position', () => {
    const cursor = createInputCursorFromPosition(createPosition(1), 'quarter');

    expect(cursor).toMatchObject({
      beat: 1,
      duration: 'quarter',
      measureIndex: 0,
      mode: 'note-input',
      staffId: 'treble',
    });
    expect(formatInputCursor(cursor)).toBe('treble M1 B2 B4');
  });

  it('advances by the active duration inside the current measure', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const cursor = createInputCursorFromPosition(createPosition(0), 'quarter');

    expect(advanceInputCursor(score, cursor)).toMatchObject({
      beat: 1,
      measureIndex: 0,
    });
  });

  it('advances a half note to beat three', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const cursor = createInputCursorFromPosition(createPosition(0), 'half');

    expect(advanceInputCursor(score, cursor)).toMatchObject({
      beat: 2,
      measureIndex: 0,
    });
  });

  it('advances across barlines when the duration reaches the next measure', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const cursor = createInputCursorFromPosition(createPosition(3), 'quarter');

    expect(advanceInputCursor(score, cursor)).toMatchObject({
      beat: 0,
      measureIndex: 1,
    });
  });

  it('keeps the staff when advancing a grand-staff bass cursor', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const cursor = createInputCursorFromPosition(
      createPosition(0, 0, 'bass', 1),
      'whole',
    );

    expect(advanceInputCursor(score, cursor)).toMatchObject({
      beat: 0,
      measureIndex: 1,
      staffId: 'bass',
      staffIndex: 1,
    });
  });

  it('updates duration without moving the cursor', () => {
    const cursor = createInputCursorFromPosition(createPosition(1), 'quarter');

    expect(updateInputCursorDuration(cursor, 'eighth')).toMatchObject({
      beat: 1,
      duration: 'eighth',
      measureIndex: 0,
    });
  });
});
