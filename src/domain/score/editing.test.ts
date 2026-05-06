import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import {
  addMeasure,
  countScoreEvents,
  deleteScoreEvent,
  findScoreEvent,
  placeScoreEvent,
  tryPlaceScoreEvent,
  tryInsertScoreEvent,
  tryUpdateScoreEvent,
} from './editing';

describe('score editing', () => {
  it('places a note event into the requested staff and measure', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const nextScore = placeScoreEvent(score, {
      eventId: 'event-test-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
      accidental: 'sharp',
    });

    expect(
      nextScore.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events,
    ).toEqual([
      {
        id: 'event-test-note',
        kind: 'note',
        beat: 1,
        duration: 'quarter',
        pitch: { step: 'C', octave: 4, accidental: 'sharp' },
      },
    ]);
  });

  it('places a rest event without pitch data', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const nextScore = placeScoreEvent(score, {
      eventId: 'event-test-rest',
      staffId: 'treble',
      measureIndex: 1,
      beat: 2,
      duration: 'half',
      entryMode: 'rest',
      pitch: { step: 'C', octave: 4 },
    });

    expect(
      nextScore.parts[0]?.staves[0]?.measures[1]?.voices[0]?.events[0],
    ).toEqual({
      id: 'event-test-rest',
      kind: 'rest',
      beat: 2,
      duration: 'half',
    });
  });

  it('adds an empty measure to each staff', () => {
    const score = createEmptyScore('grand', { measureCount: 2 });
    const nextScore = addMeasure(score);

    expect(nextScore.parts[0]?.staves[0]?.measures).toHaveLength(3);
    expect(nextScore.parts[0]?.staves[1]?.measures).toHaveLength(3);
    expect(nextScore.parts[0]?.staves[0]?.measures[2]).toMatchObject({
      id: 'measure-treble-3',
      index: 2,
    });
  });

  it('inserts an event and shifts later events in the same staff', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondScore = placeScoreEvent(firstScore, {
      eventId: 'event-e',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = placeScoreEvent(secondScore, {
      eventId: 'event-g',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const result = tryInsertScoreEvent(score, {
      eventId: 'event-d',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });

    expect(result.placed).toBe(true);
    expect(
      result.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.map(
        (event) => [event.id, event.beat],
      ),
    ).toEqual([
      ['event-c', 0],
      ['event-d', 1],
      ['event-e', 2],
      ['event-g', 3],
    ]);
  });

  it('adds a new measure when an inserted event pushes the tail past the last bar', () => {
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
      createEmptyScore('treble', { measureCount: 1 }),
    );
    const result = tryInsertScoreEvent(score, {
      eventId: 'event-inserted',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });

    expect(result.placed).toBe(true);
    expect(result.score.parts[0]?.staves[0]?.measures).toHaveLength(2);
    expect(
      result.score.parts[0]?.staves[0]?.measures[1]?.voices[0]?.events,
    ).toMatchObject([
      {
        id: 'event-3',
        beat: 0,
      },
    ]);
  });

  it('rejects insertions that split an existing longer event', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-half',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryInsertScoreEvent(score, {
      eventId: 'event-inserted',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });

    expect(result).toMatchObject({
      score,
      placed: false,
      reason: 'event-overlap',
    });
  });

  it('counts events across all staves', () => {
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'event-counted',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });

    expect(countScoreEvents(score)).toBe(1);
  });

  it('rejects events that would overflow the measure', () => {
    const score = createEmptyScore('treble');
    const result = tryPlaceScoreEvent(score, {
      eventId: 'event-overflow',
      staffId: 'treble',
      measureIndex: 0,
      beat: 3,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });

    expect(result).toMatchObject({
      score,
      placed: false,
      reason: 'measure-overflow',
    });
  });

  it('replaces an existing event at the same beat', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-original',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const nextScore = placeScoreEvent(score, {
      eventId: 'event-replacement',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });

    expect(
      nextScore.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events,
    ).toHaveLength(1);
    expect(
      nextScore.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0]?.id,
    ).toBe('event-replacement');
  });

  it('rejects overlapping events at different beats', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-half',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryPlaceScoreEvent(score, {
      eventId: 'event-overlap',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    expect(result.placed).toBe(false);
    expect(result.reason).toBe('event-overlap');
  });

  it('finds and deletes an event by id', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-delete-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });

    expect(findScoreEvent(score, 'event-delete-me')).toMatchObject({
      measureIndex: 0,
      staffId: 'treble',
    });
    expect(countScoreEvents(deleteScoreEvent(score, 'event-delete-me'))).toBe(0);
  });

  it('updates duration and accidental on an existing note', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-update-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-update-me', {
      accidental: 'flat',
      duration: 'half',
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-update-me')?.event).toMatchObject({
      duration: 'half',
      pitch: { step: 'C', octave: 4, accidental: 'flat' },
    });
  });

  it('moves an existing note to a new beat, measure, and pitch', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { measureCount: 2 }), {
      eventId: 'event-move-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-move-me', {
      beat: 2,
      measureIndex: 1,
      pitch: { step: 'G', octave: 4 },
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-move-me')).toMatchObject({
      measureIndex: 1,
      staffId: 'treble',
      event: {
        beat: 2,
        pitch: { step: 'G', octave: 4 },
      },
    });
    expect(
      result.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events,
    ).toEqual([]);
  });

  it('rejects moves that collide with another event', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-stays',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(firstScore, {
      eventId: 'event-collides',
      staffId: 'treble',
      measureIndex: 0,
      beat: 3,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-collides', {
      beat: 1,
    });

    expect(result).toMatchObject({
      score,
      updated: false,
      reason: 'event-overlap',
    });
  });

  it('rejects selected duration updates that would overflow the measure', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-too-late',
      staffId: 'treble',
      measureIndex: 0,
      beat: 3,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-too-late', {
      duration: 'half',
    });

    expect(result).toMatchObject({
      score,
      updated: false,
      reason: 'measure-overflow',
    });
  });
});
