import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import {
  extremeClefOttavaChromaticFixture,
  extremeScoreFixtures,
  extremeTupletRepeatEtudeFixture,
  extremeVocalPianoFixture,
  pianoPolyphonyStudyFixture,
  stressPianoHardeningFixture,
} from '../../domain/score/fixtures';
import {
  findScoreEvent,
  placeScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  tryMoveKeySignatureSymbol,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import {
  buildPlaybackMeasureOrder,
  buildPlaybackTimeline,
  findPlaybackStartSecondsForEventId,
  getActiveTimelineEvent,
  getActiveTimelineEvents,
  getPlaybackBeatAtSeconds,
  getPlaybackScoreBeatAtSeconds,
  getTimelineDurationSeconds,
} from './timeline';
import type { ChordEvent, ScoreEvent } from '../../domain/score/types';
import { tryToggleTieToNext } from '../../domain/score/noteConnections';
import { tryToggleOttavaToNext } from '../../domain/score/ottava';
import { getRepeatPlaybackIssues } from '../../domain/score/repeatJumps';

function roundPlaybackNumber(value: number) {
  return Number(value.toFixed(4));
}

function summarizeTimelineEvents(score: Parameters<typeof buildPlaybackTimeline>[0], ids: string[]) {
  const timeline = buildPlaybackTimeline(score);

  return Object.fromEntries(
    ids.map((id) => [
      id,
      timeline.filter((event) => event.id === id).map((event) => ({
        articulations: event.articulations,
        durationSeconds: roundPlaybackNumber(event.durationSeconds),
        pitches: event.pitches,
        startSeconds: roundPlaybackNumber(event.startSeconds),
        sustainedEventIds: event.sustainedEventIds,
      })),
    ]),
  );
}

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
    expect(timeline.map((event) => event.voiceIndex)).toEqual([0, 0]);
    expect(timeline.map((event) => event.pitches)).toEqual([
      [{ step: 'C', octave: 3 }],
      [{ step: 'C', octave: 5 }],
    ]);
  });

  it('preserves same-staff parallel voices as distinct timeline events', () => {
    const timeline = buildPlaybackTimeline(pianoPolyphonyStudyFixture);
    const trebleOpening = timeline.filter(
      (event) =>
        event.staffId === 'treble' &&
        event.measureIndex === 0 &&
        event.beat === 0,
    );

    expect(trebleOpening.map((event) => event.id)).toEqual([
      'poly-rh-v1-e5',
      'poly-rh-v2-c5-held',
    ]);
    expect(trebleOpening.map((event) => event.voiceIndex)).toEqual([0, 1]);
    expect(getActiveTimelineEvents(timeline, 0).map((event) => event.id)).toEqual([
      'poly-lh-c-open',
      'poly-rh-v1-e5',
      'poly-rh-v2-c5-held',
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

  it('uses effective triplet duration for playback timing', () => {
    const score = createEmptyScore('treble', { measureCount: 1, tempo: 60 });
    const events: ScoreEvent[] = [0, 1, 2].map((index) => ({
      id: `triplet-note-${index}`,
      kind: 'note',
      beat: Number((index / 3).toFixed(4)),
      duration: 'eighth',
      pitch: { step: 'C', octave: 4 + index },
      tuplet: {
        actualNotes: 3,
        id: 'tuplet-playback',
        index,
        normalNotes: 2,
      },
    }));

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(...events);

    const timeline = buildPlaybackTimeline(score);

    expect(timeline.map((event) => Number(event.startSeconds.toFixed(4)))).toEqual([
      0,
      0.3333,
      0.6667,
    ]);
    expect(timeline.map((event) => Number(event.durationSeconds.toFixed(4)))).toEqual([
      0.3333,
      0.3333,
      0.3333,
    ]);
  });

  it('keeps notation duration but applies articulation playback length and velocity', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { tempo: 60 }), {
      eventId: 'accented-staccato',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const markedScore = tryUpdateScoreEvent(score, 'accented-staccato', {
      articulations: ['accent', 'staccato'],
    }).score;

    const timelineEvent = buildPlaybackTimeline(markedScore)[0];

    expect(timelineEvent).toMatchObject({
      articulations: ['accent', 'staccato'],
      durationSeconds: 1,
      soundDurationSeconds: 0.5,
      velocity: 0.943,
    });
  });

  it('applies short articulations and breath marks to sound length without changing notation duration', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { tempo: 60 }), {
      eventId: 'breath-staccatissimo',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const markedScore = tryUpdateScoreEvent(score, 'breath-staccatissimo', {
      articulations: ['breath', 'staccatissimo'],
    }).score;
    const timelineEvent = buildPlaybackTimeline(markedScore)[0];

    expect(timelineEvent).toMatchObject({
      articulations: ['breath', 'staccatissimo'],
      durationSeconds: 1,
      soundDurationSeconds: 0.35,
    });
  });

  it('extends a tied note and does not retrigger the tie target', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble', { tempo: 60 }), {
      eventId: 'tie-playback-source',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = placeScoreEvent(firstScore, {
      eventId: 'tie-playback-target',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const tiedScore = tryToggleTieToNext(score, 'tie-playback-source').score;
    const timeline = buildPlaybackTimeline(tiedScore);

    expect(timeline.map((event) => event.id)).toEqual(['tie-playback-source']);
    expect(timeline[0]).toMatchObject({
      durationBeats: 2,
      durationSeconds: 2,
      soundDurationSeconds: 2,
      pitches: [{ step: 'C', octave: 4 }],
      sustainedEventIds: ['tie-playback-source', 'tie-playback-target'],
    });
    expect(
      findPlaybackStartSecondsForEventId(timeline, 'tie-playback-target'),
    ).toBe(0);
    expect(findPlaybackStartSecondsForEventId(timeline, null)).toBeNull();
  });

  it('uses tempo consistently for timeline seconds and cursor beat speed', () => {
    const slowScore = placeScoreEvent(createEmptyScore('treble', { tempo: 60 }), {
      eventId: 'tempo-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const fastScore = {
      ...slowScore,
      tempo: 120,
    };

    expect(buildPlaybackTimeline(slowScore)[0]?.durationSeconds).toBe(1);
    expect(buildPlaybackTimeline(fastScore)[0]?.durationSeconds).toBe(0.5);
    expect(getPlaybackScoreBeatAtSeconds(buildPlaybackTimeline(slowScore), 60, 0.5))
      .toBe(0.5);
    expect(getPlaybackScoreBeatAtSeconds(buildPlaybackTimeline(fastScore), 120, 0.5))
      .toBe(1);
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

  it('applies active ottava ranges to playback without changing written pitch data', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'ottava-playback-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondScore = placeScoreEvent(firstScore, {
      eventId: 'ottava-playback-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const thirdScore = placeScoreEvent(secondScore, {
      eventId: 'ottava-playback-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: 3,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryToggleOttavaToNext(thirdScore, 'ottava-playback-1', '8va')
      .score;

    expect(buildPlaybackTimeline(score).map((event) => event.pitch)).toEqual([
      { step: 'C', octave: 5 },
      { step: 'D', octave: 5 },
      { step: 'E', octave: 4 },
    ]);
    expect(findScoreEvent(score, 'ottava-playback-1')?.event).toMatchObject({
      pitch: { step: 'C', octave: 4 },
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

  it('skips volta ending measures on the wrong repeat pass', () => {
    const scoreWithRepeatStart = setMeasureRepeatJump(
      createEmptyScore('treble', { measureCount: 5 }),
      0,
      'repeat-start',
    );
    const scoreWithFirstEnding = setMeasureRepeatJump(
      scoreWithRepeatStart,
      1,
      'ending-1',
    );
    const scoreWithSecondEnding = setMeasureRepeatJump(
      scoreWithFirstEnding,
      2,
      'ending-2',
    );
    const score = setMeasureRepeatJump(scoreWithSecondEnding, 3, 'repeat-end');

    expect(buildPlaybackMeasureOrder(score)).toEqual([0, 1, 3, 0, 2, 3, 4]);
  });

  it('expands D.S. al Fine by replaying from Segno to Fine', () => {
    const scoreWithSegno = setMeasureRepeatJump(
      createEmptyScore('treble', { measureCount: 5 }),
      1,
      'segno',
    );
    const scoreWithFine = setMeasureRepeatJump(scoreWithSegno, 3, 'fine');
    const score = setMeasureRepeatJump(scoreWithFine, 4, 'ds-al-fine');

    expect(buildPlaybackMeasureOrder(score)).toEqual([
      0,
      1,
      2,
      3,
      4,
      1,
      2,
      3,
    ]);
  });

  it('expands D.C. al Coda by replaying to To Coda, then jumping to Coda', () => {
    const scoreWithToCoda = setMeasureRepeatJump(
      createEmptyScore('treble', { measureCount: 5 }),
      1,
      'to-coda',
    );
    const scoreWithDc = setMeasureRepeatJump(scoreWithToCoda, 3, 'dc-al-coda');
    const score = setMeasureRepeatJump(scoreWithDc, 4, 'coda');

    expect(buildPlaybackMeasureOrder(score)).toEqual([0, 1, 2, 3, 0, 1, 4]);
  });

  it('reports missing playback anchors for repeat jumps', () => {
    const scoreWithDs = setMeasureRepeatJump(
      createEmptyScore('treble', { measureCount: 2 }),
      1,
      'ds-al-fine',
    );
    const score = setMeasureRepeatJump(scoreWithDs, 0, 'dc-al-coda');

    expect(getRepeatPlaybackIssues(score)).toEqual([
      {
        kind: 'missing-to-coda',
        measureIndex: 0,
        repeatJump: 'dc-al-coda',
      },
      {
        kind: 'missing-coda',
        measureIndex: 0,
        repeatJump: 'dc-al-coda',
      },
      {
        kind: 'missing-segno',
        measureIndex: 1,
        repeatJump: 'ds-al-fine',
      },
      {
        kind: 'missing-fine',
        measureIndex: 1,
        repeatJump: 'ds-al-fine',
      },
    ]);
  });

  it.each(extremeScoreFixtures)(
    'builds a finite playback timeline for the extreme fixture $title',
    (score) => {
      const timeline = buildPlaybackTimeline(score);

      expect(timeline.length).toBeGreaterThan(0);
      timeline.forEach((event) => {
        expect(Number.isFinite(event.startSeconds)).toBe(true);
        expect(Number.isFinite(event.durationSeconds)).toBe(true);
        expect(event.durationSeconds).toBeGreaterThan(0);
        expect(event.pitches.length).toBeGreaterThan(0);
      });
    },
  );

  it('keeps hardening fixture tie sustain and ottava pitch shifts stable', () => {
    expect(
      summarizeTimelineEvents(stressPianoHardeningFixture, [
        'stress-cross-source',
        'stress-m9-d5',
        'stress-m9-c5',
      ]),
    ).toEqual({
      'stress-cross-source': [
        {
          articulations: undefined,
          durationSeconds: 0.9091,
          pitches: [{ octave: 4, step: 'C' }],
          startSeconds: 6.8182,
          sustainedEventIds: ['stress-cross-source', 'stress-cross-target'],
        },
      ],
      'stress-m9-c5': [
        {
          articulations: undefined,
          durationSeconds: 0.9091,
          pitches: [{ octave: 6, step: 'C' }],
          startSeconds: 17.2727,
          sustainedEventIds: undefined,
        },
      ],
      'stress-m9-d5': [
        {
          articulations: undefined,
          durationSeconds: 0.9091,
          pitches: [{ octave: 6, step: 'D' }],
          startSeconds: 16.3636,
          sustainedEventIds: undefined,
        },
      ],
    });
  });

  it('keeps extreme tuplets, repeat replay, and chord playback stable', () => {
    expect(buildPlaybackMeasureOrder(extremeTupletRepeatEtudeFixture)).toEqual([
      0,
      1,
      2,
      3,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      5,
      6,
      8,
      9,
    ]);
    expect(
      summarizeTimelineEvents(extremeTupletRepeatEtudeFixture, [
        'extreme-duplet-opening-1',
        'extreme-triplet-opening-2',
        'extreme-repeat-m9-chord',
      ]),
    ).toEqual({
      'extreme-duplet-opening-1': [
        {
          articulations: undefined,
          durationSeconds: 0.4167,
          pitches: [{ accidental: 'sharp', octave: 5, step: 'C' }],
          startSeconds: 0,
          sustainedEventIds: undefined,
        },
        {
          articulations: undefined,
          durationSeconds: 0.4167,
          pitches: [{ accidental: 'sharp', octave: 5, step: 'C' }],
          startSeconds: 8.3333,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-repeat-m9-chord': [
        {
          articulations: undefined,
          durationSeconds: 0.8333,
          pitches: [
            { octave: 5, step: 'D' },
            { accidental: 'sharp', octave: 5, step: 'F' },
            { octave: 5, step: 'A' },
          ],
          startSeconds: 27.9167,
          sustainedEventIds: undefined,
        },
        {
          articulations: undefined,
          durationSeconds: 0.8333,
          pitches: [
            { octave: 5, step: 'D' },
            { accidental: 'sharp', octave: 5, step: 'F' },
            { octave: 5, step: 'A' },
          ],
          startSeconds: 36.25,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-triplet-opening-2': [
        {
          articulations: undefined,
          durationSeconds: 0.2778,
          pitches: [{ accidental: 'sharp', octave: 5, step: 'F' }],
          startSeconds: 1.1111,
          sustainedEventIds: undefined,
        },
        {
          articulations: undefined,
          durationSeconds: 0.2778,
          pitches: [{ accidental: 'sharp', octave: 5, step: 'F' }],
          startSeconds: 9.4445,
          sustainedEventIds: undefined,
        },
      ],
    });
  });

  it('keeps vocal lyric-map triplet timing aligned with the piano staff', () => {
    const timeline = buildPlaybackTimeline(extremeVocalPianoFixture);

    expect(
      getActiveTimelineEvents(timeline, 7.1429).map((event) => event.id),
    ).toEqual(['extreme-vocal-b2-mid', 'extreme-vocal-triplet-word-1']);
    expect(
      summarizeTimelineEvents(extremeVocalPianoFixture, [
        'extreme-vocal-m0-a',
        'extreme-vocal-triplet-word-2',
      ]),
    ).toEqual({
      'extreme-vocal-m0-a': [
        {
          articulations: undefined,
          durationSeconds: 0.7143,
          pitches: [{ octave: 4, step: 'D' }],
          startSeconds: 0,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-vocal-triplet-word-2': [
        {
          articulations: undefined,
          durationSeconds: 0.4762,
          pitches: [{ octave: 4, step: 'A' }],
          startSeconds: 7.6191,
          sustainedEventIds: undefined,
        },
      ],
    });
  });

  it('keeps chromatic key signature and ottava playback pitches stable', () => {
    expect(buildPlaybackMeasureOrder(extremeClefOttavaChromaticFixture)).toEqual([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      0,
      1,
      2,
    ]);
    expect(
      summarizeTimelineEvents(extremeClefOttavaChromaticFixture, [
        'extreme-clef-ottava-t0-e6',
        'extreme-clef-ottava-t1-chord',
        'extreme-clef-ottava-b2-c5',
        'extreme-clef-ottava-t5-a',
      ]),
    ).toEqual({
      'extreme-clef-ottava-b2-c5': [
        {
          articulations: undefined,
          durationSeconds: 0.5556,
          pitches: [{ octave: 4, step: 'C' }],
          startSeconds: 4.4444,
          sustainedEventIds: undefined,
        },
        {
          articulations: undefined,
          durationSeconds: 0.5556,
          pitches: [{ octave: 4, step: 'C' }],
          startSeconds: 22.2222,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-clef-ottava-t0-e6': [
        {
          articulations: ['marcato'],
          durationSeconds: 0.5556,
          pitches: [{ accidental: 'sharp', octave: 8, step: 'E' }],
          startSeconds: 0,
          sustainedEventIds: undefined,
        },
        {
          articulations: ['marcato'],
          durationSeconds: 0.5556,
          pitches: [{ accidental: 'sharp', octave: 8, step: 'E' }],
          startSeconds: 17.7778,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-clef-ottava-t1-chord': [
        {
          articulations: undefined,
          durationSeconds: 0.5556,
          pitches: [
            { accidental: 'sharp', octave: 5, step: 'C' },
            { accidental: 'sharp', octave: 5, step: 'E' },
            { accidental: 'sharp', octave: 5, step: 'G' },
          ],
          startSeconds: 3.8889,
          sustainedEventIds: undefined,
        },
        {
          articulations: undefined,
          durationSeconds: 0.5556,
          pitches: [
            { accidental: 'sharp', octave: 5, step: 'C' },
            { accidental: 'sharp', octave: 5, step: 'E' },
            { accidental: 'sharp', octave: 5, step: 'G' },
          ],
          startSeconds: 21.6667,
          sustainedEventIds: undefined,
        },
      ],
      'extreme-clef-ottava-t5-a': [
        {
          articulations: undefined,
          durationSeconds: 0.5556,
          pitches: [{ accidental: 'flat', octave: 5, step: 'D' }],
          startSeconds: 11.1111,
          sustainedEventIds: undefined,
        },
      ],
    });
  });
});
