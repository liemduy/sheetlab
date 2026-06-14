import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Score } from '../../domain/score/types';
import {
  listCloudScores,
  loadCloudScore,
  upsertCloudScore,
  type CloudScoreSummary,
} from './supabaseScoreRepository';

interface UseCloudScoresOptions {
  onScoreLoaded: (score: Score, message: string) => void;
  setEditorMessage: (message: string) => void;
  user: User | null;
}

export function useCloudScores({
  onScoreLoaded,
  setEditorMessage,
  user,
}: UseCloudScoresOptions) {
  const [cloudScores, setCloudScores] = useState<CloudScoreSummary[]>([]);
  const [cloudStatusLabel, setCloudStatusLabel] = useState('Signed out');
  const [isLoadingCloudScores, setIsLoadingCloudScores] = useState(false);

  const refreshCloudScores = useCallback(async () => {
    if (!user) {
      setCloudScores([]);
      setCloudStatusLabel('Signed out');
      return;
    }

    setIsLoadingCloudScores(true);
    setCloudStatusLabel('Syncing...');

    try {
      const nextCloudScores = await listCloudScores();

      setCloudScores(nextCloudScores);
      setCloudStatusLabel(
        nextCloudScores.length > 0
          ? `${nextCloudScores.length} cloud score${
              nextCloudScores.length === 1 ? '' : 's'
            }`
          : 'Cloud ready',
      );
    } catch {
      setCloudStatusLabel('Cloud unavailable');
    } finally {
      setIsLoadingCloudScores(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshCloudScores();
  }, [refreshCloudScores]);

  async function saveScoreToCloud(score: Score) {
    if (!user) {
      setEditorMessage('Project saved locally; sign in for cloud sync');
      return false;
    }

    setCloudStatusLabel('Saving...');

    try {
      await upsertCloudScore(score, user.id);
      setEditorMessage('Project saved locally and to cloud');
      await refreshCloudScores();
      return true;
    } catch {
      setCloudStatusLabel('Cloud save failed');
      setEditorMessage('Project saved locally; cloud sync failed');
      return false;
    }
  }

  async function loadScoreFromCloud(cloudScoreId: string) {
    if (!user) {
      setEditorMessage('Sign in to load cloud scores');
      return;
    }

    setCloudStatusLabel('Loading...');

    try {
      const cloudScore = await loadCloudScore(cloudScoreId);

      onScoreLoaded(cloudScore.score, `Cloud score loaded: ${cloudScore.title}`);
      setCloudStatusLabel('Cloud loaded');
      await refreshCloudScores();
    } catch {
      setCloudStatusLabel('Cloud load failed');
      setEditorMessage('Cloud score could not be loaded');
    }
  }

  return {
    cloudScores,
    cloudStatusLabel,
    isLoadingCloudScores,
    loadScoreFromCloud,
    refreshCloudScores,
    saveScoreToCloud,
  };
}
