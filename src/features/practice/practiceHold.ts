import type { PracticeTarget } from './practiceTimeline';

export type PracticeHoldStatus =
  | 'held'
  | 'missing'
  | 'overheld'
  | 'released-early';

export interface PracticeNoteLifecycle {
  endSeconds?: number;
  midiNote: number;
  startSeconds: number;
  velocity?: number;
}

export interface PracticeHoldResult {
  actualReleaseSeconds?: number;
  earlyReleaseMs?: number;
  expectedReleaseSeconds: number;
  missingNotes: number[];
  overheldMs?: number;
  status: PracticeHoldStatus;
  targetId: string;
}

export interface PracticeHoldOptions {
  attackToleranceMs?: number;
  earlyReleaseToleranceMs?: number;
  evaluationEndSeconds?: number;
  minimumScoredDurationSeconds?: number;
  overholdToleranceMs?: number;
}

const DEFAULT_ATTACK_TOLERANCE_MS = 260;
const DEFAULT_EARLY_RELEASE_TOLERANCE_MS = 180;
const DEFAULT_MINIMUM_SCORED_DURATION_SECONDS = 0.18;
const DEFAULT_OVERHOLD_TOLERANCE_MS = 320;

function uniqueSorted(notes: readonly number[]) {
  return [...new Set(notes)].sort((a, b) => a - b);
}

function findLifecycleForTargetNote({
  attackToleranceSeconds,
  lifecycleByNote,
  midiNote,
  target,
}: {
  attackToleranceSeconds: number;
  lifecycleByNote: ReadonlyMap<number, readonly PracticeNoteLifecycle[]>;
  midiNote: number;
  target: PracticeTarget;
}): PracticeNoteLifecycle | null {
  const lifecycles = lifecycleByNote.get(midiNote) ?? [];
  let bestLifecycle: PracticeNoteLifecycle | null = null;
  let bestDistanceSeconds = Number.POSITIVE_INFINITY;

  lifecycles.forEach((lifecycle) => {
    const distanceSeconds = Math.abs(lifecycle.startSeconds - target.startSeconds);

    if (
      distanceSeconds <= attackToleranceSeconds &&
      distanceSeconds < bestDistanceSeconds
    ) {
      bestLifecycle = lifecycle;
      bestDistanceSeconds = distanceSeconds;
    }
  });

  return bestLifecycle;
}

function groupLifecyclesByNote(lifecycles: readonly PracticeNoteLifecycle[]) {
  const lifecycleByNote = new Map<number, PracticeNoteLifecycle[]>();

  lifecycles.forEach((lifecycle) => {
    const noteLifecycles = lifecycleByNote.get(lifecycle.midiNote) ?? [];

    noteLifecycles.push(lifecycle);
    lifecycleByNote.set(lifecycle.midiNote, noteLifecycles);
  });

  lifecycleByNote.forEach((noteLifecycles) => {
    noteLifecycles.sort((first, second) => first.startSeconds - second.startSeconds);
  });

  return lifecycleByNote;
}

export function evaluatePracticeHolds(
  targets: readonly PracticeTarget[],
  lifecycles: readonly PracticeNoteLifecycle[],
  options: PracticeHoldOptions = {},
) {
  const attackToleranceSeconds =
    (options.attackToleranceMs ?? DEFAULT_ATTACK_TOLERANCE_MS) / 1000;
  const earlyReleaseToleranceSeconds =
    (options.earlyReleaseToleranceMs ?? DEFAULT_EARLY_RELEASE_TOLERANCE_MS) /
    1000;
  const overholdToleranceSeconds =
    (options.overholdToleranceMs ?? DEFAULT_OVERHOLD_TOLERANCE_MS) / 1000;
  const minimumScoredDurationSeconds =
    options.minimumScoredDurationSeconds ??
    DEFAULT_MINIMUM_SCORED_DURATION_SECONDS;
  const evaluationEndSeconds = options.evaluationEndSeconds ?? 0;
  const lifecycleByNote = groupLifecyclesByNote(lifecycles);
  const results = new Map<string, PracticeHoldResult>();

  targets.forEach((target) => {
    const expectedNotes = uniqueSorted(target.attackMidiNotes ?? target.midiNotes);
    const expectedReleaseSeconds =
      target.expectedReleaseSeconds ??
      target.startSeconds + target.durationSeconds;

    if (
      target.isGrace ||
      expectedNotes.length === 0 ||
      target.durationSeconds < minimumScoredDurationSeconds
    ) {
      return;
    }

    const matchedLifecycles = expectedNotes.map((midiNote) =>
      findLifecycleForTargetNote({
        attackToleranceSeconds,
        lifecycleByNote,
        midiNote,
        target,
      }),
    );
    const missingNotes = expectedNotes.filter(
      (_, index) => matchedLifecycles[index] === null,
    );

    if (missingNotes.length > 0) {
      results.set(target.id, {
        expectedReleaseSeconds,
        missingNotes,
        status: 'missing',
        targetId: target.id,
      });
      return;
    }

    const releaseSeconds = matchedLifecycles.map((lifecycle) =>
      lifecycle?.endSeconds ?? evaluationEndSeconds,
    );
    const earliestReleaseSeconds = Math.min(...releaseSeconds);
    const latestReleaseSeconds = Math.max(...releaseSeconds);

    if (
      earliestReleaseSeconds <
      expectedReleaseSeconds - earlyReleaseToleranceSeconds
    ) {
      results.set(target.id, {
        actualReleaseSeconds: earliestReleaseSeconds,
        earlyReleaseMs: Math.round(
          (expectedReleaseSeconds - earliestReleaseSeconds) * 1000,
        ),
        expectedReleaseSeconds,
        missingNotes: [],
        status: 'released-early',
        targetId: target.id,
      });
      return;
    }

    if (
      latestReleaseSeconds >
      expectedReleaseSeconds + overholdToleranceSeconds
    ) {
      results.set(target.id, {
        actualReleaseSeconds: latestReleaseSeconds,
        expectedReleaseSeconds,
        missingNotes: [],
        overheldMs: Math.round(
          (latestReleaseSeconds - expectedReleaseSeconds) * 1000,
        ),
        status: 'overheld',
        targetId: target.id,
      });
      return;
    }

    results.set(target.id, {
      actualReleaseSeconds: latestReleaseSeconds,
      expectedReleaseSeconds,
      missingNotes: [],
      status: 'held',
      targetId: target.id,
    });
  });

  return results;
}

export function getPracticeHoldScorePercent(
  holdResults: ReadonlyMap<string, PracticeHoldResult>,
) {
  if (holdResults.size === 0) {
    return null;
  }

  const weightedScore = [...holdResults.values()].reduce((score, result) => {
    if (result.status === 'held') {
      return score + 1;
    }

    if (result.status === 'overheld') {
      return score + 0.65;
    }

    if (result.status === 'released-early') {
      return score + 0.35;
    }

    return score;
  }, 0);

  return Math.round((weightedScore / holdResults.size) * 100);
}
