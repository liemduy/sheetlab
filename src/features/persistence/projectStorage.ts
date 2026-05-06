import type { Score } from '../../domain/score/types';
import { deserializeScore, serializeScore } from '../../domain/score/factories';

export const SHEETLAB_PROJECT_KEY = 'sheetlab:v0.1:project';

export interface ProjectStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function saveProjectToStorage(
  score: Score,
  storage: ProjectStorage = globalThis.localStorage,
) {
  storage.setItem(SHEETLAB_PROJECT_KEY, serializeScore(score));
}

export function loadProjectFromStorage(
  storage: ProjectStorage = globalThis.localStorage,
) {
  const serializedScore = storage.getItem(SHEETLAB_PROJECT_KEY);

  if (!serializedScore) {
    return null;
  }

  try {
    return deserializeScore(serializedScore);
  } catch {
    return null;
  }
}

export function createProjectJsonBlob(score: Score) {
  return new Blob([serializeScore(score)], {
    type: 'application/json',
  });
}
