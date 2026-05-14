import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from './editing';
import { createEmptyScore } from './factories';
import {
  getIncomingTiePitchIndexes,
  getTieChainDurationBeats,
  getTieChainEventIds,
  tryToggleSlurToNext,
  tryToggleTieToNext,
} from './noteConnections';

function createTwoNoteScore() {
  const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 1 }), {
    beat: 0,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'tie-source',
    measureIndex: 0,
    pitch: { octave: 4, step: 'C' },
    staffId: 'treble',
  });

  return placeScoreEvent(firstScore, {
    beat: 1,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'tie-target',
    measureIndex: 0,
    pitch: { octave: 4, step: 'C' },
    staffId: 'treble',
  });
}

describe('note connections', () => {
  it('toggles a tie to the adjacent next note with the same pitch', () => {
    const score = createTwoNoteScore();
    const tiedResult = tryToggleTieToNext(score, 'tie-source');

    expect(tiedResult.updated).toBe(true);
    expect(
      tiedResult.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0]
        ?.ties,
    ).toEqual([
      {
        pitchIndex: 0,
        targetEventId: 'tie-target',
        targetPitchIndex: 0,
      },
    ]);
    expect([...getIncomingTiePitchIndexes(tiedResult.score, 'tie-target')])
      .toEqual([0]);
    expect(getTieChainDurationBeats(tiedResult.score, 'tie-source', 0)).toBe(2);
    expect(getTieChainEventIds(tiedResult.score, 'tie-source', 0)).toEqual([
      'tie-source',
      'tie-target',
    ]);

    const untiedResult = tryToggleTieToNext(tiedResult.score, 'tie-source');

    expect(untiedResult.updated).toBe(true);
    expect(
      untiedResult.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0]
        ?.ties,
    ).toBeUndefined();
  });

  it('rejects a tie when the adjacent next note has a different pitch', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 1 }), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'source',
      measureIndex: 0,
      pitch: { octave: 4, step: 'C' },
      staffId: 'treble',
    });
    const score = placeScoreEvent(firstScore, {
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'target',
      measureIndex: 0,
      pitch: { octave: 4, step: 'D' },
      staffId: 'treble',
    });

    expect(tryToggleTieToNext(score, 'source')).toMatchObject({
      score,
      updated: false,
      reason: 'target-not-found',
    });
  });

  it('ignores stale tie data after the target is no longer adjacent', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 1 }), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'stale-source',
      measureIndex: 0,
      pitch: { octave: 4, step: 'C' },
      staffId: 'treble',
    });
    const score = placeScoreEvent(firstScore, {
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'stale-target',
      measureIndex: 0,
      pitch: { octave: 4, step: 'C' },
      staffId: 'treble',
    });
    const sourceEvent =
      score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0];

    if (sourceEvent) {
      sourceEvent.ties = [
        {
          pitchIndex: 0,
          targetEventId: 'stale-target',
          targetPitchIndex: 0,
        },
      ];
    }

    expect([...getIncomingTiePitchIndexes(score, 'stale-target')]).toEqual([]);
    expect(getTieChainDurationBeats(score, 'stale-source', 0)).toBe(1);
  });

  it('toggles a slur to the next pitched event without requiring the same pitch', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 1 }), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'slur-source',
      measureIndex: 0,
      pitch: { octave: 4, step: 'C' },
      staffId: 'treble',
    });
    const score = placeScoreEvent(firstScore, {
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'slur-target',
      measureIndex: 0,
      pitch: { octave: 4, step: 'E' },
      staffId: 'treble',
    });
    const result = tryToggleSlurToNext(score, 'slur-source');

    expect(result.updated).toBe(true);
    expect(
      result.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0]
        ?.slurs,
    ).toEqual([
      {
        id: 'slur-slur-source-slur-target',
        targetEventId: 'slur-target',
      },
    ]);
  });
});
