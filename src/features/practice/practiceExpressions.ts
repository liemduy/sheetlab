import type { Score, ScoreEvent } from '../../domain/score/types';
import type { PracticeNoteLifecycle } from './practiceHold';
import type { PracticeTarget } from './practiceTimeline';

export type PracticeExpressionFeedbackKind =
  | 'articulation'
  | 'dynamic'
  | 'fermata'
  | 'hairpin'
  | 'pedal';

export interface PracticeExpressionFeedback {
  kind: PracticeExpressionFeedbackKind;
  label: string;
  measureIndex: number;
  severity: 'hint' | 'notice';
  targetId: string;
}

function getScoreEventById(score: Score) {
  return new Map(
    score.parts.flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.measures.flatMap((measure) =>
          measure.voices.flatMap((voice) =>
            voice.events.map((event) => [event.id, event] as const),
          ),
        ),
      ),
    ),
  );
}

function getEventExpressionLabels(event: ScoreEvent) {
  return [
    event.pedal ? `Pedal ${event.pedal}` : null,
    event.dynamic ? `Dynamic ${event.dynamic}` : null,
    event.hairpin ? `Hairpin ${event.hairpin}` : null,
    event.articulations?.length
      ? `Articulation ${event.articulations.join(', ')}`
      : null,
    event.fermata ? 'Fermata' : null,
  ].filter(Boolean) as string[];
}

export function getPracticeTargetExpressionLabels(
  score: Score,
  target: PracticeTarget | null,
) {
  if (!target) {
    return [];
  }

  const eventById = getScoreEventById(score);

  return [
    ...new Set(
      target.eventIds.flatMap((eventId) => {
        const event = eventById.get(eventId);

        return event ? getEventExpressionLabels(event) : [];
      }),
    ),
  ];
}

export function getPracticeExpressionCapabilitySummary(score: Score) {
  const labels = new Set<string>();

  getScoreEventById(score).forEach((event) => {
    if (event.pedal) labels.add('pedal');
    if (event.dynamic) labels.add('dynamics');
    if (event.hairpin) labels.add('hairpins');
    if (event.articulations?.length) labels.add('articulations');
    if (event.fermata) labels.add('fermatas');
  });

  return [...labels];
}

function getLifecycleVelocityAverage(lifecycles: readonly PracticeNoteLifecycle[]) {
  const velocities = lifecycles
    .map((lifecycle) => lifecycle.velocity)
    .filter((velocity): velocity is number => typeof velocity === 'number');

  if (velocities.length === 0) {
    return null;
  }

  return Math.round(
    velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length,
  );
}

function getTargetLifecycles(
  target: PracticeTarget,
  lifecycles: readonly PracticeNoteLifecycle[],
  attackToleranceSeconds = 0.26,
) {
  const expectedNotes = target.attackMidiNotes ?? target.midiNotes;

  return lifecycles.filter(
    (lifecycle) =>
      expectedNotes.includes(lifecycle.midiNote) &&
      Math.abs(lifecycle.startSeconds - target.startSeconds) <=
        attackToleranceSeconds,
  );
}

function getDynamicFeedbackLabel(
  dynamic: string,
  targetVelocity: number | null,
  baselineVelocity: number | null,
) {
  const normalizedDynamic = dynamic.trim().toLowerCase();
  const isSoft = normalizedDynamic === 'p' || normalizedDynamic === 'pp' ||
    normalizedDynamic === 'ppp' || normalizedDynamic === 'mp';
  const isStrong = normalizedDynamic === 'f' || normalizedDynamic === 'ff' ||
    normalizedDynamic === 'fff' || normalizedDynamic === 'mf' ||
    normalizedDynamic === 'sfz' || normalizedDynamic === 'fp';

  if (targetVelocity === null || baselineVelocity === null) {
    if (isSoft) {
      return `Aim for a softer touch at ${dynamic}`;
    }

    if (isStrong) {
      return `Aim for a clearer, stronger touch at ${dynamic}`;
    }

    return `Notice the ${dynamic} dynamic`;
  }

  if (isSoft && targetVelocity >= baselineVelocity - 6) {
    return `${dynamic} should feel softer than your average touch`;
  }

  if (isStrong && targetVelocity <= baselineVelocity + 6) {
    return `${dynamic} should project more than your average touch`;
  }

  return `${dynamic} dynamic shape looks plausible`;
}

function getTargetEventExpressions(
  score: Score,
  target: PracticeTarget,
) {
  const eventById = getScoreEventById(score);

  return target.eventIds.flatMap((eventId) => {
    const event = eventById.get(eventId);

    return event ? [event] : [];
  });
}

export function buildPracticeExpressionFeedback({
  lifecycles,
  score,
  targets,
}: {
  lifecycles: readonly PracticeNoteLifecycle[];
  score: Score;
  targets: readonly PracticeTarget[];
}) {
  const baselineVelocity = getLifecycleVelocityAverage(lifecycles);

  return targets.flatMap((target): PracticeExpressionFeedback[] => {
    const targetLifecycles = getTargetLifecycles(target, lifecycles);
    const targetVelocity = getLifecycleVelocityAverage(targetLifecycles);
    const feedback: PracticeExpressionFeedback[] = [];

    getTargetEventExpressions(score, target).forEach((event) => {
      if (event.dynamic) {
        feedback.push({
          kind: 'dynamic',
          label: getDynamicFeedbackLabel(
            event.dynamic,
            targetVelocity,
            baselineVelocity,
          ),
          measureIndex: target.measureIndex,
          severity: targetVelocity === null ? 'hint' : 'notice',
          targetId: target.id,
        });
      }

      if (event.hairpin) {
        feedback.push({
          kind: 'hairpin',
          label:
            event.hairpin === 'crescendo'
              ? 'Shape this phrase gradually louder'
              : 'Shape this phrase gradually softer',
          measureIndex: target.measureIndex,
          severity: 'hint',
          targetId: target.id,
        });
      }

      if (event.articulations?.includes('staccato')) {
        feedback.push({
          kind: 'articulation',
          label: 'Keep the staccato light and short',
          measureIndex: target.measureIndex,
          severity: 'hint',
          targetId: target.id,
        });
      }

      if (event.articulations?.includes('tenuto')) {
        feedback.push({
          kind: 'articulation',
          label: 'Hold the tenuto close to full value',
          measureIndex: target.measureIndex,
          severity: 'hint',
          targetId: target.id,
        });
      }

      if (event.fermata) {
        feedback.push({
          kind: 'fermata',
          label: 'Let the fermata breathe before moving on',
          measureIndex: target.measureIndex,
          severity: 'hint',
          targetId: target.id,
        });
      }

      if (event.pedal) {
        feedback.push({
          kind: 'pedal',
          label: 'Watch the pedal change at this point',
          measureIndex: target.measureIndex,
          severity: 'hint',
          targetId: target.id,
        });
      }
    });

    return feedback;
  });
}
