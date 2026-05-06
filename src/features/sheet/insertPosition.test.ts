import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import type { MusicPosition } from './interaction';
import { snapInsertPositionToEventBoundary } from './insertPosition';

function createPosition(beat: number): MusicPosition {
  return {
    staffId: 'treble',
    staffIndex: 0,
    measureIndex: 0,
    beat,
    pitch: { step: 'E', octave: 4 },
    x: 0,
    y: 0,
  };
}

describe('insert position snapping', () => {
  it('snaps a click inside an existing event to the nearest event boundary', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-half',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });

    expect(snapInsertPositionToEventBoundary(score, createPosition(1.5))).toMatchObject({
      beat: 2,
    });
    expect(snapInsertPositionToEventBoundary(score, createPosition(0.5))).toMatchObject({
      beat: 0,
    });
  });

  it('keeps already valid insertion beats unchanged', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-quarter',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });

    expect(snapInsertPositionToEventBoundary(score, createPosition(1))).toMatchObject({
      beat: 1,
    });
    expect(snapInsertPositionToEventBoundary(score, createPosition(2))).toMatchObject({
      beat: 2,
    });
  });

  it('prefers the forward boundary at the midpoint between adjacent quarter notes', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-quarter',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });

    expect(snapInsertPositionToEventBoundary(score, createPosition(0.5))).toMatchObject({
      beat: 1,
    });
  });
});
