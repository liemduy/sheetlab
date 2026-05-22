import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { placeScoreEvent } from '../../domain/score/editing';
import {
  buildPracticePedalTargets,
  createMissedPedalResult,
  evaluatePedalTarget,
  findNearestPedalTarget,
} from './practicePedal';

describe('practice pedal targets', () => {
  it('builds pedal down and up targets from score events', () => {
    const score = placeScoreEvent(createEmptyScore('treble', { tempo: 120 }), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'pedaled-note',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const pedaledScore = {
      ...score,
      parts: score.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) => ({
          ...staff,
          measures: staff.measures.map((measure) => ({
            ...measure,
            voices: measure.voices.map((voice) => ({
              ...voice,
              events: voice.events.map((event) =>
                event.id === 'pedaled-note'
                  ? { ...event, pedal: 'start-release' as const }
                  : event,
              ),
            })),
          })),
        })),
      })),
    };
    const targets = buildPracticePedalTargets(pedaledScore);

    expect(targets).toMatchObject([
      { action: 'down', eventId: 'pedaled-note', startSeconds: 0 },
      { action: 'up', eventId: 'pedaled-note', startSeconds: 0.5 },
    ]);
  });

  it('evaluates pedal timing and missed targets', () => {
    const target = {
      action: 'down' as const,
      eventId: 'pedaled-note',
      id: 'pedaled-note-pedal-down',
      measureIndex: 0,
      startSeconds: 1,
    };

    expect(evaluatePedalTarget(target, 1.1, 220)).toMatchObject({
      deltaMs: 100,
      status: 'correct',
    });
    expect(evaluatePedalTarget(target, 0.6, 220)).toMatchObject({
      deltaMs: -400,
      status: 'early',
    });
    expect(createMissedPedalResult(target)).toMatchObject({
      action: 'down',
      status: 'missed',
    });
    expect(
      findNearestPedalTarget([target], {
        action: 'down',
        elapsedSeconds: 1.2,
        resolvedTargetIds: new Set(),
      })?.id,
    ).toBe('pedaled-note-pedal-down');
  });
});
