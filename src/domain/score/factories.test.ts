import { describe, expect, it } from 'vitest';
import {
  createEmptyScore,
  deserializeScore,
  serializeScore,
} from './factories';

describe('score factories', () => {
  it('creates an empty treble score with one treble staff', () => {
    const score = createEmptyScore('treble', {
      id: 'score-test-treble',
      measureCount: 4,
      title: 'Treble Test',
    });

    expect(score).toMatchObject({
      id: 'score-test-treble',
      title: 'Treble Test',
      type: 'treble',
      pageSize: 'a4',
      tempo: 96,
      timeSignature: {
        beats: 4,
        beatUnit: 4,
      },
    });
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0]?.staves).toHaveLength(1);
    expect(score.parts[0]?.staves[0]).toMatchObject({
      id: 'treble',
      clef: 'treble',
    });
    expect(score.parts[0]?.staves[0]?.measures).toHaveLength(4);
    expect(score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events).toEqual(
      [],
    );
  });

  it('creates an empty grand staff score with treble and bass staves', () => {
    const score = createEmptyScore('grand', {
      id: 'score-test-grand',
      measureCount: 2,
    });

    expect(score.type).toBe('grand');
    expect(score.parts[0]?.name).toBe('Piano');
    expect(score.parts[0]?.staves.map((staff) => staff.id)).toEqual([
      'treble',
      'bass',
    ]);
    expect(score.parts[0]?.staves[0]?.measures).toHaveLength(2);
    expect(score.parts[0]?.staves[1]?.measures).toHaveLength(2);
  });

  it('can create a score with letter page size', () => {
    const score = createEmptyScore('treble', {
      pageSize: 'letter',
    });

    expect(score.pageSize).toBe('letter');
  });

  it('serializes and deserializes without losing score data', () => {
    const original = createEmptyScore('grand', {
      id: 'score-roundtrip',
      title: 'Roundtrip',
      composer: 'SheetLab',
      tempo: 112,
      measureCount: 1,
    });

    const restored = deserializeScore(serializeScore(original));

    expect(restored).toEqual(original);
  });

  it('adds the default A4 page size when loading an older project', () => {
    const legacyScore = createEmptyScore('treble') as unknown as Record<
      string,
      unknown
    >;

    delete legacyScore.pageSize;

    expect(deserializeScore(JSON.stringify(legacyScore))).toMatchObject({
      pageSize: 'a4',
    });
  });

  it('rejects JSON that is not a valid score project', () => {
    expect(() => deserializeScore(JSON.stringify({ id: 'not-enough' }))).toThrow(
      'Invalid SheetLab score project',
    );
  });
});
