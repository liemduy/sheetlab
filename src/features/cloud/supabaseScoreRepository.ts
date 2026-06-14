import { deserializeScore, serializeScore } from '../../domain/score/factories';
import type { Score } from '../../domain/score/types';
import { supabase } from '../auth/supabaseClient';

export interface CloudScoreSummary {
  appScoreId: string;
  id: string;
  measureCount: number;
  tempo: number;
  title: string;
  type: Score['type'];
  updatedAt: string;
}

export interface CloudScoreRecord extends CloudScoreSummary {
  score: Score;
}

interface ScoreRow {
  app_score_id: string;
  id: string;
  measure_count: number;
  score_json: unknown;
  score_type: Score['type'];
  tempo: number;
  title: string;
  updated_at: string;
}

function getScoreMeasureCount(score: Score) {
  return Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function getScoreTitle(score: Score) {
  return score.title.trim() || 'Untitled score';
}

function toCloudScoreSummary(row: ScoreRow): CloudScoreSummary {
  return {
    appScoreId: row.app_score_id,
    id: row.id,
    measureCount: row.measure_count,
    tempo: row.tempo,
    title: row.title,
    type: row.score_type,
    updatedAt: row.updated_at,
  };
}

function deserializeCloudScore(row: ScoreRow): CloudScoreRecord {
  return {
    ...toCloudScoreSummary(row),
    score: deserializeScore(JSON.stringify(row.score_json)),
  };
}

function getSupabaseOrThrow() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  return supabase;
}

export async function upsertCloudScore(score: Score, ownerId: string) {
  const client = getSupabaseOrThrow();
  const nowIso = new Date().toISOString();
  const payload = {
    app_score_id: score.id,
    deleted_at: null,
    measure_count: getScoreMeasureCount(score),
    owner_id: ownerId,
    score_json: JSON.parse(serializeScore(score)) as unknown,
    score_type: score.type,
    tempo: score.tempo,
    title: getScoreTitle(score),
    updated_at: nowIso,
  };
  const { data, error } = await client
    .from('scores')
    .upsert(payload, {
      onConflict: 'owner_id,app_score_id',
    })
    .select(
      'id, app_score_id, title, score_type, tempo, measure_count, score_json, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return deserializeCloudScore(data as ScoreRow);
}

export async function listCloudScores() {
  const client = getSupabaseOrThrow();
  const { data, error } = await client
    .from('scores')
    .select('id, app_score_id, title, score_type, tempo, measure_count, score_json, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ScoreRow[]).map(toCloudScoreSummary);
}

export async function loadCloudScore(cloudScoreId: string) {
  const client = getSupabaseOrThrow();
  const { data, error } = await client
    .from('scores')
    .select('id, app_score_id, title, score_type, tempo, measure_count, score_json, updated_at')
    .eq('id', cloudScoreId)
    .single();

  if (error) {
    throw error;
  }

  return deserializeCloudScore(data as ScoreRow);
}

export async function findCloudScoreByAppScoreId(appScoreId: string) {
  const client = getSupabaseOrThrow();
  const { data, error } = await client
    .from('scores')
    .select('id, app_score_id, title, score_type, tempo, measure_count, score_json, updated_at')
    .eq('app_score_id', appScoreId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? deserializeCloudScore(data as ScoreRow) : null;
}
