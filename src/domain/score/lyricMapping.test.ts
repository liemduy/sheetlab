import { describe, expect, it } from 'vitest';
import { placeScoreEvent, tryUpdateScoreEvent } from './editing';
import { createEmptyScore } from './factories';
import {
  findLyricMapSourceEventId,
  getLyricMapEventIds,
  getLyricMapTargetEventIds,
  getOrderedPitchedVoiceEventIds,
  normalizeLyricMapEventIds,
} from './lyricMapping';
import type { Score } from './types';

function addTrebleNote(
  score: Score,
  eventId: string,
  beat: number,
  options: {
    measureIndex?: number;
    voiceIndex?: number;
  } = {},
) {
  return placeScoreEvent(score, {
    eventId,
    staffId: 'treble',
    measureIndex: options.measureIndex ?? 0,
    beat,
    duration: 'quarter',
    entryMode: 'note',
    pitch: { step: 'C', octave: 4 },
    voiceIndex: options.voiceIndex,
  });
}

describe('lyric mapping', () => {
  it('defaults a lyric to its own event when no explicit map exists', () => {
    const score = addTrebleNote(createEmptyScore('treble'), 'source', 0);

    expect(getLyricMapEventIds(score, 'source')).toEqual(['source']);
  });

  it('deduplicates explicit lyric map event ids in their stored order', () => {
    const sourceScore = addTrebleNote(createEmptyScore('treble'), 'source', 0);
    const targetScore = addTrebleNote(sourceScore, 'target', 1);
    const score = tryUpdateScoreEvent(targetScore, 'source', {
      lyricMap: { eventIds: ['source', 'target', 'target'] },
    }).score;

    expect(getLyricMapEventIds(score, 'source')).toEqual(['source', 'target']);
  });

  it('maps one lyric across consecutive pitched events in the same voice', () => {
    const firstScore = addTrebleNote(createEmptyScore('treble'), 'source', 0);
    const secondScore = addTrebleNote(firstScore, 'middle', 1);
    const score = addTrebleNote(secondScore, 'target', 2);

    expect(getLyricMapTargetEventIds(score, 'source', 'target')).toEqual([
      'source',
      'middle',
      'target',
    ]);
  });

  it('keeps same-voice lyric ranges ordered even when dragged backward', () => {
    const firstScore = addTrebleNote(createEmptyScore('treble'), 'source', 0);
    const secondScore = addTrebleNote(firstScore, 'middle', 1);
    const score = addTrebleNote(secondScore, 'target', 2);

    expect(getLyricMapTargetEventIds(score, 'target', 'source')).toEqual([
      'source',
      'middle',
      'target',
    ]);
  });

  it('maps only the target event when the drag crosses voices', () => {
    const sourceScore = addTrebleNote(createEmptyScore('treble'), 'source', 0);
    const score = addTrebleNote(sourceScore, 'voice-two-target', 1, {
      voiceIndex: 1,
    });

    expect(
      getLyricMapTargetEventIds(score, 'source', 'voice-two-target'),
    ).toEqual(['voice-two-target']);
  });

  it('maps only the target event when the drag crosses staves', () => {
    const sourceScore = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'source',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(sourceScore, {
      eventId: 'bass-target',
      staffId: 'bass',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });

    expect(getLyricMapTargetEventIds(score, 'source', 'bass-target')).toEqual([
      'bass-target',
    ]);
  });

  it('falls back to the source when either endpoint is missing', () => {
    const score = addTrebleNote(createEmptyScore('treble'), 'source', 0);

    expect(getLyricMapTargetEventIds(score, 'source', 'missing')).toEqual([
      'source',
    ]);
    expect(getLyricMapTargetEventIds(score, 'missing-source', 'source')).toEqual([
      'missing-source',
    ]);
  });

  it('returns ordered pitched voice ids across measures', () => {
    const firstScore = addTrebleNote(createEmptyScore('treble'), 'first', 2, {
      measureIndex: 0,
    });
    const secondScore = addTrebleNote(firstScore, 'second', 0, {
      measureIndex: 1,
    });
    const score = addTrebleNote(secondScore, 'third', 1, {
      measureIndex: 1,
    });

    expect(getOrderedPitchedVoiceEventIds(score, 'first')).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('normalizes lyric maps by removing unknown ids and falling back to source', () => {
    const score = addTrebleNote(createEmptyScore('treble'), 'source', 0);

    expect(
      normalizeLyricMapEventIds(score, 'source', [
        'source',
        'missing',
        'source',
      ]),
    ).toEqual(['source']);
    expect(normalizeLyricMapEventIds(score, 'source', ['missing'])).toEqual([
      'source',
    ]);
  });

  it('resolves mapped target notes back to the lyric source event', () => {
    const sourceScore = addTrebleNote(createEmptyScore('treble'), 'source', 0);
    const targetScore = addTrebleNote(sourceScore, 'target', 1);
    const score = tryUpdateScoreEvent(targetScore, 'source', {
      lyric: 'hold',
      lyricMap: { eventIds: ['source', 'target'] },
    }).score;

    expect(findLyricMapSourceEventId(score, 'target')).toBe('source');
    expect(findLyricMapSourceEventId(score, 'source')).toBe('source');
  });
});
