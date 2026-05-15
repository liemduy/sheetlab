import { describe, expect, it } from 'vitest';
import { deserializeScore, serializeScore } from './factories';
import {
  duChoTanTheExcerptFixture,
  extremeClefOttavaChromaticFixture,
  extremeScoreFixtures,
  extremeTupletRepeatEtudeFixture,
  extremeVocalPianoFixture,
  grandStaffStudyFixture,
  readableSpacingStressFixture,
  stressPianoHardeningFixture,
  trebleStudyFixture,
} from './fixtures';
import {
  extremeScoreFixtureCatalog,
  scoreFixtureCatalog,
} from './fixtureCatalog';
import { getRepeatPlaybackIssues } from './repeatJumps';
import { getScoreRhythmIssues } from './rhythm';
import type { ArticulationKind, Score } from './types';

function getAllEvents(score: Score) {
  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) => voice.events),
      ),
    ),
  );
}

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
    expect(deserializeScore(serializeScore(stressPianoHardeningFixture))).toEqual(
      stressPianoHardeningFixture,
    );
    extremeScoreFixtures.forEach((score) => {
      expect(deserializeScore(serializeScore(score))).toEqual(score);
    });
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

  it('provides a hardening fixture with dense valid notation cases', () => {
    const events = getAllEvents(stressPianoHardeningFixture);
    const tupletActualNotes = [
      ...new Set(events.flatMap((event) => event.tuplet?.actualNotes ?? [])),
    ].sort((first, second) => first - second);
    const crossSystemSource = events.find(
      (event) => event.id === 'stress-cross-source',
    );
    const lyricRangeSource = events.find(
      (event) => event.id === 'stress-lyric-range-source',
    );
    const trebleStaff = stressPianoHardeningFixture.parts[0]?.staves.find(
      (staff) => staff.id === 'treble',
    );

    expect(stressPianoHardeningFixture.type).toBe('grand');
    expect(stressPianoHardeningFixture.parts[0]?.staves).toHaveLength(2);
    expect(trebleStaff?.measures).toHaveLength(12);
    expect(stressPianoHardeningFixture.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ottava',
          ottava: '8va',
          sourceEventId: 'stress-m9-d5',
          targetEventId: 'stress-m9-c5',
        }),
      ]),
    );
    expect(getScoreRhythmIssues(stressPianoHardeningFixture)).toEqual([]);
    expect(tupletActualNotes).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(crossSystemSource).toMatchObject({
      hairpin: 'crescendo',
      pedal: 'start',
      slurs: [
        {
          targetEventId: 'stress-cross-target',
        },
      ],
      ties: [
        {
          targetEventId: 'stress-cross-target',
        },
      ],
    });
    expect(lyricRangeSource).toMatchObject({
      chordSymbol: 'Cmaj7',
      dynamic: 'mf',
      lyric: 'long',
      lyricMap: {
        eventIds: [
          'stress-lyric-range-source',
          'stress-lyric-range-2',
          'stress-lyric-range-3',
        ],
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ articulations: ['accent', 'tenuto', 'marcato'] }),
        expect.objectContaining({ fermata: true }),
        expect.objectContaining({ glissando: true }),
      ]),
    );
  });

  it('provides multiple extreme fixtures for complex piano and vocal QA', () => {
    const allEvents = extremeScoreFixtures.flatMap(getAllEvents);
    const allArticulations = new Set(
      allEvents.flatMap((event) => event.articulations ?? []),
    );
    const tupletActualNotes = [
      ...new Set(allEvents.flatMap((event) => event.tuplet?.actualNotes ?? [])),
    ].sort((first, second) => first - second);
    const ottavaKinds = [
      ...new Set(
        extremeScoreFixtures.flatMap((score) =>
          (score.marks ?? []).flatMap((mark) =>
            mark.scope === 'range' && mark.kind === 'ottava' && mark.ottava
              ? [mark.ottava]
              : [],
          ),
        ),
      ),
    ].sort();

    expect(extremeScoreFixtures).toEqual([
      stressPianoHardeningFixture,
      extremeTupletRepeatEtudeFixture,
      extremeVocalPianoFixture,
      extremeClefOttavaChromaticFixture,
      readableSpacingStressFixture,
    ]);
    expect(extremeScoreFixtures.map((score) => score.title)).toEqual([
      'Stress Piano Hardening Fixture',
      'Extreme Tuplet Repeat Etude',
      'Extreme Vocal Piano Map Study',
      'Extreme Clef Ottava Chromatic Study',
      'Readable Spacing Stress',
    ]);
    extremeScoreFixtures.forEach((score) => {
      expect(getScoreRhythmIssues(score)).toEqual([]);
      expect(getRepeatPlaybackIssues(score)).toEqual([]);
      expect(getAllEvents(score).length).toBeGreaterThan(30);
    });
    expect(tupletActualNotes).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ottavaKinds).toEqual(['15ma', '15mb', '8va', '8vb']);
    (
      [
        'accent',
        'breath',
        'caesura',
        'marcato',
        'staccatissimo',
        'staccato',
        'tenuto',
      ] satisfies ArticulationKind[]
    ).forEach((articulation) => {
      expect(allArticulations.has(articulation)).toBe(true);
    });
    expect(
      allEvents.filter((event) => event.lyricMap && event.lyric).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('catalogs demo and extreme fixtures with stable metadata', () => {
    expect(scoreFixtureCatalog.map((fixture) => fixture.id)).toEqual([
      'treble-study',
      'grand-staff-study',
      'du-cho-tan-the-excerpt',
      'stress-piano-hardening',
      'extreme-tuplet-repeat',
      'extreme-vocal-piano',
      'extreme-clef-ottava-chromatic',
      'readable-spacing-stress',
    ]);
    expect(extremeScoreFixtureCatalog.map((fixture) => fixture.score)).toEqual(
      extremeScoreFixtures,
    );
    scoreFixtureCatalog.forEach((fixture) => {
      expect(fixture.expectedEventCount).toBe(getAllEvents(fixture.score).length);
      expect(fixture.capabilities).toContain('playback');
    });
    extremeScoreFixtureCatalog.forEach((fixture) => {
      expect(fixture.risk).toBe('high');
      expect(fixture.capabilities).toEqual(
        expect.arrayContaining(['grand-staff']),
      );
    });
    expect(
      extremeScoreFixtureCatalog.some((fixture) =>
        fixture.capabilities.includes('tuplets'),
      ),
    ).toBe(true);
    expect(
      extremeScoreFixtureCatalog.some((fixture) =>
        fixture.capabilities.includes('lyric-map'),
      ),
    ).toBe(true);
    expect(
      extremeScoreFixtureCatalog.some((fixture) =>
        fixture.capabilities.includes('ottava'),
      ),
    ).toBe(true);
  });
});
