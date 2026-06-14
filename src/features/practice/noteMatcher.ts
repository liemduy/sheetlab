import { formatMidiNote } from './midiAccess';
import type { PracticeTarget } from './practiceTimeline';

export type PracticeResultStatus = 'correct' | 'missed' | 'partial' | 'wrong';

export interface PracticeResult {
  earlyMs?: number;
  expectedNotes: number[];
  extraNotes: number[];
  lateMs?: number;
  missingNotes: number[];
  playedNotes: number[];
  status: PracticeResultStatus;
  targetId: string;
  timingDeltaMs?: number;
}

export interface PracticeMatchOptions {
  elapsedSeconds?: number;
  timingToleranceMs?: number;
}

function uniqueSorted(notes: readonly number[]) {
  return [...new Set(notes)].sort((a, b) => a - b);
}

export function formatMidiNoteList(notes: readonly number[]) {
  return uniqueSorted(notes).map(formatMidiNote).join(' ');
}

export function evaluatePracticeTarget(
  target: PracticeTarget,
  playedMidiNotes: readonly number[],
  options: PracticeMatchOptions = {},
): PracticeResult {
  const expectedNotes = uniqueSorted(target.attackMidiNotes ?? target.midiNotes);
  const playedNotes = uniqueSorted(playedMidiNotes);
  const missingNotes = expectedNotes.filter((note) => !playedNotes.includes(note));
  const extraNotes = playedNotes.filter((note) => !expectedNotes.includes(note));
  const timingDeltaMs =
    options.elapsedSeconds === undefined
      ? null
      : Math.round((options.elapsedSeconds - target.startSeconds) * 1000);
  const timingToleranceMs = options.timingToleranceMs ?? 180;
  const isTimingOk =
    timingDeltaMs === null || Math.abs(timingDeltaMs) <= timingToleranceMs;
  const status: PracticeResultStatus =
    !isTimingOk
      ? 'wrong'
      : missingNotes.length === 0 && extraNotes.length === 0
      ? 'correct'
      : missingNotes.length > 0 &&
          missingNotes.length < expectedNotes.length &&
          extraNotes.length === 0
        ? 'partial'
        : 'wrong';

  return {
    earlyMs: timingDeltaMs !== null && timingDeltaMs < -timingToleranceMs
      ? Math.abs(timingDeltaMs)
      : undefined,
    expectedNotes,
    extraNotes,
    lateMs: timingDeltaMs !== null && timingDeltaMs > timingToleranceMs
      ? timingDeltaMs
      : undefined,
    missingNotes,
    playedNotes,
    status,
    targetId: target.id,
    timingDeltaMs: timingDeltaMs ?? undefined,
  };
}

export function createMissedPracticeResult(target: PracticeTarget): PracticeResult {
  const expectedNotes = uniqueSorted(target.attackMidiNotes ?? target.midiNotes);

  return {
    expectedNotes,
    extraNotes: [],
    missingNotes: expectedNotes,
    playedNotes: [],
    status: 'missed',
    targetId: target.id,
  };
}

export function getPracticeResultSummary(
  results: ReadonlyMap<string, PracticeResult>,
) {
  const summary = {
    correct: 0,
    missed: 0,
    partial: 0,
    total: results.size,
    wrong: 0,
  };

  results.forEach((result) => {
    summary[result.status] += 1;
  });

  return summary;
}

export function getPracticeAccuracyPercent(
  results: ReadonlyMap<string, PracticeResult>,
  targetCount: number,
) {
  if (targetCount <= 0) {
    return 0;
  }

  const summary = getPracticeResultSummary(results);
  const weightedScore =
    summary.correct + summary.partial * 0.5;

  return Math.round((weightedScore / targetCount) * 100);
}

export function getPracticeResultMessage(result: PracticeResult) {
  if (result.status === 'correct') {
    if (result.lateMs !== undefined) {
      return `Correct notes, ${result.lateMs}ms late`;
    }

    if (result.earlyMs !== undefined) {
      return `Correct notes, ${result.earlyMs}ms early`;
    }

    return 'Correct';
  }

  const details = [
    result.missingNotes.length > 0
      ? `missing ${formatMidiNoteList(result.missingNotes)}`
      : null,
    result.extraNotes.length > 0
      ? `extra ${formatMidiNoteList(result.extraNotes)}`
      : null,
    result.lateMs !== undefined ? `${result.lateMs}ms late` : null,
    result.earlyMs !== undefined ? `${result.earlyMs}ms early` : null,
  ].filter(Boolean);

  if (result.status === 'missed') {
    return `Missed ${formatMidiNoteList(result.expectedNotes)}`;
  }

  return `${result.status}: ${details.join(', ') || 'try again'}`;
}
