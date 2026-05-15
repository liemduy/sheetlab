import { countScoreEvents } from './editing';
import {
  duChoTanTheExcerptFixture,
  extremeClefOttavaChromaticFixture,
  extremeTupletRepeatEtudeFixture,
  extremeVocalPianoFixture,
  grandStaffStudyFixture,
  readableSpacingStressFixture,
  stressPianoHardeningFixture,
  trebleStudyFixture,
} from './fixtures';
import type { Score, ScoreEvent } from './types';

export type ScoreFixtureCategory = 'basic' | 'excerpt' | 'extreme';

export type ScoreFixtureCapability =
  | 'articulations'
  | 'clef-changes'
  | 'grand-staff'
  | 'key-signatures'
  | 'lyric-map'
  | 'ottava'
  | 'playback'
  | 'repeat-jumps'
  | 'tie-slur'
  | 'tuplets';

export interface ScoreFixtureMetadata {
  category: ScoreFixtureCategory;
  capabilities: readonly ScoreFixtureCapability[];
  expectedEventCount: number;
  id: string;
  label: string;
  risk: 'low' | 'medium' | 'high';
  score: Score;
}

function hasTuplets(score: Score) {
  return getFixtureEvents(score).some((event) => Boolean(event.tuplet));
}

function hasLyricMap(score: Score) {
  return getFixtureEvents(score).some((event) => Boolean(event.lyricMap));
}

function hasConnections(score: Score) {
  return getFixtureEvents(score).some(
    (event) => Boolean(event.ties?.length) || Boolean(event.slurs?.length),
  );
}

function hasArticulations(score: Score) {
  return getFixtureEvents(score).some((event) =>
    Boolean(event.articulations?.length),
  );
}

function hasClefChanges(score: Score) {
  return score.parts.some((part) =>
    part.staves.some((staff) =>
      staff.measures.some((measure) => Boolean(measure.clefChanges?.length)),
    ),
  );
}

function hasKeySignatures(score: Score) {
  return score.parts.some((part) =>
    part.staves.some((staff) =>
      staff.measures.some((measure) => Boolean(measure.keySignature)),
    ),
  );
}

function hasRepeatJumps(score: Score) {
  return score.parts[0]?.staves[0]?.measures.some((measure) =>
    Boolean(measure.repeatJump),
  ) ?? false;
}

function hasOttava(score: Score) {
  return (score.marks ?? []).some(
    (mark) => mark.scope === 'range' && mark.kind === 'ottava',
  );
}

function getFixtureEvents(score: Score): ScoreEvent[] {
  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) => voice.events),
      ),
    ),
  );
}

function inferCapabilities(score: Score): ScoreFixtureCapability[] {
  const capabilities: ScoreFixtureCapability[] = ['playback'];

  if (score.type === 'grand') {
    capabilities.push('grand-staff');
  }

  if (hasTuplets(score)) {
    capabilities.push('tuplets');
  }

  if (hasLyricMap(score)) {
    capabilities.push('lyric-map');
  }

  if (hasConnections(score)) {
    capabilities.push('tie-slur');
  }

  if (hasArticulations(score)) {
    capabilities.push('articulations');
  }

  if (hasClefChanges(score)) {
    capabilities.push('clef-changes');
  }

  if (hasKeySignatures(score)) {
    capabilities.push('key-signatures');
  }

  if (hasRepeatJumps(score)) {
    capabilities.push('repeat-jumps');
  }

  if (hasOttava(score)) {
    capabilities.push('ottava');
  }

  return capabilities;
}

function createFixtureMetadata({
  category,
  id,
  label,
  risk,
  score,
}: Omit<
  ScoreFixtureMetadata,
  'capabilities' | 'expectedEventCount'
>): ScoreFixtureMetadata {
  return {
    category,
    capabilities: inferCapabilities(score),
    expectedEventCount: countScoreEvents(score),
    id,
    label,
    risk,
    score,
  };
}

export const scoreFixtureCatalog = [
  createFixtureMetadata({
    category: 'basic',
    id: 'treble-study',
    label: 'Treble Study',
    risk: 'low',
    score: trebleStudyFixture,
  }),
  createFixtureMetadata({
    category: 'basic',
    id: 'grand-staff-study',
    label: 'Grand Staff Study',
    risk: 'low',
    score: grandStaffStudyFixture,
  }),
  createFixtureMetadata({
    category: 'excerpt',
    id: 'du-cho-tan-the-excerpt',
    label: 'Du Cho Tan The Excerpt',
    risk: 'medium',
    score: duChoTanTheExcerptFixture,
  }),
  createFixtureMetadata({
    category: 'extreme',
    id: 'stress-piano-hardening',
    label: 'Stress Piano Hardening',
    risk: 'high',
    score: stressPianoHardeningFixture,
  }),
  createFixtureMetadata({
    category: 'extreme',
    id: 'extreme-tuplet-repeat',
    label: 'Extreme Tuplet Repeat',
    risk: 'high',
    score: extremeTupletRepeatEtudeFixture,
  }),
  createFixtureMetadata({
    category: 'extreme',
    id: 'extreme-vocal-piano',
    label: 'Extreme Vocal Piano',
    risk: 'high',
    score: extremeVocalPianoFixture,
  }),
  createFixtureMetadata({
    category: 'extreme',
    id: 'extreme-clef-ottava-chromatic',
    label: 'Extreme Clef/Ottava Chromatic',
    risk: 'high',
    score: extremeClefOttavaChromaticFixture,
  }),
  createFixtureMetadata({
    category: 'extreme',
    id: 'readable-spacing-stress',
    label: 'Readable Spacing Stress',
    risk: 'high',
    score: readableSpacingStressFixture,
  }),
] as const satisfies readonly ScoreFixtureMetadata[];

export const extremeScoreFixtureCatalog = scoreFixtureCatalog.filter(
  (fixture) => fixture.category === 'extreme',
);

export function getScoreFixtureById(id: string) {
  return scoreFixtureCatalog.find((fixture) => fixture.id === id) ?? null;
}
