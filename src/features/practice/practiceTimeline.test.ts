import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { placeScoreEvent } from '../../domain/score/editing';
import { pianoPolyphonyStudyFixture } from '../../domain/score/fixtures';
import {
  buildPracticeTargets,
  formatPracticeTargetVoiceLabel,
  getPracticeTargetAtSeconds,
} from './practiceTimeline';

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
      voiceRefs: [{ staffId: 'treble', voiceIndex: 0 }],
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
      voiceRefs: [
        { staffId: 'bass', voiceIndex: 0 },
        { staffId: 'treble', voiceIndex: 0 },
      ],
    });
  });

  it('keeps same-staff polyphony voices in one attack target with lane labels', () => {
    const targets = buildPracticeTargets(pianoPolyphonyStudyFixture);
    const openingTarget = targets[0];

    expect(openingTarget).toMatchObject({
      eventIds: [
        'poly-lh-c-open',
        'poly-rh-v1-e5',
        'poly-rh-v2-c5-held',
      ],
      measureIndex: 0,
      midiNotes: [36, 43, 72, 76],
      voiceRefs: [
        { staffId: 'bass', voiceIndex: 0 },
        { staffId: 'treble', voiceIndex: 0 },
        { staffId: 'treble', voiceIndex: 1 },
      ],
    });
    expect(formatPracticeTargetVoiceLabel(openingTarget)).toBe(
      'LH V1 + RH V1 + RH V2',
    );
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
