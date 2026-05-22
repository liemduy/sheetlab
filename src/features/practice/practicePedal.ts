import type { PedalMark, Score } from '../../domain/score/types';
import { buildPlaybackTimeline } from '../playback/timeline';

export type PracticePedalAction = 'down' | 'up';
export type PracticePedalStatus = 'correct' | 'early' | 'late' | 'missed';

export interface PracticePedalTarget {
  action: PracticePedalAction;
  eventId: string;
  id: string;
  measureIndex: number;
  startSeconds: number;
}

export interface PracticePedalResult {
  action: PracticePedalAction;
  deltaMs?: number;
  eventId: string;
  status: PracticePedalStatus;
  targetId: string;
}

function getPedalActions(pedal: PedalMark) {
  if (pedal === 'start-release') {
    return ['down', 'up'] satisfies PracticePedalAction[];
  }

  return [pedal === 'release' ? 'up' : 'down'] satisfies PracticePedalAction[];
}

export function buildPracticePedalTargets(
  score: Score,
  {
    measureEnd,
    measureStart = 0,
    practiceStartSeconds = 0,
  }: {
    measureEnd?: number;
    measureStart?: number;
    practiceStartSeconds?: number;
  } = {},
) {
  const timelineByEventId = new Map(
    buildPlaybackTimeline(score).flatMap((event) =>
      (event.sustainedEventIds ?? [event.id]).map((eventId) => [
        eventId,
        event,
      ] as const),
    ),
  );
  const measureEndIndex = measureEnd ?? Number.POSITIVE_INFINITY;

  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) => {
        if (
          measure.index < measureStart ||
          measure.index > measureEndIndex
        ) {
          return [];
        }

        return measure.voices.flatMap((voice) =>
          voice.events.flatMap((event) => {
            if (!event.pedal) {
              return [];
            }

            const timelineEvent = timelineByEventId.get(event.id);

            if (!timelineEvent) {
              return [];
            }

            return getPedalActions(event.pedal).map((action) => ({
              action,
              eventId: event.id,
              id: `${event.id}-pedal-${action}`,
              measureIndex: measure.index,
              startSeconds:
                timelineEvent.startSeconds -
                practiceStartSeconds +
                (action === 'up' && event.pedal === 'start-release'
                  ? timelineEvent.durationSeconds
                  : 0),
            }));
          }),
        );
      }),
    ),
  );
}

export function findNearestPedalTarget(
  targets: readonly PracticePedalTarget[],
  {
    action,
    elapsedSeconds,
    resolvedTargetIds,
    searchWindowSeconds = 0.5,
  }: {
    action: PracticePedalAction;
    elapsedSeconds: number;
    resolvedTargetIds: ReadonlySet<string>;
    searchWindowSeconds?: number;
  },
): PracticePedalTarget | null {
  let nearestTarget: PracticePedalTarget | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  targets.forEach((target) => {
    const distance = Math.abs(target.startSeconds - elapsedSeconds);

    if (
      target.action === action &&
      !resolvedTargetIds.has(target.id) &&
      distance <= searchWindowSeconds &&
      distance < nearestDistance
    ) {
      nearestDistance = distance;
      nearestTarget = target;
    }
  });

  return nearestTarget;
}

export function evaluatePedalTarget(
  target: PracticePedalTarget,
  elapsedSeconds: number,
  toleranceMs = 220,
): PracticePedalResult {
  const deltaMs = Math.round((elapsedSeconds - target.startSeconds) * 1000);
  const status =
    Math.abs(deltaMs) <= toleranceMs
      ? 'correct'
      : deltaMs < 0
        ? 'early'
        : 'late';

  return {
    action: target.action,
    deltaMs,
    eventId: target.eventId,
    status,
    targetId: target.id,
  };
}

export function createMissedPedalResult(
  target: PracticePedalTarget,
): PracticePedalResult {
  return {
    action: target.action,
    eventId: target.eventId,
    status: 'missed',
    targetId: target.id,
  };
}
