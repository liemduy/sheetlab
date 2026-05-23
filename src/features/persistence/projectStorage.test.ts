import { describe, expect, it } from 'vitest';
import {
  placeScoreEvent,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import {
  SHEETLAB_AUTOSAVE_PROJECT_KEY,
  SHEETLAB_PROJECT_LIBRARY_KEY,
  SHEETLAB_PROJECT_KEY,
  loadAutosaveFromStorage,
  loadProjectFromLibrary,
  loadProjectLibrary,
  loadProjectFromStorage,
  saveAutosaveToStorage,
  saveProjectToLibrary,
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

  it('preserves note articulations through project JSON', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const scoreWithNote = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'stored-articulation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = tryUpdateScoreEvent(scoreWithNote, 'stored-articulation-note', {
      articulations: ['marcato', 'tenuto'],
    }).score;

    saveProjectToStorage(score, storageLike);

    expect(loadProjectFromStorage(storageLike)).toEqual(score);
  });

  it('maintains a local project library with metadata', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const firstScore = createEmptyScore('grand', {
      id: 'library-first',
      tempo: 84,
      title: 'First Library Score',
    });
    const secondScore = createEmptyScore('treble', {
      id: 'library-second',
      tempo: 112,
      title: 'Second Library Score',
    });

    saveProjectToLibrary(
      firstScore,
      storageLike,
      new Date('2026-05-20T10:00:00.000Z'),
    );
    saveProjectToLibrary(
      secondScore,
      storageLike,
      new Date('2026-05-21T10:00:00.000Z'),
    );

    expect(storage.get(SHEETLAB_PROJECT_LIBRARY_KEY)).toContain('library-first');
    expect(loadProjectLibrary(storageLike).map((project) => project.id)).toEqual([
      'library-second',
      'library-first',
    ]);
    expect(loadProjectFromLibrary('library-first', storageLike)).toEqual(firstScore);
  });

  it('stores autosave separately from the manual saved project', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const manualScore = createEmptyScore('treble', { id: 'manual-score' });
    const autosaveScore = createEmptyScore('grand', { id: 'autosave-score' });

    saveProjectToStorage(manualScore, storageLike);
    saveAutosaveToStorage(autosaveScore, storageLike);

    expect(storage.get(SHEETLAB_PROJECT_KEY)).toContain('manual-score');
    expect(storage.get(SHEETLAB_AUTOSAVE_PROJECT_KEY)).toContain('autosave-score');
    expect(loadProjectFromStorage(storageLike)).toEqual(manualScore);
    expect(loadAutosaveFromStorage(storageLike)).toEqual(autosaveScore);
  });

  it('preserves manual annotation offsets through project JSON', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const scoreWithNote = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'stored-annotation-offset-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = tryUpdateScoreEvent(
      scoreWithNote,
      'stored-annotation-offset-note',
      {
        lyric: 'la',
        annotationOffset: {
          kind: 'lyric',
          offset: { x: 18, y: -10 },
        },
      },
    ).score;

    saveProjectToStorage(score, storageLike);

    expect(loadProjectFromStorage(storageLike)).toEqual(score);
  });

  it('rejects stored rests with articulations', () => {
    const score = createEmptyScore('treble');
    const brokenScore = {
      ...score,
      parts: score.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) => ({
          ...staff,
          measures: staff.measures.map((measure, measureIndex) =>
            measureIndex === 0
              ? {
                  ...measure,
                  voices: measure.voices.map((voice, voiceIndex) =>
                    voiceIndex === 0
                      ? {
                          ...voice,
                          events: [
                            {
                              articulations: ['accent'],
                              beat: 0,
                              duration: 'quarter',
                              id: 'invalid-rest-articulation',
                              kind: 'rest',
                            },
                          ],
                        }
                      : voice,
                  ),
                }
              : measure,
          ),
        })),
      })),
    };
    const storageLike = {
      getItem: () => JSON.stringify(brokenScore),
      setItem: () => undefined,
    };

    expect(loadProjectFromStorage(storageLike)).toBeNull();
  });
});
