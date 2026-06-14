import type { PracticeTarget } from './practiceTimeline';
import {
  getPracticeTimingToleranceMs,
  type PracticeTimingLevel,
} from './practiceTiming';

export type PracticeTargetMatchReason =
  | 'current'
  | 'late-current'
  | 'nearby'
  | 'off-target';

export interface PracticeTargetMatch {
  reason: PracticeTargetMatchReason;
  target: PracticeTarget | null;
}

const LOOKAHEAD_TARGET_COUNT = 3;
const CURRENT_TARGET_LATE_GRACE_SECONDS = 0.04;

function getTargetToleranceSeconds(
  timingLevel: PracticeTimingLevel,
  target: PracticeTarget,
  targets: readonly PracticeTarget[],
) {
  return getPracticeTimingToleranceMs(timingLevel, target, targets) / 1000;
}

function isResolvedTarget(
  target: PracticeTarget,
  resolvedTargetIds: ReadonlySet<string>,
) {
  return resolvedTargetIds.has(target.id);
}

export function findSequentialPracticeTarget({
  currentTargetIndex,
  elapsedSeconds,
  resolvedTargetIds,
  targets,
  timingLevel,
}: {
  currentTargetIndex: number;
  elapsedSeconds: number;
  resolvedTargetIds: ReadonlySet<string>;
  targets: readonly PracticeTarget[];
  timingLevel: PracticeTimingLevel;
}): PracticeTargetMatch {
  if (targets.length === 0) {
    return { reason: 'off-target', target: null };
  }

  const safeCurrentIndex = Math.min(
    Math.max(0, currentTargetIndex),
    targets.length - 1,
  );
  const currentTarget = targets[safeCurrentIndex];

  if (currentTarget && !isResolvedTarget(currentTarget, resolvedTargetIds)) {
    const currentToleranceSeconds = getTargetToleranceSeconds(
      timingLevel,
      currentTarget,
      targets,
    );
    const nextTarget = targets[safeCurrentIndex + 1];
    const currentLateDeadlineSeconds = Math.min(
      currentTarget.startSeconds +
        currentTarget.durationSeconds +
        CURRENT_TARGET_LATE_GRACE_SECONDS,
      nextTarget?.startSeconds ?? Number.POSITIVE_INFINITY,
    );

    if (
      elapsedSeconds >= currentTarget.startSeconds - currentToleranceSeconds &&
      elapsedSeconds < currentLateDeadlineSeconds
    ) {
      return {
        reason:
          Math.abs(elapsedSeconds - currentTarget.startSeconds) <=
          currentToleranceSeconds
            ? 'current'
            : 'late-current',
        target: currentTarget,
      };
    }
  }

  const minIndex = Math.max(0, safeCurrentIndex - 1);
  const maxIndex = Math.min(
    targets.length - 1,
    safeCurrentIndex + LOOKAHEAD_TARGET_COUNT,
  );
  let bestCandidate:
    | {
        distanceSeconds: number;
        index: number;
        target: PracticeTarget;
      }
    | null = null;

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const target = targets[index];

    if (!target || isResolvedTarget(target, resolvedTargetIds)) {
      continue;
    }

    const toleranceSeconds = getTargetToleranceSeconds(
      timingLevel,
      target,
      targets,
    );
    const distanceSeconds = Math.abs(target.startSeconds - elapsedSeconds);

    if (distanceSeconds > toleranceSeconds) {
      continue;
    }

    const candidate = {
      distanceSeconds,
      index,
      target,
    };

    if (
      !bestCandidate ||
      candidate.distanceSeconds + Math.max(0, index - safeCurrentIndex) * 0.045 <
        bestCandidate.distanceSeconds +
          Math.max(0, bestCandidate.index - safeCurrentIndex) * 0.045
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate
    ? { reason: 'nearby', target: bestCandidate.target }
    : { reason: 'off-target', target: null };
}
