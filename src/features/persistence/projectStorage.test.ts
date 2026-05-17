import { describe, expect, it } from 'vitest';
import {
  placeScoreEvent,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
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
