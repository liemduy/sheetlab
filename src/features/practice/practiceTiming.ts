import type { PracticeTarget } from './practiceTimeline';

export type PracticeTimingLevel = 'beginner' | 'normal' | 'strict';

export const PRACTICE_TIMING_TOLERANCE_MS: Record<PracticeTimingLevel, number> = {
  beginner: 280,
  normal: 180,
  strict: 90,
};

const MIN_DYNAMIC_TOLERANCE_MS = 25;
const NEXT_GAP_TOLERANCE_RATIO = 0.45;

export function getPracticeTimingToleranceMs(
  timingLevel: PracticeTimingLevel,
  target: PracticeTarget | undefined,
  targets: readonly PracticeTarget[],
): number {
  const baseToleranceMs = PRACTICE_TIMING_TOLERANCE_MS[timingLevel];
  if (!target) {
    return baseToleranceMs;
  }

  const targetIndex = targets.findIndex((candidate) => candidate.id === target.id);
  const nextTarget = targetIndex >= 0 ? targets[targetIndex + 1] : undefined;
  if (!nextTarget) {
    return baseToleranceMs;
  }

  const nextGapMs = Math.max(0, (nextTarget.startSeconds - target.startSeconds) * 1000);
  if (nextGapMs <= 0) {
    return baseToleranceMs;
  }

  return Math.max(
    MIN_DYNAMIC_TOLERANCE_MS,
    Math.min(baseToleranceMs, Math.floor(nextGapMs * NEXT_GAP_TOLERANCE_RATIO)),
  );
}

export function findPracticeTargetInDynamicWindow(
  targets: readonly PracticeTarget[],
  elapsedSeconds: number,
  timingLevel: PracticeTimingLevel,
): PracticeTarget | undefined {
  let bestTarget: PracticeTarget | undefined;
  let bestDistanceSeconds = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const toleranceSeconds =
      getPracticeTimingToleranceMs(timingLevel, target, targets) / 1000;
    const distanceSeconds = Math.abs(target.startSeconds - elapsedSeconds);
    if (distanceSeconds <= toleranceSeconds && distanceSeconds < bestDistanceSeconds) {
      bestTarget = target;
      bestDistanceSeconds = distanceSeconds;
    }
  }

  return bestTarget;
}
