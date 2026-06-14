import type { Score } from '../../domain/score/types';
import type { PracticeReviewSummary } from '../practice/practiceReview';
import { supabase } from '../auth/supabaseClient';
import { findCloudScoreByAppScoreId, upsertCloudScore } from './supabaseScoreRepository';

export interface PracticeAttemptInput {
  durationSeconds: number;
  handMode: 'both' | 'left' | 'right';
  measureEnd: number;
  measureStart: number;
  mode: 'listen' | 'rhythm' | 'wait';
  score: Score;
  summary: PracticeReviewSummary;
  userId: string;
}

export interface PracticeTopScore {
  accuracyPercent: number;
  finishedAt: string;
  handMode: string;
  id: string;
  mode: string;
  rangeEndMeasure: number;
  rangeStartMeasure: number;
  scorePercent: number;
  timingScorePercent: number | null;
}

interface PracticeAttemptRow {
  accuracy_percent: number;
  finished_at: string;
  hand_mode: string;
  id: string;
  mode: string;
  range_end_measure: number;
  range_start_measure: number;
  score_percent: number;
  timing_score_percent: number | null;
}

function getSupabaseOrThrow() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  return supabase;
}

export function getPracticeScorePercent(summary: PracticeReviewSummary) {
  const weightedScoreParts = [
    { score: summary.noteAccuracyPercent, weight: 50 },
    summary.timingScorePercent === null
      ? null
      : { score: summary.timingScorePercent, weight: 30 },
    summary.holdScorePercent === null
      ? null
      : { score: summary.holdScorePercent, weight: 20 },
    summary.pedalScorePercent === null
      ? null
      : { score: summary.pedalScorePercent, weight: 15 },
  ].filter(
    (
      scorePart,
    ): scorePart is {
      score: number;
      weight: number;
    } => scorePart !== null,
  );

  if (weightedScoreParts.length === 0) {
    return 0;
  }

  const totalWeight = weightedScoreParts.reduce(
    (weight, scorePart) => weight + scorePart.weight,
    0,
  );

  return Math.round(
    weightedScoreParts.reduce(
      (total, scorePart) => total + scorePart.score * scorePart.weight,
      0,
    ) / totalWeight,
  );
}

function toPracticeTopScore(row: PracticeAttemptRow): PracticeTopScore {
  return {
    accuracyPercent: row.accuracy_percent,
    finishedAt: row.finished_at,
    handMode: row.hand_mode,
    id: row.id,
    mode: row.mode,
    rangeEndMeasure: row.range_end_measure,
    rangeStartMeasure: row.range_start_measure,
    scorePercent: row.score_percent,
    timingScorePercent: row.timing_score_percent,
  };
}

export async function savePracticeAttempt(input: PracticeAttemptInput) {
  const client = getSupabaseOrThrow();
  const cloudScore =
    (await findCloudScoreByAppScoreId(input.score.id)) ??
    (await upsertCloudScore(input.score, input.userId));
  const payload = {
    accuracy_percent: input.summary.noteAccuracyPercent,
    correct_count: input.summary.resolvedTargets,
    duration_seconds: Number(input.durationSeconds.toFixed(2)),
    hand_mode: input.handMode,
    mode: input.mode,
    owner_id: input.userId,
    pedal_score_percent: input.summary.pedalScorePercent,
    range_end_measure: input.measureEnd,
    range_start_measure: input.measureStart,
    score_id: cloudScore.id,
    score_percent: getPracticeScorePercent(input.summary),
    target_count: input.summary.totalTargets,
    timing_score_percent: input.summary.timingScorePercent,
  };
  const { error } = await client.from('practice_attempts').insert(payload);

  if (error) {
    throw error;
  }

  return listTopPracticeScores(input.score.id, input.userId);
}

export async function listTopPracticeScores(appScoreId: string, userId: string) {
  const client = getSupabaseOrThrow();
  const cloudScore = await findCloudScoreByAppScoreId(appScoreId);

  if (!cloudScore) {
    return [];
  }

  const { data, error } = await client
    .from('practice_attempts')
    .select(
      'id, mode, hand_mode, range_start_measure, range_end_measure, score_percent, accuracy_percent, timing_score_percent, finished_at',
    )
    .eq('owner_id', userId)
    .eq('score_id', cloudScore.id)
    .order('score_percent', { ascending: false })
    .order('accuracy_percent', { ascending: false })
    .order('finished_at', { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  return ((data ?? []) as PracticeAttemptRow[]).map(toPracticeTopScore);
}
