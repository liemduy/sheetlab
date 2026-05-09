import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import {
  placeScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  tryMoveKeySignatureSymbol,
} from '../../domain/score/editing';
import {
  buildPlaybackMeasureOrder,
  buildPlaybackTimeline,
  getActiveTimelineEvent,
  getActiveTimelineEvents,
  getPlaybackBeatAtSeconds,
  getPlaybackScoreBeatAtSeconds,
  getTimelineDurationSeconds,
} from './timeline';
import type { ChordEvent } from '../../domain/score/types';

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

    const timeline = buildPlaybackTimeline(score);

    expect(timeline).toHaveLength(2);
    expect(timeline.map((event) => event.startSeconds)).toEqual([0, 0]);
    expect(timeline.map((event) => event.pitches)).toEqual([
      [{ step: 'C', octave: 3 }],
      [{ step: 'C', octave: 5 }],
    ]);
  });

  it('keeps right-hand chords and left-hand notes on the same attack time', () => {
    const score = createEmptyScore('grand', { measureCount: 1, tempo: 120 });
    const rightHandChord: ChordEvent = {
      id: 'right-hand-c-major',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 5 },
        { step: 'E', octave: 5 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(rightHandChord);
    const scoreWithLeftHand = placeScoreEvent(score, {
      eventId: 'left-hand-c',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const timeline = buildPlaybackTimeline(scoreWithLeftHand);

    expect(timeline.map((event) => event.startSeconds)).toEqual([0, 0]);
    expect(timeline.map((event) => event.durationSeconds)).toEqual([1, 0.5]);
    expect(timeline.flatMap((event) => event.pitches)).toEqual([
      { step: 'C', octave: 3 },
      { step: 'C', octave: 5 },
      { step: 'E', octave: 5 },
    ]);
    expect(getActiveTimelineEvents(timeline, 0).map((event) => event.id)).toEqual([
      'left-hand-c',
      'right-hand-c-major',
    ]);
  });

  it('keeps chord columns as one timeline event with multiple pitches', () => {
    const score = createEmptyScore('grand', { measureCount: 1 });
    const chord: ChordEvent = {
      id: 'timeline-c-major',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
        { step: 'G', octave: 4 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const timelineEvent = buildPlaybackTimeline(score)[0];

    expect(timelineEvent).toMatchObject({
      id: 'timeline-c-major',
      kind: 'chord',
      pitch: { step: 'C', octave: 4 },
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
        { step: 'G', octave: 4 },
      ],
      startBeat: 0,
    });
  });

  it('applies the active key signature to playback pitches', () => {
    const scoreWithKey = setMeasureKeySignature(
      createEmptyScore('treble', { measureCount: 1 }),
      0,
      'G',
    );
    const score = placeScoreEvent(scoreWithKey, {
      eventId: 'event-f-in-g',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'F', octave: 4 },
    });

    expect(buildPlaybackTimeline(score)[0]?.pitch).toEqual({
      accidental: 'sharp',
      octave: 4,
      step: 'F',
    });
  });

  it('applies custom dragged key-signature symbols to playback pitches', () => {
    const scoreWithKey = setMeasureKeySignature(
      createEmptyScore('treble', { measureCount: 1 }),
      0,
      'G',
    );
    const movedKeySignature = tryMoveKeySignatureSymbol(scoreWithKey, 0, 0, {
      octave: 5,
      step: 'E',
    });
    const scoreWithF = placeScoreEvent(movedKeySignature.score, {
      eventId: 'event-f-after-custom-key',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'F', octave: 4 },
    });
    const score = placeScoreEvent(scoreWithF, {
      eventId: 'event-e-after-custom-key',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    expect(buildPlaybackTimeline(score).map((event) => event.pitch)).toEqual([
      { octave: 4, step: 'F' },
      { accidental: 'sharp', octave: 4, step: 'E' },
    ]);
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

  it('expands simple repeat start and repeat end for playback', () => {
    const scoreWithNotes = [0, 1, 2].reduce(
      (currentScore, measureIndex) =>
        placeScoreEvent(currentScore, {
          eventId: `event-m${measureIndex}`,
          staffId: 'treble',
          measureIndex,
          beat: 0,
          duration: 'quarter',
          entryMode: 'note',
          pitch: { step: 'C', octave: 4 },
        }),
      createEmptyScore('treble', { measureCount: 3, tempo: 60 }),
    );
    const scoreWithRepeatStart = setMeasureRepeatJump(
      scoreWithNotes,
      0,
      'repeat-start',
    );
    const score = setMeasureRepeatJump(scoreWithRepeatStart, 1, 'repeat-end');
    const timeline = buildPlaybackTimeline(score);

    expect(buildPlaybackMeasureOrder(score)).toEqual([0, 1, 0, 1, 2]);
    expect(timeline.map((event) => event.id)).toEqual([
      'event-m0',
      'event-m1',
      'event-m0',
      'event-m1',
      'event-m2',
    ]);
    expect(timeline.map((event) => event.startBeat)).toEqual([0, 4, 0, 4, 8]);
    expect(timeline.map((event) => event.playbackStartBeat)).toEqual([
      0,
      4,
      8,
      12,
      16,
    ]);
    expect(getPlaybackScoreBeatAtSeconds(timeline, 60, 8)?.toFixed(2)).toBe('0.00');
  });

  it('expands D.C. al Fine by replaying from the top to Fine', () => {
    const scoreWithNotes = [0, 1, 2, 3].reduce(
      (currentScore, measureIndex) =>
        placeScoreEvent(currentScore, {
          eventId: `dc-event-m${measureIndex}`,
          staffId: 'treble',
          measureIndex,
          beat: 0,
          duration: 'quarter',
          entryMode: 'note',
          pitch: { step: 'C', octave: 4 },
        }),
      createEmptyScore('treble', { measureCount: 4 }),
    );
    const scoreWithFine = setMeasureRepeatJump(scoreWithNotes, 1, 'fine');
    const score = setMeasureRepeatJump(scoreWithFine, 3, 'dc-al-fine');

    expect(buildPlaybackMeasureOrder(score)).toEqual([0, 1, 2, 3, 0, 1]);
  });
});
