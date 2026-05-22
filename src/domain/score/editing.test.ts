import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import {
  addMeasure,
  clearMeasureContent,
  countScoreEvents,
  deleteMeasureAt,
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  insertMeasureAt,
  placeScoreEvent,
  setMeasureSectionMarker,
  tryCreateTupletFromEvent,
  tryFlipScoreEventStemDirection,
  tryPlaceScoreEvent,
  tryInsertScoreEvent,
  tryPlaceTupletGroup,
  tryUpdateScoreEvent,
} from './editing';
import { ANNOTATION_OFFSET_LIMIT } from './annotationOffsets';
import type { Score, StaffId } from './types';
import { getMeasureTicks } from './ticks';
import { getEventDurationTicks } from './eventDuration';
import { getScoreRhythmIssues } from './rhythm';
import {
  findLyricMapSourceEventId,
  getLyricMapTargetEventIds,
} from './lyricMapping';
import {
  getDefaultTupletNormalNotes,
  SUPPORTED_TUPLET_ACTUAL_NOTES,
} from './tuplets';
import { annotationDragLabFixture } from './fixtures';

function getVoiceEvents(
  score: Score,
  staffId: StaffId = 'treble',
  measureIndex = 0,
  voiceIndex = 0,
) {
  return score.parts[0]?.staves
    .find((staff) => staff.id === staffId)
    ?.measures.find((measure) => measure.index === measureIndex)
    ?.voices[voiceIndex]?.events;
}

function getPitchedEvents(
  score: Score,
  staffId: StaffId = 'treble',
  measureIndex = 0,
  voiceIndex = 0,
) {
  return getVoiceEvents(score, staffId, measureIndex, voiceIndex)?.filter(
    (event) => event.kind !== 'rest',
  );
}

function expectMeasureEventsFillMeasure(
  score: Score,
  staffId: StaffId = 'treble',
  measureIndex = 0,
) {
  const events = getVoiceEvents(score, staffId, measureIndex) ?? [];

  expect(
    events.reduce(
      (totalTicks, event) => totalTicks + getEventDurationTicks(event),
      0,
    ),
  ).toBe(getMeasureTicks(score.timeSignature));
}

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
      getVoiceEvents(nextScore),
    ).toEqual([
      {
        id: 'rest-treble-m1-t0-quarter',
        kind: 'rest',
        beat: 0,
        duration: 'quarter',
      },
      {
        id: 'event-test-note',
        kind: 'note',
        beat: 1,
        duration: 'quarter',
        pitch: { step: 'C', octave: 4, accidental: 'sharp' },
      },
      {
        id: 'rest-treble-m1-t20160-half',
        kind: 'rest',
        beat: 2,
        duration: 'half',
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
      getVoiceEvents(nextScore, 'treble', 1),
    ).toEqual([
      {
        id: 'rest-treble-m2-t0-half',
        kind: 'rest',
        beat: 0,
        duration: 'half',
      },
      {
        id: 'event-test-rest',
        kind: 'rest',
        beat: 2,
        duration: 'half',
      },
    ]);
  });

  it('splits a selected duration into a triplet group', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'triplet-source',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryCreateTupletFromEvent(score, 'triplet-source', 3);
    const events = getVoiceEvents(result.score) ?? [];
    const tripletEvents = events.filter(
      (event) => event.tuplet?.id === 'tuplet-triplet-source',
    );

    expect(result.updated).toBe(true);
    expect(tripletEvents).toHaveLength(3);
    expect(tripletEvents.map((event) => event.duration)).toEqual([
      'eighth',
      'eighth',
      'eighth',
    ]);
    expect(tripletEvents.map((event) => event.beat)).toEqual([0, 0.3333, 0.6667]);
    expect(tripletEvents.map((event) => event.tuplet?.index)).toEqual([0, 1, 2]);
    expect(tripletEvents.map((event) => event.kind)).toEqual([
      'note',
      'rest',
      'rest',
    ]);
    expectMeasureEventsFillMeasure(result.score);
  });

  it('rejects splitting a dotted source event into a triplet group', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'dotted-triplet-source',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      dots: 1,
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryCreateTupletFromEvent(score, 'dotted-triplet-source', 3);

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('unsupported-tuplet');
    expect(findScoreEvent(result.score, 'dotted-triplet-source')?.event)
      .toMatchObject({
        duration: 'quarter',
        dots: 1,
        tuplet: undefined,
      });
  });

  it('places a triplet group from an armed duration', () => {
    const score = createEmptyScore('treble');
    const result = tryPlaceTupletGroup(score, {
      eventId: 'triplet-entry',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'E', octave: 4 },
    });
    const events = getVoiceEvents(result.score) ?? [];
    const tripletEvents = events.filter(
      (event) => event.tuplet?.id === 'tuplet-triplet-entry',
    );

    expect(result.placed).toBe(true);
    expect(tripletEvents.map((event) => event.beat)).toEqual([1, 1.3333, 1.6667]);
    expect(tripletEvents[0]).toMatchObject({
      kind: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    expect(tripletEvents.slice(1).map((event) => event.kind)).toEqual([
      'rest',
      'rest',
    ]);
    expectMeasureEventsFillMeasure(result.score);
  });

  it('places a quintuplet group from an armed duration', () => {
    const score = createEmptyScore('treble');
    const result = tryPlaceTupletGroup(score, {
      eventId: 'quintuplet-entry',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 5,
      pitch: { step: 'E', octave: 4 },
    });
    const events = getVoiceEvents(result.score) ?? [];
    const quintupletEvents = events.filter(
      (event) => event.tuplet?.id === 'tuplet-quintuplet-entry',
    );

    expect(result.placed).toBe(true);
    expect(quintupletEvents).toHaveLength(5);
    expect(quintupletEvents.map((event) => event.beat)).toEqual([
      1,
      1.2,
      1.4,
      1.6,
      1.8,
    ]);
    expect(quintupletEvents.map((event) => event.duration)).toEqual([
      'sixteenth',
      'sixteenth',
      'sixteenth',
      'sixteenth',
      'sixteenth',
    ]);
    expect(quintupletEvents.map((event) => event.tuplet?.normalNotes)).toEqual([
      4,
      4,
      4,
      4,
      4,
    ]);
    expect(quintupletEvents[0]).toMatchObject({
      kind: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    expect(quintupletEvents.slice(1).map((event) => event.kind)).toEqual([
      'rest',
      'rest',
      'rest',
      'rest',
    ]);
    expectMeasureEventsFillMeasure(result.score);
  });

  it('places every supported tuplet count from an armed quarter duration', () => {
    SUPPORTED_TUPLET_ACTUAL_NOTES.forEach((actualNotes) => {
      const result = tryPlaceTupletGroup(createEmptyScore('treble'), {
        eventId: `tuplet-${actualNotes}-entry`,
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        actualNotes,
        pitch: { step: 'E', octave: 4 },
      });
      const tupletEvents = getVoiceEvents(result.score)?.filter(
        (event) => event.tuplet?.id === `tuplet-tuplet-${actualNotes}-entry`,
      ) ?? [];

      expect(result.placed, `tuplet ${actualNotes}`).toBe(true);
      expect(tupletEvents, `tuplet ${actualNotes}`).toHaveLength(actualNotes);
      expect(
        tupletEvents.every(
          (event) =>
            event.tuplet?.actualNotes === actualNotes &&
            event.tuplet.normalNotes ===
              getDefaultTupletNormalNotes(actualNotes),
        ),
        `tuplet ${actualNotes}`,
      ).toBe(true);
      expect(getScoreRhythmIssues(result.score), `tuplet ${actualNotes}`)
        .toEqual([]);
      expectMeasureEventsFillMeasure(result.score);
    });
  });

  it('places septuplet and nonuplet groups without tick rounding rhythm issues', () => {
    const septupletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'septuplet-entry',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 7,
      pitch: { step: 'E', octave: 4 },
    });
    const nonupletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'nonuplet-entry',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 9,
      pitch: { step: 'E', octave: 4 },
    });
    const septupletEvents = getVoiceEvents(septupletResult.score)?.filter(
      (event) => event.tuplet?.id === 'tuplet-septuplet-entry',
    ) ?? [];
    const nonupletEvents = getVoiceEvents(nonupletResult.score)?.filter(
      (event) => event.tuplet?.id === 'tuplet-nonuplet-entry',
    ) ?? [];

    expect(septupletResult.placed).toBe(true);
    expect(nonupletResult.placed).toBe(true);
    expect(septupletEvents).toHaveLength(7);
    expect(nonupletEvents).toHaveLength(9);
    expect(septupletEvents.every((event) => event.duration === 'sixteenth'))
      .toBe(true);
    expect(nonupletEvents.every((event) => event.duration === 'thirtySecond'))
      .toBe(true);
    expect(getScoreRhythmIssues(septupletResult.score)).toEqual([]);
    expect(getScoreRhythmIssues(nonupletResult.score)).toEqual([]);
    expectMeasureEventsFillMeasure(septupletResult.score);
    expectMeasureEventsFillMeasure(nonupletResult.score);
  });

  it('replaces every rest slot inside an existing triplet group', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'fillable-triplet',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const tripletSlots = (getVoiceEvents(tripletResult.score) ?? []).filter(
      (event) => event.tuplet?.id === 'tuplet-fillable-triplet',
    );
    const secondSlot = tripletSlots[1];
    const thirdSlot = tripletSlots[2];

    expect(secondSlot?.tuplet?.index).toBe(1);
    expect(thirdSlot?.tuplet?.index).toBe(2);

    const secondResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'triplet-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: secondSlot?.beat ?? 0,
      duration: secondSlot?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
      tuplet: secondSlot?.tuplet,
    });
    const thirdResult = tryPlaceScoreEvent(secondResult.score, {
      eventId: 'triplet-note-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: thirdSlot?.beat ?? 0,
      duration: thirdSlot?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      tuplet: thirdSlot?.tuplet,
    });
    const filledTriplet = (getVoiceEvents(thirdResult.score) ?? []).filter(
      (event) => event.tuplet?.id === 'tuplet-fillable-triplet',
    );

    expect(secondResult.placed).toBe(true);
    expect(thirdResult.placed).toBe(true);
    expect(filledTriplet.map((event) => event.kind)).toEqual([
      'note',
      'note',
      'note',
    ]);
    expect(filledTriplet.map((event) => event.beat)).toEqual([0, 0.3333, 0.6667]);
    expect(getScoreRhythmIssues(thirdResult.score)).toEqual([]);
    expectMeasureEventsFillMeasure(thirdResult.score);
  });

  it('adds a chord pitch inside an existing triplet slot without changing tuplet timing', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'triplet-chord-slot',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const firstSlot = (getVoiceEvents(tripletResult.score) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-slot',
    );
    const chordResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'triplet-chord-slot-upper',
      staffId: 'treble',
      measureIndex: 0,
      beat: firstSlot?.beat ?? 0,
      duration: firstSlot?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      tuplet: firstSlot?.tuplet,
    });
    const chordSlot = (getVoiceEvents(chordResult.score) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-slot' &&
        event.tuplet.index === 0,
    );

    expect(chordResult.placed).toBe(true);
    expect(chordSlot).toMatchObject({
      kind: 'chord',
      beat: 0,
      duration: 'eighth',
      tuplet: {
        actualNotes: 3,
        id: 'tuplet-triplet-chord-slot',
        index: 0,
        normalNotes: 2,
      },
    });
    expect(chordSlot?.kind === 'chord' ? chordSlot.pitches : []).toEqual([
      { step: 'C', octave: 4 },
      { step: 'E', octave: 4 },
    ]);
    expect(getScoreRhythmIssues(chordResult.score)).toEqual([]);
    expectMeasureEventsFillMeasure(chordResult.score);
  });

  it('deletes tuplet notes back to tuplet rests without collapsing the group', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'triplet-delete-slot',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const deletedScore = deleteScoreEvent(tripletResult.score, 'triplet-delete-slot');
    const tupletSlots = (getVoiceEvents(deletedScore) ?? []).filter(
      (event) => event.tuplet?.id === 'tuplet-triplet-delete-slot',
    );

    expect(tupletSlots).toHaveLength(3);
    expect(tupletSlots.map((event) => event.kind)).toEqual(['rest', 'rest', 'rest']);
    expect(tupletSlots.map((event) => event.beat)).toEqual([0, 0.3333, 0.6667]);
    expect(tupletSlots.every((event) => event.duration === 'eighth')).toBe(true);
    expect(getScoreRhythmIssues(deletedScore)).toEqual([]);
    expectMeasureEventsFillMeasure(deletedScore);
  });

  it('removes pitches from a tuplet chord while preserving the tuplet slot', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'triplet-chord-delete',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const firstSlot = (getVoiceEvents(tripletResult.score) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-delete',
    );
    const chordResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'triplet-chord-delete-upper',
      staffId: 'treble',
      measureIndex: 0,
      beat: firstSlot?.beat ?? 0,
      duration: firstSlot?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      tuplet: firstSlot?.tuplet,
    });
    const chordSlot = (getVoiceEvents(chordResult.score) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-delete' &&
        event.tuplet.index === 0,
    );
    const onePitchScore = deleteScoreEventPitch(
      chordResult.score,
      chordSlot?.id ?? '',
      0,
    );
    const onePitchSlot = (getVoiceEvents(onePitchScore) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-delete' &&
        event.tuplet.index === 0,
    );
    const emptyScore = deleteScoreEventPitch(
      onePitchScore,
      onePitchSlot?.id ?? '',
      0,
    );
    const emptySlot = (getVoiceEvents(emptyScore) ?? []).find(
      (event) => event.tuplet?.id === 'tuplet-triplet-chord-delete' &&
        event.tuplet.index === 0,
    );

    expect(onePitchSlot).toMatchObject({
      kind: 'note',
      duration: 'eighth',
      pitch: { step: 'E', octave: 4 },
      tuplet: firstSlot?.tuplet,
    });
    expect(emptySlot).toMatchObject({
      kind: 'rest',
      duration: 'eighth',
      tuplet: firstSlot?.tuplet,
    });
    expect(getScoreRhythmIssues(emptyScore)).toEqual([]);
    expectMeasureEventsFillMeasure(emptyScore);
  });

  it('rejects changing a single tuplet slot duration outside the tuplet context', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'triplet-duration-update',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const result = tryUpdateScoreEvent(tripletResult.score, 'triplet-duration-update', {
      duration: 'quarter',
    });

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('locked-tuplet-slot');
    expect(findScoreEvent(result.score, 'triplet-duration-update')?.event).toMatchObject({
      duration: 'eighth',
      tuplet: {
        actualNotes: 3,
        id: 'tuplet-triplet-duration-update',
        index: 0,
        normalNotes: 2,
      },
    });
  });

  it('maps one lyric syllable across multiple triplet notes in order', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'triplet-lyric-map',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const tripletSlots = (getVoiceEvents(tripletResult.score) ?? []).filter(
      (event) => event.tuplet?.id === 'tuplet-triplet-lyric-map',
    );
    const secondResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'triplet-lyric-map-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: tripletSlots[1]?.beat ?? 0,
      duration: tripletSlots[1]?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
      tuplet: tripletSlots[1]?.tuplet,
    });
    const thirdResult = tryPlaceScoreEvent(secondResult.score, {
      eventId: 'triplet-lyric-map-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: tripletSlots[2]?.beat ?? 0,
      duration: tripletSlots[2]?.duration ?? 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      tuplet: tripletSlots[2]?.tuplet,
    });
    const mappedScore = tryUpdateScoreEvent(thirdResult.score, 'triplet-lyric-map', {
      lyric: 'love',
      lyricMap: {
        eventIds: ['triplet-lyric-map', 'triplet-lyric-map-2', 'triplet-lyric-map-3'],
      },
    }).score;

    expect(getLyricMapTargetEventIds(
      mappedScore,
      'triplet-lyric-map',
      'triplet-lyric-map-3',
    )).toEqual([
      'triplet-lyric-map',
      'triplet-lyric-map-2',
      'triplet-lyric-map-3',
    ]);
    expect(findLyricMapSourceEventId(mappedScore, 'triplet-lyric-map-3'))
      .toBe('triplet-lyric-map');
  });

  it('places a triplet group inside compound meter without rhythm issues', () => {
    const result = tryPlaceTupletGroup(
      createEmptyScore('treble', {
        measureCount: 1,
        timeSignature: { beats: 6, beatUnit: 8 },
      }),
      {
        eventId: 'compound-triplet-entry',
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'eighth',
        entryMode: 'note',
        actualNotes: 3,
        pitch: { step: 'C', octave: 4 },
      },
    );
    const tripletEvents = (getVoiceEvents(result.score) ?? []).filter(
      (event) => event.tuplet?.id === 'tuplet-compound-triplet-entry',
    );

    expect(result.placed).toBe(true);
    expect(tripletEvents.map((event) => event.duration)).toEqual([
      'sixteenth',
      'sixteenth',
      'sixteenth',
    ]);
    expect(tripletEvents.map((event) => event.beat)).toEqual([0, 0.1667, 0.3333]);
    expect(getScoreRhythmIssues(result.score)).toEqual([]);
    expectMeasureEventsFillMeasure(result.score);
  });

  it('clamps placed notes to the staff readable ledger range', () => {
    const trebleScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'too-low-treble',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 1 },
    });
    const bassScore = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'too-low-bass',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 0 },
    });

    expect(findScoreEvent(trebleScore, 'too-low-treble')?.event).toMatchObject({
      kind: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    expect(findScoreEvent(bassScore, 'too-low-bass')?.event).toMatchObject({
      kind: 'note',
      pitch: { step: 'A', octave: 0 },
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

  it('inserts an empty measure before the requested index on every staff', () => {
    const score = placeScoreEvent(createEmptyScore('grand', { measureCount: 2 }), {
      eventId: 'event-after-insert',
      staffId: 'treble',
      measureIndex: 1,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const nextScore = insertMeasureAt(score, 1);

    expect(nextScore.parts[0]?.staves[0]?.measures).toHaveLength(3);
    expect(nextScore.parts[0]?.staves[1]?.measures).toHaveLength(3);
    expect(getVoiceEvents(nextScore, 'treble', 1)).toEqual([]);
    expect(findScoreEvent(nextScore, 'event-after-insert')).toMatchObject({
      measureIndex: 2,
      staffId: 'treble',
    });
  });

  it('clears one selected staff measure without deleting the measure column', () => {
    const trebleScore = placeScoreEvent(createEmptyScore('grand', { measureCount: 2 }), {
      eventId: 'treble-clear-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(trebleScore, {
      eventId: 'bass-keep-me',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const nextScore = clearMeasureContent(score, 'treble', 0);

    expect(getVoiceEvents(nextScore, 'treble', 0)).toEqual([]);
    expect(findScoreEvent(nextScore, 'bass-keep-me')).toMatchObject({
      measureIndex: 0,
      staffId: 'bass',
    });
    expect(nextScore.parts[0]?.staves[0]?.measures).toHaveLength(2);
  });

  it('deletes a measure column across every staff and reindexes the tail', () => {
    const score = placeScoreEvent(createEmptyScore('grand', { measureCount: 3 }), {
      eventId: 'event-tail',
      staffId: 'treble',
      measureIndex: 2,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const nextScore = deleteMeasureAt(score, 1);

    expect(nextScore.parts[0]?.staves[0]?.measures).toHaveLength(2);
    expect(nextScore.parts[0]?.staves[1]?.measures).toHaveLength(2);
    expect(nextScore.parts[0]?.staves[0]?.measures[1]).toMatchObject({
      id: 'measure-treble-2',
      index: 1,
    });
    expect(findScoreEvent(nextScore, 'event-tail')).toMatchObject({
      measureIndex: 1,
      staffId: 'treble',
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
      getPitchedEvents(result.score)?.map((event) => [event.id, event.beat]),
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
      getPitchedEvents(result.score, 'treble', 1),
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

  it('counts user-visible events across all staves', () => {
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

  it('adds a same-duration note at the same beat as a chord column', () => {
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
      getVoiceEvents(nextScore),
    ).toHaveLength(3);
    expect(getVoiceEvents(nextScore)?.[0]).toMatchObject({
      id: 'event-replacement',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'D', octave: 4 },
      ],
    });
    expectMeasureEventsFillMeasure(nextScore);
  });

  it('places same-beat events into independent voices when requested', () => {
    const voiceOneScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-voice-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
      voiceIndex: 0,
    });
    const nextScore = placeScoreEvent(voiceOneScore, {
      eventId: 'event-voice-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      voiceIndex: 1,
    });

    expect(getPitchedEvents(nextScore, 'treble', 0, 0)).toMatchObject([
      {
        id: 'event-voice-1',
        kind: 'note',
        pitch: { step: 'C', octave: 4 },
      },
    ]);
    expect(getPitchedEvents(nextScore, 'treble', 0, 1)).toMatchObject([
      {
        id: 'event-voice-2',
        kind: 'note',
        pitch: { step: 'E', octave: 4 },
      },
    ]);
    expect(findScoreEvent(nextScore, 'event-voice-2')).toMatchObject({
      measureIndex: 0,
      staffId: 'treble',
      voiceIndex: 1,
    });
  });

  it('updates events in their original voice by default', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-voice-2-update',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      voiceIndex: 1,
    });
    const result = tryUpdateScoreEvent(score, 'event-voice-2-update', {
      duration: 'half',
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-voice-2-update')).toMatchObject({
      voiceIndex: 1,
      event: {
        duration: 'half',
      },
    });
    expect(getVoiceEvents(result.score, 'treble', 0, 0)).toEqual([]);
  });

  it('replaces a same-start event when the selected duration changes', () => {
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
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });

    expect(getVoiceEvents(nextScore)?.[0]).toMatchObject({
      id: 'event-replacement',
      kind: 'note',
      beat: 0,
      duration: 'half',
      pitch: { step: 'D', octave: 4 },
    });
    expectMeasureEventsFillMeasure(nextScore);
  });

  it('splits a generated rest when placing a note into an empty slot', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const nextScore = placeScoreEvent(score, {
      eventId: 'event-e',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    expect(
      getVoiceEvents(nextScore)?.map((event) => [
        event.id,
        event.kind,
        event.beat,
        event.duration,
      ]),
    ).toEqual([
      ['event-c', 'note', 0, 'quarter'],
      ['rest-treble-m1-t10080-quarter', 'rest', 1, 'quarter'],
      ['event-e', 'note', 2, 'quarter'],
      ['rest-treble-m1-t30240-quarter', 'rest', 3, 'quarter'],
    ]);
    expectMeasureEventsFillMeasure(nextScore);
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
    expect(getVoiceEvents(deleteScoreEvent(score, 'event-delete-me'))).toEqual([
      {
        id: 'rest-treble-m1-t0-whole',
        kind: 'rest',
        beat: 0,
        duration: 'whole',
      },
    ]);
  });

  it('deletes only the requested pitch from a chord column', () => {
    const cScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const eScore = placeScoreEvent(cScore, {
      eventId: 'event-e',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = placeScoreEvent(eScore, {
      eventId: 'event-g',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const nextScore = deleteScoreEventPitch(score, 'event-g', 1);

    expect(findScoreEvent(nextScore, 'event-g')?.event).toMatchObject({
      kind: 'chord',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'G', octave: 4 },
      ],
    });
    expectMeasureEventsFillMeasure(nextScore);
  });

  it('collapses a two-note chord to a single note when one pitch is deleted', () => {
    const cScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(cScore, {
      eventId: 'event-e',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const nextScore = deleteScoreEventPitch(score, 'event-e', 0);

    expect(findScoreEvent(nextScore, 'event-e')?.event).toMatchObject({
      kind: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    expectMeasureEventsFillMeasure(nextScore);
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

  it('updates and clears chord symbols and lyrics on a selected event', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-annotate-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const annotated = tryUpdateScoreEvent(score, 'event-annotate-me', {
      chordSymbol: '  E7/D ',
      lyric: ' cho ',
      lyricMap: { eventIds: ['event-annotate-me', 'event-annotate-next'] },
    });
    const cleared = tryUpdateScoreEvent(annotated.score, 'event-annotate-me', {
      chordSymbol: '',
      lyricMap: null,
    });

    expect(annotated.updated).toBe(true);
    expect(findScoreEvent(annotated.score, 'event-annotate-me')?.event).toMatchObject({
      chordSymbol: 'E7/D',
      lyric: 'cho',
      lyricMap: { eventIds: ['event-annotate-me', 'event-annotate-next'] },
    });
    expect(findScoreEvent(cleared.score, 'event-annotate-me')?.event).toMatchObject({
      lyric: 'cho',
    });
    expect(
      findScoreEvent(cleared.score, 'event-annotate-me')?.event.chordSymbol,
    ).toBeUndefined();
    expect(
      findScoreEvent(cleared.score, 'event-annotate-me')?.event.lyricMap,
    ).toBeUndefined();
  });

  it('stores bounded manual annotation offsets and clears them when placement is reset', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-offset-annotation',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const offsetScore = tryUpdateScoreEvent(score, 'event-offset-annotation', {
      lyric: 'drag',
      annotationOffset: {
        kind: 'lyric',
        offset: { x: 999, y: -999 },
      },
    });
    const resetScore = tryUpdateScoreEvent(
      offsetScore.score,
      'event-offset-annotation',
      {
        annotationPlacement: {
          kind: 'lyric',
          side: 'above',
        },
      },
    );
    const autoScore = tryUpdateScoreEvent(
      resetScore.score,
      'event-offset-annotation',
      {
        annotationPlacement: {
          kind: 'lyric',
          side: 'auto',
        },
      },
    );

    expect(offsetScore.updated).toBe(true);
    expect(findScoreEvent(offsetScore.score, 'event-offset-annotation')?.event)
      .toMatchObject({
        annotationOffsets: {
          lyric: {
            x: ANNOTATION_OFFSET_LIMIT.x,
            y: -ANNOTATION_OFFSET_LIMIT.y,
          },
        },
        lyric: 'drag',
      });
    expect(resetScore.updated).toBe(true);
    expect(findScoreEvent(resetScore.score, 'event-offset-annotation')?.event)
      .toMatchObject({
        annotationOffsets: {
          lyric: {
            x: ANNOTATION_OFFSET_LIMIT.x,
            y: -ANNOTATION_OFFSET_LIMIT.y,
          },
        },
        annotationPlacements: {
          lyric: 'above',
        },
      });
    expect(autoScore.updated).toBe(true);
    expect(
      findScoreEvent(autoScore.score, 'event-offset-annotation')?.event
        .annotationOffsets,
    ).toBeUndefined();
  });

  it('updates annotation offsets in place without rematerializing measure rhythm', () => {
    const beforeEvents = getVoiceEvents(annotationDragLabFixture, 'treble', 0);
    const result = tryUpdateScoreEvent(
      annotationDragLabFixture,
      'annotation-lab-anchor',
      {
        annotationOffset: {
          kind: 'lyric',
          offset: { x: 40, y: 18 },
        },
      },
    );
    const afterEvents = getVoiceEvents(result.score, 'treble', 0);

    expect(result.updated).toBe(true);
    expect(beforeEvents?.map((event) => event.id)).toEqual([
      'annotation-lab-anchor',
      'annotation-lab-nearby',
    ]);
    expect(afterEvents?.map((event) => event.id)).toEqual(
      beforeEvents?.map((event) => event.id),
    );
    expect(afterEvents?.[1]).toBe(beforeEvents?.[1]);
  });

  it('updates performance markings on a selected event', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-performance-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const marked = tryUpdateScoreEvent(score, 'event-performance-me', {
      dynamic: ' mf ',
      fermata: true,
      glissando: true,
      hairpin: 'crescendo',
      pedal: 'start',
    });
    const cleared = tryUpdateScoreEvent(marked.score, 'event-performance-me', {
      dynamic: null,
      fermata: false,
      glissando: false,
      hairpin: null,
      pedal: null,
    });

    expect(marked.updated).toBe(true);
    expect(findScoreEvent(marked.score, 'event-performance-me')?.event).toMatchObject({
      dynamic: 'mf',
      fermata: true,
      glissando: true,
      hairpin: 'crescendo',
      pedal: 'start',
    });
    expect(findScoreEvent(cleared.score, 'event-performance-me')?.event).not.toMatchObject({
      dynamic: expect.any(String),
      fermata: true,
      glissando: true,
      hairpin: expect.any(String),
      pedal: expect.any(String),
    });
  });

  it('normalizes combinable articulations on pitched events and rejects them on rests', () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-articulate-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const marked = tryUpdateScoreEvent(noteScore, 'event-articulate-me', {
      articulations: ['staccato', 'accent', 'accent', 'marcato'],
    });
    const cleared = tryUpdateScoreEvent(marked.score, 'event-articulate-me', {
      articulations: null,
    });
    const restScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-rest-articulation',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'rest',
      pitch: { step: 'C', octave: 4 },
    });
    const restResult = tryUpdateScoreEvent(restScore, 'event-rest-articulation', {
      articulations: ['accent'],
    });

    expect(findScoreEvent(marked.score, 'event-articulate-me')?.event)
      .toMatchObject({
        articulations: ['marcato', 'accent', 'staccato'],
      });
    expect(findScoreEvent(cleared.score, 'event-articulate-me')?.event)
      .not.toMatchObject({
        articulations: expect.any(Array),
      });
    expect(findScoreEvent(restResult.score, 'event-rest-articulation')?.event)
      .not.toMatchObject({
        articulations: expect.any(Array),
      });
  });

  it('flips a selected stem direction without changing rhythm data', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-flip-me',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const flipped = tryFlipScoreEventStemDirection(score, 'event-flip-me');
    const flippedAgain = tryFlipScoreEventStemDirection(
      flipped.score,
      'event-flip-me',
    );

    expect(flipped.updated).toBe(true);
    expect(flipped.direction).toBe('down');
    expect(findScoreEvent(flipped.score, 'event-flip-me')?.event)
      .toMatchObject({
        beat: 0,
        duration: 'quarter',
        stemDirection: 'down',
      });
    expect(flippedAgain.updated).toBe(true);
    expect(findScoreEvent(flippedAgain.score, 'event-flip-me')?.event)
      .toMatchObject({
        beat: 0,
        duration: 'quarter',
        stemDirection: 'up',
      });
  });

  it('flips attached beamed notes without crossing the next beat group', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'beam-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondScore = placeScoreEvent(firstScore, {
      eventId: 'beam-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const score = placeScoreEvent(secondScore, {
      eventId: 'beam-note-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const flipped = tryFlipScoreEventStemDirection(score, 'beam-note-2');

    expect(flipped.updated).toBe(true);
    expect(flipped.eventIds).toEqual([
      'beam-note-1',
      'beam-note-2',
    ]);
    expect(
      ['beam-note-1', 'beam-note-2'].map(
        (eventId) => findScoreEvent(flipped.score, eventId)?.event.stemDirection,
      ),
    ).toEqual(['down', 'down']);
    expect(
      findScoreEvent(flipped.score, 'beam-note-3')?.event.stemDirection,
    ).toBeUndefined();
  });

  it('rejects flipping whole notes and rests because they have no stem', () => {
    const wholeScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'whole-no-stem',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'whole',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const restScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 4 }), {
      eventId: 'event-rest-no-stem',
      staffId: 'treble',
      measureIndex: 1,
      beat: 2,
      duration: 'half',
      entryMode: 'rest',
      pitch: { step: 'C', octave: 4 },
    });

    expect(tryFlipScoreEventStemDirection(wholeScore, 'whole-no-stem')).toMatchObject({
      updated: false,
      reason: 'missing-stem',
    });
    expect(tryFlipScoreEventStemDirection(restScore, 'event-rest-no-stem')).toMatchObject({
      updated: false,
      reason: 'missing-stem',
    });
  });

  it('sets and clears a section marker across the measure column', () => {
    const score = createEmptyScore('grand', { measureCount: 2 });
    const markedScore = setMeasureSectionMarker(score, 1, ' Intro ');
    const clearedScore = setMeasureSectionMarker(markedScore, 1, null);

    expect(
      markedScore.parts[0]?.staves.map(
        (staff) => staff.measures[1]?.sectionMarker,
      ),
    ).toEqual(['Intro', 'Intro']);
    expect(
      clearedScore.parts[0]?.staves.map(
        (staff) => staff.measures[1]?.sectionMarker,
      ),
    ).toEqual([undefined, undefined]);
  });

  it('updates chord duration without collapsing it to a single note', () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(noteScore, {
      eventId: 'event-chord',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-chord', {
      duration: 'half',
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-chord')?.event).toMatchObject({
      kind: 'chord',
      duration: 'half',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
      ],
    });
    expectMeasureEventsFillMeasure(result.score);
  });

  it('updates only the selected pitch in a chord column', () => {
    const cScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const eScore = placeScoreEvent(cScore, {
      eventId: 'event-e',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = placeScoreEvent(eScore, {
      eventId: 'event-g',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-g', {
      accidental: 'sharp',
      pitchIndex: 1,
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-g')?.event).toMatchObject({
      kind: 'chord',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4, accidental: 'sharp' },
        { step: 'G', octave: 4 },
      ],
    });
  });

  it('moves a chord column without losing its pitches', () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'event-c',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(noteScore, {
      eventId: 'event-chord',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const result = tryUpdateScoreEvent(score, 'event-chord', {
      beat: 2,
    });

    expect(result.updated).toBe(true);
    expect(findScoreEvent(result.score, 'event-chord')?.event).toMatchObject({
      kind: 'chord',
      beat: 2,
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
      ],
    });
    expectMeasureEventsFillMeasure(result.score);
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
      getVoiceEvents(result.score, 'treble', 0),
    ).toEqual([
      {
        id: 'rest-treble-m1-t0-whole',
        kind: 'rest',
        beat: 0,
        duration: 'whole',
      },
    ]);
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

  it('can keep an invalid duration update so the user can repair the measure', () => {
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
      allowInvalidMeasure: true,
      duration: 'half',
    });

    expect(result).toMatchObject({
      updated: true,
      reason: 'measure-overflow',
    });
    expect(findScoreEvent(result.score, 'event-too-late')?.event).toMatchObject({
      beat: 3,
      duration: 'half',
    });

    const repairedScore = deleteScoreEvent(result.score, 'event-too-late');

    expect(getVoiceEvents(repairedScore, 'treble', 0)).toEqual([
      {
        id: 'rest-treble-m1-t0-whole',
        kind: 'rest',
        beat: 0,
        duration: 'whole',
      },
    ]);
  });
});
