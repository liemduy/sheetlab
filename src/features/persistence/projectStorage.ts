import type { Score } from '../../domain/score/types';
import { deserializeScore, serializeScore } from '../../domain/score/factories';

export const SHEETLAB_PROJECT_KEY = 'sheetlab:v0.1:project';
export const SHEETLAB_AUTOSAVE_PROJECT_KEY = 'sheetlab:v0.1:autosave-project';
export const SHEETLAB_PROJECT_LIBRARY_KEY = 'sheetlab:v0.1:project-library';
export const SHEETLAB_PDF_EXPORT_SCORE_KEY = 'sheetlab:v0.1:pdf-export-score';

export interface ProjectStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface SavedProjectRecord {
  createdAt: string;
  id: string;
  measureCount: number;
  score: string;
  tempo: number;
  title: string;
  type: Score['type'];
  updatedAt: string;
}

function getScoreMeasureCount(score: Score) {
  return Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function getProjectTitle(score: Score) {
  return score.title.trim() || 'Untitled score';
}

function createSavedProjectRecord(
  score: Score,
  existingRecord: SavedProjectRecord | undefined,
  now = new Date(),
): SavedProjectRecord {
  const nowIso = now.toISOString();

  return {
    createdAt: existingRecord?.createdAt ?? nowIso,
    id: score.id,
    measureCount: getScoreMeasureCount(score),
    score: serializeScore(score),
    tempo: score.tempo,
    title: getProjectTitle(score),
    type: score.type,
    updatedAt: nowIso,
  };
}

function parseProjectLibrary(serializedLibrary: string | null) {
  if (!serializedLibrary) {
    return [];
  }

  try {
    const records = JSON.parse(serializedLibrary);

    if (!Array.isArray(records)) {
      return [];
    }

    return records.filter(
      (record): record is SavedProjectRecord =>
        record &&
        typeof record === 'object' &&
        typeof record.id === 'string' &&
        typeof record.score === 'string' &&
        typeof record.title === 'string',
    );
  } catch {
    return [];
  }
}

export function loadProjectLibrary(
  storage: ProjectStorage = globalThis.localStorage,
) {
  return parseProjectLibrary(storage.getItem(SHEETLAB_PROJECT_LIBRARY_KEY));
}

export function saveProjectToLibrary(
  score: Score,
  storage: ProjectStorage = globalThis.localStorage,
  now = new Date(),
) {
  const records = loadProjectLibrary(storage);
  const existingRecord = records.find((record) => record.id === score.id);
  const nextRecord = createSavedProjectRecord(score, existingRecord, now);
  const nextRecords = [
    nextRecord,
    ...records.filter((record) => record.id !== score.id),
  ].sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  );

  storage.setItem(SHEETLAB_PROJECT_LIBRARY_KEY, JSON.stringify(nextRecords));
  return nextRecord;
}

export function loadProjectFromLibrary(
  projectId: string,
  storage: ProjectStorage = globalThis.localStorage,
) {
  const record = loadProjectLibrary(storage).find(
    (candidate) => candidate.id === projectId,
  );

  if (!record) {
    return null;
  }

  try {
    return deserializeScore(record.score);
  } catch {
    return null;
  }
}

export function saveProjectToStorage(
  score: Score,
  storage: ProjectStorage = globalThis.localStorage,
) {
  storage.setItem(SHEETLAB_PROJECT_KEY, serializeScore(score));
  saveProjectToLibrary(score, storage);
}

export function saveAutosaveToStorage(
  score: Score,
  storage: ProjectStorage = globalThis.localStorage,
) {
  storage.setItem(SHEETLAB_AUTOSAVE_PROJECT_KEY, serializeScore(score));
}

export function loadAutosaveFromStorage(
  storage: ProjectStorage = globalThis.localStorage,
) {
  const serializedScore = storage.getItem(SHEETLAB_AUTOSAVE_PROJECT_KEY);

  if (!serializedScore) {
    return null;
  }

  try {
    return deserializeScore(serializedScore);
  } catch {
    return null;
  }
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
