import { describe, expect, it } from 'vitest';

import { createEmptyScore } from '../../domain/score/factories';
import {
  createCloudScorePayload,
  getCloudSyncStatusLabel,
  isCloudSyncConfigured,
} from './cloudSync';

describe('cloudSync', () => {
  it('keeps cloud sync disabled until a provider endpoint exists', () => {
    expect(isCloudSyncConfigured({ provider: 'disabled' })).toBe(false);
    expect(isCloudSyncConfigured({ provider: 'supabase' })).toBe(false);
    expect(
      isCloudSyncConfigured({
        endpointUrl: 'https://example.supabase.co',
        provider: 'supabase',
      }),
    ).toBe(true);
  });

  it('creates a versioned score payload for future auth/database work', () => {
    const score = {
      ...createEmptyScore('treble'),
      id: 'cloud-score',
      title: 'Cloud Tune',
    };
    const payload = createCloudScorePayload(
      score,
      new Date('2026-05-26T00:00:00.000Z'),
    );

    expect(payload.schemaVersion).toBe('sheetlab-cloud-v1');
    expect(payload.scoreId).toBe('cloud-score');
    expect(payload.title).toBe('Cloud Tune');
    expect(payload.updatedAt).toBe('2026-05-26T00:00:00.000Z');
    expect(payload.serializedScore).toContain('Cloud Tune');
  });

  it('returns compact UI labels for cloud status', () => {
    expect(getCloudSyncStatusLabel({ provider: 'disabled' })).toBe('Local only');
    expect(
      getCloudSyncStatusLabel({
        endpointUrl: 'https://example.supabase.co',
        provider: 'supabase',
      }),
    ).toBe('Supabase ready');
  });
});
