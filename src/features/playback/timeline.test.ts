import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { placeScoreEvent } from '../../domain/score/editing';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvent,
  getPlaybackBeatAtSeconds,
  getTimelineDurationSeconds,
} from './timeline';

describe('playback timeline', () => {
  it('converts quarter notes to beat and second timings', () => {
    const score = [0, 1, 2, 3].reduce(
      (currentScore, beat) =>
        placeScoreEvent(currentScore, {
          eventId: `event-${beat}`,
          staffId: 'treble',
          measureIndex: 0,
          beat,
          duration: 'quarter',
          entryMode: 'note',
          pitch: { step: 'C', octave: 4 },
        }),
      createEmptyScore('treble', { tempo: 120 }),
    );
    const timeline = buildPlaybackTimeline(score);

    expect(timeline.map((event) => event.startBeat)).toEqual([0, 1, 2, 3]);
    expect(timeline.map((event) => event.startSeconds)).toEqual([0, 0.5, 1, 1.5]);
    expect(getTimelineDurationSeconds(timeline)).toBe(2);
  });

  it('includes simultaneous grand staff events', () => {
    const scoreWithTreble = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'event-treble',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const score = placeScoreEvent(scoreWithTreble, {
      eventId: 'event-bass',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });

    expect(buildPlaybackTimeline(score)).toHaveLength(2);
  });

  it('finds the active event and playback beat at an elapsed time', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { tempo: 120 }), {
      eventId: 'event-active',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const timeline = buildPlaybackTimeline(score);

    expect(getActiveTimelineEvent(timeline, 0.5)?.id).toBe('event-active');
    expect(getPlaybackBeatAtSeconds(120, 0.5)).toBe(1);
  });
});
