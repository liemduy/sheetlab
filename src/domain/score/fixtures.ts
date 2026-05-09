import { createEmptyScore } from './factories';
import {
  setMeasureKeySignature,
  setMeasureSectionMarker,
  setScoreTimeSignature,
  tryUpdateScoreEvent,
} from './editing';
import type { Score, ScoreEvent, StaffId } from './types';

function withMeasureEvents(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  events: ScoreEvent[],
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === measureIndex
                  ? {
                      ...measure,
                      voices: measure.voices.map((voice, voiceIndex) =>
                        voiceIndex === 0 ? { ...voice, events } : voice,
                      ),
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };
}

const trebleBase = createEmptyScore('treble', {
  id: 'fixture-treble-study',
  title: 'First Treble Study',
  composer: 'SheetLab',
  measureCount: 4,
});

export const trebleStudyFixture = withMeasureEvents(trebleBase, 'treble', 0, [
  {
    id: 'treble-m1-e1',
    kind: 'note',
    beat: 0,
    duration: 'quarter',
    pitch: { step: 'C', octave: 4 },
  },
  {
    id: 'treble-m1-e2',
    kind: 'note',
    beat: 1,
    duration: 'quarter',
    pitch: { step: 'D', octave: 4 },
  },
  {
    id: 'treble-m1-e3',
    kind: 'note',
    beat: 2,
    duration: 'quarter',
    pitch: { step: 'E', octave: 4 },
  },
  {
    id: 'treble-m1-e4',
    kind: 'note',
    beat: 3,
    duration: 'quarter',
    pitch: { step: 'F', octave: 4 },
  },
]);

const grandBase = createEmptyScore('grand', {
  id: 'fixture-grand-study',
  title: 'First Piano Study',
  composer: 'SheetLab',
  measureCount: 4,
});

const grandWithTreble = withMeasureEvents(grandBase, 'treble', 0, [
  {
    id: 'grand-treble-m1-e1',
    kind: 'note',
    beat: 0,
    duration: 'half',
    pitch: { step: 'C', octave: 5 },
  },
  {
    id: 'grand-treble-m1-e2',
    kind: 'note',
    beat: 2,
    duration: 'half',
    pitch: { step: 'G', octave: 4 },
  },
]);

export const grandStaffStudyFixture = withMeasureEvents(
  grandWithTreble,
  'bass',
  0,
  [
    {
      id: 'grand-bass-m1-e1',
      kind: 'note',
      beat: 0,
      duration: 'half',
      pitch: { step: 'C', octave: 3 },
    },
    {
      id: 'grand-bass-m1-e2',
      kind: 'rest',
      beat: 2,
      duration: 'half',
    },
  ],
);

const realWorldBase = setMeasureSectionMarker(
  setMeasureKeySignature(
    setScoreTimeSignature(
      createEmptyScore('grand', {
        id: 'fixture-du-cho-tan-the-excerpt',
        title: 'Du Cho Tan The Excerpt',
        composer: 'SheetLab',
        measureCount: 4,
        tempo: 96,
      }),
      { beats: 2, beatUnit: 4 },
    ),
    0,
    'D',
  ),
  0,
  'Intro',
);

const realWorldTreble = withMeasureEvents(realWorldBase, 'treble', 0, [
  {
    id: 'du-excerpt-treble-m1-e1',
    kind: 'note',
    beat: 0,
    duration: 'quarter',
    chordSymbol: 'D',
    dynamic: 'mf',
    glissando: true,
    lyric: 'du',
    pedal: 'start',
    pitch: { step: 'F', octave: 4 },
  },
  {
    id: 'du-excerpt-treble-m1-e2',
    kind: 'note',
    beat: 1,
    duration: 'quarter',
    chordSymbol: 'E7/D',
    fermata: true,
    lyric: 'cho',
    pitch: { step: 'A', octave: 4 },
  },
]);

const realWorldBass = withMeasureEvents(realWorldTreble, 'bass', 0, [
  {
    id: 'du-excerpt-bass-m1-e1',
    kind: 'note',
    beat: 0,
    duration: 'half',
    pitch: { step: 'D', octave: 3 },
  },
]);

export const duChoTanTheExcerptFixture = tryUpdateScoreEvent(
  realWorldBass,
  'du-excerpt-bass-m1-e1',
  {
    pedal: 'release',
  },
).score;
