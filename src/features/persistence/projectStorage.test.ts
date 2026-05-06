import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import {
  SHEETLAB_PROJECT_KEY,
  loadProjectFromStorage,
  saveProjectToStorage,
} from './projectStorage';

describe('project storage', () => {
  it('saves and loads a serialized score', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const score = createEmptyScore('grand', {
      id: 'stored-score',
      tempo: 120,
    });

    saveProjectToStorage(score, storageLike);

    expect(storage.get(SHEETLAB_PROJECT_KEY)).toContain('stored-score');
    expect(loadProjectFromStorage(storageLike)).toEqual(score);
  });

  it('returns null when stored project JSON does not match the score schema', () => {
    const storageLike = {
      getItem: () => JSON.stringify({ id: 'broken-project' }),
      setItem: () => undefined,
    };

    expect(loadProjectFromStorage(storageLike)).toBeNull();
  });
});
