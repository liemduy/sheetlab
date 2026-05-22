import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { placeScoreEvent } from '../../domain/score/editing';
import { buildPracticeTargets, getPracticeTargetAtSeconds } from './practiceTimeline';

describe('practice timeline', () => {
  it('builds MIDI-note practice targets from score playback timing', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { tempo: 120 }), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'middle-c',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const targets = buildPracticeTargets(score);

    expect(targets[0]).toMatchObject({
      eventIds: ['middle-c'],
      measureIndex: 0,
      midiNotes: [60],
      staffId: 'treble',
      startSeconds: 0,
    });
  });

  it('filters hand mode targets by staff', () => {
    const trebleScore = placeScoreEvent(createEmptyScore('grand'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'right',
      measureIndex: 0,
      pitch: { step: 'C', octave: 5 },
      staffId: 'treble',
    });
    const score = placeScoreEvent(trebleScore, {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'left',
      measureIndex: 0,
      pitch: { step: 'C', octave: 3 },
      staffId: 'bass',
    });

    expect(buildPracticeTargets(score, { handMode: 'right' }).map((target) => target.staffId)).toEqual(['treble']);
    expect(buildPracticeTargets(score, { handMode: 'left' }).map((target) => target.staffId)).toEqual(['bass']);
  });

  it('groups simultaneous two-hand notes into one target', () => {
    const trebleScore = placeScoreEvent(createEmptyScore('grand'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'right',
      measureIndex: 0,
      pitch: { step: 'C', octave: 5 },
      staffId: 'treble',
    });
    const score = placeScoreEvent(trebleScore, {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'left',
      measureIndex: 0,
      pitch: { step: 'C', octave: 3 },
      staffId: 'bass',
    });
    const targets = buildPracticeTargets(score);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      eventIds: ['left', 'right'],
      midiNotes: [48, 72],
      staffIds: ['bass', 'treble'],
    });
  });

  it('finds a target near an elapsed rhythm time', () => {
    const score = [0, 1].reduce(
      (currentScore, beat) =>
        placeScoreEvent(currentScore, {
          beat,
          duration: 'quarter',
          entryMode: 'note',
          eventId: `event-${beat}`,
          measureIndex: 0,
          pitch: { step: 'C', octave: 4 },
          staffId: 'treble',
        }),
      createEmptyScore('treble', { tempo: 120 }),
    );
    const targets = buildPracticeTargets(score);

    expect(getPracticeTargetAtSeconds(targets, 0.48)?.eventIds).toEqual(['event-1']);
    expect(getPracticeTargetAtSeconds(targets, 0.9)).toBeNull();
  });
});
