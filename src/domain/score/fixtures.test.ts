import { describe, expect, it } from 'vitest';
import { deserializeScore, serializeScore } from './factories';
import {
  duChoTanTheExcerptFixture,
  grandStaffStudyFixture,
  trebleStudyFixture,
} from './fixtures';

describe('score fixtures', () => {
  it('provides a treble melody fixture with quarter notes', () => {
    const trebleStaff = trebleStudyFixture.parts[0]?.staves[0];
    const firstMeasureEvents = trebleStaff?.measures[0]?.voices[0]?.events;

    expect(trebleStudyFixture.type).toBe('treble');
    expect(trebleStudyFixture.title).toBe('First Treble Study');
    expect(trebleStaff?.id).toBe('treble');
    expect(trebleStaff?.measures).toHaveLength(4);
    expect(firstMeasureEvents).toHaveLength(4);
    expect(firstMeasureEvents?.map((event) => event.beat)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(firstMeasureEvents?.map((event) => event.duration)).toEqual([
      'quarter',
      'quarter',
      'quarter',
      'quarter',
    ]);
  });

  it('provides a grand staff fixture with treble and bass material', () => {
    const staves = grandStaffStudyFixture.parts[0]?.staves;
    const trebleEvents = staves?.[0]?.measures[0]?.voices[0]?.events;
    const bassEvents = staves?.[1]?.measures[0]?.voices[0]?.events;

    expect(grandStaffStudyFixture.type).toBe('grand');
    expect(staves?.map((staff) => staff.id)).toEqual(['treble', 'bass']);
    expect(trebleEvents).toHaveLength(2);
    expect(bassEvents).toHaveLength(2);
    expect(bassEvents?.[1]).toMatchObject({
      kind: 'rest',
      beat: 2,
      duration: 'half',
    });
  });

  it('keeps fixtures stable through JSON serialization', () => {
    expect(deserializeScore(serializeScore(trebleStudyFixture))).toEqual(
      trebleStudyFixture,
    );
    expect(deserializeScore(serializeScore(grandStaffStudyFixture))).toEqual(
      grandStaffStudyFixture,
    );
    expect(deserializeScore(serializeScore(duChoTanTheExcerptFixture))).toEqual(
      duChoTanTheExcerptFixture,
    );
  });

  it('provides a PDF-like piano excerpt fixture with annotations', () => {
    const staves = duChoTanTheExcerptFixture.parts[0]?.staves;
    const trebleEvents = staves?.[0]?.measures[0]?.voices[0]?.events;
    const bassEvents = staves?.[1]?.measures[0]?.voices[0]?.events;

    expect(duChoTanTheExcerptFixture.type).toBe('grand');
    expect(duChoTanTheExcerptFixture.timeSignature).toEqual({
      beats: 2,
      beatUnit: 4,
    });
    expect(staves?.[0]?.measures[0]).toMatchObject({
      keySignature: 'D',
      sectionMarker: 'Intro',
    });
    expect(trebleEvents?.[0]).toMatchObject({
      chordSymbol: 'D',
      dynamic: 'mf',
      glissando: true,
      lyric: 'du',
      pedal: 'start',
    });
    expect(trebleEvents?.[1]).toMatchObject({
      chordSymbol: 'E7/D',
      fermata: true,
      lyric: 'cho',
    });
    expect(bassEvents?.[0]).toMatchObject({
      pedal: 'release',
    });
  });
});
