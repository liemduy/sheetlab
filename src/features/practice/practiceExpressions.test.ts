import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { placeScoreEvent, tryUpdateScoreEvent } from '../../domain/score/editing';
import { buildPracticeTargets } from './practiceTimeline';
import { buildPracticeExpressionFeedback } from './practiceExpressions';

describe('practice expression feedback', () => {
  it('gives relative dynamic feedback without affecting core scoring', () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'soft-note',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const score = tryUpdateScoreEvent(noteScore, 'soft-note', {
      dynamic: 'p',
    }).score;
    const targets = buildPracticeTargets(score);
    const feedback = buildPracticeExpressionFeedback({
      lifecycles: [
        { midiNote: 60, startSeconds: 0, velocity: 92 },
        { midiNote: 64, startSeconds: 1, velocity: 64 },
      ],
      score,
      targets,
    });

    expect(feedback[0]).toMatchObject({
      kind: 'dynamic',
      label: 'p should feel softer than your average touch',
      severity: 'notice',
    });
  });
});
