import { serializeScore } from '../../domain/score/factories';
import type { Score } from '../../domain/score/types';

export type CloudSyncProvider = 'disabled' | 'supabase' | 'custom';

export interface CloudSyncConfig {
  endpointUrl?: string;
  provider: CloudSyncProvider;
}

export interface CloudScorePayload {
  schemaVersion: 'sheetlab-cloud-v1';
  scoreId: string;
  serializedScore: string;
  title: string;
  updatedAt: string;
}

export const DISABLED_CLOUD_SYNC_CONFIG: CloudSyncConfig = {
  provider: 'disabled',
};

export function isCloudSyncConfigured(config: CloudSyncConfig) {
  if (config.provider === 'disabled') {
    return false;
  }

  return Boolean(config.endpointUrl?.trim());
}

export function createCloudScorePayload(
  score: Score,
  now = new Date(),
): CloudScorePayload {
  return {
    schemaVersion: 'sheetlab-cloud-v1',
    scoreId: score.id,
    serializedScore: serializeScore(score),
    title: score.title.trim() || 'Untitled score',
    updatedAt: now.toISOString(),
  };
}

export function getCloudSyncStatusLabel(config: CloudSyncConfig) {
  if (!isCloudSyncConfigured(config)) {
    return 'Local only';
  }

  return config.provider === 'supabase' ? 'Supabase ready' : 'Cloud ready';
}
