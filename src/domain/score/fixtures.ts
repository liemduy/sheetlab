import { createEmptyScore } from './factories';
import {
  setMeasureKeySignature,
  setMeasureSectionMarker,
  setScoreTimeSignature,
  tryUpdateScoreEvent,
} from './editing';
import {
  createTupletInfo,
  getTupletSlotEffectiveBeats,
  type SupportedTupletActualNotes,
} from './tuplets';
import type {
  DurationValue,
  Measure,
  NotationMark,
  Pitch,
  Score,
  ScoreEvent,
  StaffId,
} from './types';

type MeasureFixturePatch = Partial<
  Pick<Measure, 'clefChanges' | 'keySignature' | 'repeatJump' | 'sectionMarker'>
>;

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

function withMeasureVoiceEvents(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  voiceEvents: ScoreEvent[][],
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
                      voices: voiceEvents.map((events, voiceIndex) => ({
                        id: `voice-${staffId}-${measureIndex + 1}-${voiceIndex + 1}`,
                        events,
                      })),
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };
}

function noteEvent(
  id: string,
  beat: number,
  duration: DurationValue,
  pitch: Pitch,
  extra: Partial<
    Omit<Extract<ScoreEvent, { kind: 'note' }>, 'beat' | 'duration' | 'id' | 'kind' | 'pitch'>
  > = {},
): ScoreEvent {
  return {
    id,
    kind: 'note',
    beat,
    duration,
    pitch,
    ...extra,
  };
}

function chordEvent(
  id: string,
  beat: number,
  duration: DurationValue,
  pitches: Pitch[],
  extra: Partial<
    Omit<Extract<ScoreEvent, { kind: 'chord' }>, 'beat' | 'duration' | 'id' | 'kind' | 'pitches'>
  > = {},
): ScoreEvent {
  return {
    id,
    kind: 'chord',
    beat,
    duration,
    pitches,
    ...extra,
  };
}

function withMeasurePatch(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  patch: MeasureFixturePatch,
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
                      ...patch,
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };
}

function tupletNoteEvents({
  actualNotes,
  beat,
  duration,
  id,
  normalNotes,
  pitches,
}: {
  actualNotes: SupportedTupletActualNotes;
  beat: number;
  duration: DurationValue;
  id: string;
  normalNotes: number;
  pitches: Pitch[];
}) {
  const tupletId = `tuplet-${id}`;
  const beatStep = getTupletSlotEffectiveBeats(
    duration,
    actualNotes,
    normalNotes,
  );

  return Array.from({ length: actualNotes }, (_, index): ScoreEvent => {
    const pitch = pitches[index] ?? pitches[pitches.length - 1] ?? {
      octave: 4,
      step: 'C',
    };

    return noteEvent(
      `${id}-${index + 1}`,
      Number((beat + beatStep * index).toFixed(4)),
      duration,
      pitch,
      {
        tuplet: createTupletInfo({
          actualNotes,
          id: tupletId,
          index,
          normalNotes,
        }),
      },
    );
  });
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

const stressBase = createEmptyScore('grand', {
  id: 'fixture-stress-piano-hardening',
  title: 'Stress Piano Hardening Fixture',
  composer: 'SheetLab QA',
  measureCount: 12,
  tempo: 132,
});

const stressWithMeta = setMeasureSectionMarker(
  setMeasureKeySignature(stressBase, 0, 'G'),
  0,
  'A',
);

const stressTreble0 = withMeasureVoiceEvents(stressWithMeta, 'treble', 0, [
  [
    ...tupletNoteEvents({
      actualNotes: 2,
      beat: 0,
      duration: 'half',
      id: 'stress-duplet',
      normalNotes: 1,
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'D', octave: 4 },
      ],
    }),
    ...tupletNoteEvents({
      actualNotes: 3,
      beat: 2,
      duration: 'eighth',
      id: 'stress-triplet',
      normalNotes: 2,
      pitches: [
        { step: 'E', octave: 4 },
        { accidental: 'sharp', step: 'F', octave: 4 },
        { step: 'G', octave: 4 },
      ],
    }),
    ...tupletNoteEvents({
      actualNotes: 4,
      beat: 3,
      duration: 'eighth',
      id: 'stress-quadruplet',
      normalNotes: 2,
      pitches: [
        { step: 'A', octave: 4 },
        { step: 'B', octave: 4 },
        { step: 'C', octave: 5 },
        { step: 'D', octave: 5 },
      ],
    }),
  ],
  [
    noteEvent('stress-voice2-m0-e5', 0, 'half', { step: 'E', octave: 5 }, {
      stemDirection: 'down',
    }),
    noteEvent('stress-voice2-m0-d5', 2, 'half', { step: 'D', octave: 5 }, {
      stemDirection: 'down',
    }),
  ],
]);

const stressTreble1 = withMeasureEvents(stressTreble0, 'treble', 1, [
  ...tupletNoteEvents({
    actualNotes: 5,
    beat: 0,
    duration: 'sixteenth',
    id: 'stress-quintuplet',
    normalNotes: 4,
    pitches: [
      { step: 'C', octave: 5 },
      { step: 'B', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'F', octave: 4 },
    ],
  }),
  ...tupletNoteEvents({
    actualNotes: 6,
    beat: 1,
    duration: 'sixteenth',
    id: 'stress-sextuplet',
    normalNotes: 4,
    pitches: [
      { step: 'E', octave: 4 },
      { step: 'F', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'B', octave: 4 },
      { step: 'C', octave: 5 },
    ],
  }),
  ...tupletNoteEvents({
    actualNotes: 7,
    beat: 2,
    duration: 'sixteenth',
    id: 'stress-septuplet',
    normalNotes: 4,
    pitches: [
      { step: 'D', octave: 5 },
      { step: 'C', octave: 5 },
      { step: 'B', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'F', octave: 4 },
      { step: 'E', octave: 4 },
    ],
  }),
  ...tupletNoteEvents({
    actualNotes: 8,
    beat: 3,
    duration: 'sixteenth',
    id: 'stress-octuplet',
    normalNotes: 4,
    pitches: [
      { step: 'C', octave: 4 },
      { step: 'D', octave: 4 },
      { step: 'E', octave: 4 },
      { step: 'F', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'B', octave: 4 },
      { step: 'C', octave: 5 },
    ],
  }),
]);

const stressTreble2 = withMeasureEvents(stressTreble1, 'treble', 2, [
  ...tupletNoteEvents({
    actualNotes: 9,
    beat: 0,
    duration: 'thirtySecond',
    id: 'stress-nonuplet',
    normalNotes: 8,
    pitches: [
      { step: 'C', octave: 5 },
      { step: 'D', octave: 5 },
      { step: 'E', octave: 5 },
      { step: 'F', octave: 5 },
      { step: 'G', octave: 5 },
      { step: 'A', octave: 5 },
      { step: 'B', octave: 5 },
      { step: 'C', octave: 6 },
      { step: 'B', octave: 5 },
    ],
  }),
  noteEvent('stress-lyric-range-source', 1, 'quarter', { step: 'E', octave: 4 }, {
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
  }),
  noteEvent('stress-lyric-range-2', 2, 'quarter', { step: 'F', octave: 4 }, {
    articulations: ['tenuto'],
  }),
  noteEvent('stress-lyric-range-3', 3, 'quarter', { step: 'G', octave: 4 }, {
    articulations: ['accent', 'staccato'],
  }),
]);

const stressTreble3 = withMeasureEvents(stressTreble2, 'treble', 3, [
  ...tupletNoteEvents({
    actualNotes: 8,
    beat: 0,
    duration: 'sixteenth',
    id: 'stress-break-octuplet',
    normalNotes: 4,
    pitches: [
      { step: 'E', octave: 5 },
      { step: 'F', octave: 5 },
      { step: 'G', octave: 5 },
      { step: 'A', octave: 5 },
      { step: 'B', octave: 5 },
      { step: 'C', octave: 6 },
      { step: 'D', octave: 6 },
      { step: 'E', octave: 6 },
    ],
  }),
  ...tupletNoteEvents({
    actualNotes: 9,
    beat: 1,
    duration: 'thirtySecond',
    id: 'stress-break-nonuplet',
    normalNotes: 8,
    pitches: [
      { step: 'D', octave: 6 },
      { step: 'C', octave: 6 },
      { step: 'B', octave: 5 },
      { step: 'A', octave: 5 },
      { step: 'G', octave: 5 },
      { step: 'F', octave: 5 },
      { step: 'E', octave: 5 },
      { step: 'D', octave: 5 },
      { step: 'C', octave: 5 },
    ],
  }),
  ...tupletNoteEvents({
    actualNotes: 7,
    beat: 2,
    duration: 'sixteenth',
    id: 'stress-break-septuplet',
    normalNotes: 4,
    pitches: [
      { step: 'B', octave: 4 },
      { step: 'A', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'F', octave: 4 },
      { step: 'E', octave: 4 },
      { step: 'D', octave: 4 },
      { step: 'C', octave: 4 },
    ],
  }),
  noteEvent('stress-cross-source', 3, 'quarter', { step: 'C', octave: 4 }, {
    hairpin: 'crescendo',
    pedal: 'start',
    slurs: [{ id: 'stress-cross-slur', targetEventId: 'stress-cross-target' }],
    ties: [
      {
        pitchIndex: 0,
        targetEventId: 'stress-cross-target',
        targetPitchIndex: 0,
      },
    ],
  }),
]);

const stressTreble4Base = setMeasureSectionMarker(
  setMeasureKeySignature(stressTreble3, 4, 'F'),
  4,
  'B',
);
const stressTreble4 = withMeasureEvents(stressTreble4Base, 'treble', 4, [
  noteEvent('stress-cross-target', 0, 'quarter', { step: 'C', octave: 4 }, {
    dynamic: 'f',
    pedal: 'release',
  }),
  noteEvent('stress-m4-d4', 1, 'quarter', { step: 'D', octave: 4 }, {
    glissando: true,
  }),
  noteEvent('stress-m4-e4', 2, 'half', { step: 'E', octave: 4 }),
]);

const stressTreble5 = withMeasureEvents(
  {
    ...stressTreble4,
    parts: stressTreble4.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === 'treble'
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 5
                  ? {
                      ...measure,
                      clefChanges: [
                        {
                          beat: 1,
                          clef: 'bass',
                          id: 'stress-clef-bass-on-treble',
                        },
                      ],
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  },
  'treble',
  5,
  [
    noteEvent('stress-m5-c5', 0, 'quarter', { step: 'C', octave: 5 }),
    noteEvent('stress-m5-e3', 1, 'quarter', { step: 'E', octave: 3 }, {
      chordSymbol: 'Cm',
      dynamic: 'pp',
    }),
    noteEvent('stress-m5-g3', 2, 'half', { step: 'G', octave: 3 }),
  ],
);

const stressTreble6 = withMeasureEvents(
  {
    ...stressTreble5,
    parts: stressTreble5.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === 'treble'
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 6
                  ? {
                      ...measure,
                      clefChanges: [
                        {
                          beat: 0,
                          clef: 'treble',
                          id: 'stress-clef-treble-return',
                        },
                      ],
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  },
  'treble',
  6,
  [
    noteEvent('stress-m6-a4', 0, 'quarter', { step: 'A', octave: 4 }),
    noteEvent('stress-m6-b4', 1, 'quarter', { step: 'B', octave: 4 }),
    noteEvent('stress-m6-c5', 2, 'half', { step: 'C', octave: 5 }, {
      hairpin: 'diminuendo',
    }),
  ],
);

const stressTreble7 = withMeasureEvents(stressTreble6, 'treble', 7, [
  noteEvent('stress-high-ledger', 0, 'whole', { step: 'A', octave: 6 }, {
    articulations: ['accent', 'tenuto', 'marcato'],
    fermata: true,
  }),
]);

const stressTreble8 = withMeasureEvents(stressTreble7, 'treble', 8, [
  noteEvent('stress-m8-e4', 0, 'quarter', { step: 'E', octave: 4 }, {
    lyric: 'one',
    lyricMap: { eventIds: ['stress-m8-e4'] },
  }),
  noteEvent('stress-m8-f4', 1, 'quarter', { step: 'F', octave: 4 }),
  noteEvent('stress-m8-g4', 2, 'quarter', { step: 'G', octave: 4 }),
  noteEvent('stress-m8-a4', 3, 'quarter', { step: 'A', octave: 4 }),
]);

const stressTreble9 = withMeasureEvents(
  {
    ...stressTreble8,
    parts: stressTreble8.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === 'treble'
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 9 ? { ...measure, repeatJump: 'segno' } : measure,
              ),
            }
          : staff,
      ),
    })),
  },
  'treble',
  9,
  [
    noteEvent('stress-m9-d5', 0, 'half', { step: 'D', octave: 5 }),
    noteEvent('stress-m9-c5', 2, 'half', { step: 'C', octave: 5 }),
  ],
);

const stressTreble10 = withMeasureEvents(
  {
    ...stressTreble9,
    parts: stressTreble9.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === 'treble'
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 10
                  ? { ...measure, repeatJump: 'to-coda' }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  },
  'treble',
  10,
  [
    noteEvent('stress-m10-a4', 0, 'whole', { step: 'A', octave: 4 }),
  ],
);

const stressTreble11 = withMeasureEvents(
  {
    ...stressTreble10,
    parts: stressTreble10.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === 'treble'
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === 11 ? { ...measure, repeatJump: 'fine' } : measure,
              ),
            }
          : staff,
      ),
    })),
  },
  'treble',
  11,
  [
    chordEvent(
      'stress-final-chord',
      0,
      'whole',
      [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
        { step: 'G', octave: 4 },
        { step: 'B', octave: 4 },
      ],
      {
        chordSymbol: 'Cmaj9',
        dynamic: 'ff',
      },
    ),
  ],
);

const stressBass0 = withMeasureEvents(stressTreble11, 'bass', 0, [
  chordEvent('stress-b0-c2-g2', 0, 'half', [
    { step: 'C', octave: 2 },
    { step: 'G', octave: 2 },
  ]),
  noteEvent('stress-b0-c3', 2, 'half', { step: 'C', octave: 3 }),
]);

const stressBass1 = withMeasureEvents(stressBass0, 'bass', 1, [
  noteEvent('stress-b1-c2', 0, 'quarter', { step: 'C', octave: 2 }),
  noteEvent('stress-b1-g2', 1, 'quarter', { step: 'G', octave: 2 }),
  noteEvent('stress-b1-c3', 2, 'half', { step: 'C', octave: 3 }),
]);

const stressBass2 = withMeasureEvents(stressBass1, 'bass', 2, [
  noteEvent('stress-b2-e2', 0, 'half', { step: 'E', octave: 2 }),
  noteEvent('stress-b2-g2', 2, 'half', { step: 'G', octave: 2 }),
]);

const stressBass3 = withMeasureEvents(stressBass2, 'bass', 3, [
  noteEvent('stress-b3-c2', 0, 'whole', { step: 'C', octave: 2 }),
]);

const stressBass4 = withMeasureEvents(stressBass3, 'bass', 4, [
  noteEvent('stress-b4-g2', 0, 'half', { step: 'G', octave: 2 }),
  noteEvent('stress-b4-c3', 2, 'half', { step: 'C', octave: 3 }),
]);

const stressBass5 = withMeasureEvents(stressBass4, 'bass', 5, [
  noteEvent('stress-low-ledger', 0, 'whole', { step: 'A', octave: 1 }),
]);

const stressBass6 = withMeasureEvents(stressBass5, 'bass', 6, [
  chordEvent('stress-b6-c2-e2', 0, 'half', [
    { step: 'C', octave: 2 },
    { step: 'E', octave: 2 },
  ]),
  chordEvent('stress-b6-g2-b2', 2, 'half', [
    { step: 'G', octave: 2 },
    { step: 'B', octave: 2 },
  ]),
]);

const stressBass8 = withMeasureEvents(stressBass6, 'bass', 8, [
  noteEvent('stress-b8-c2', 0, 'whole', { step: 'C', octave: 2 }),
]);

const stressBass9 = withMeasureEvents(stressBass8, 'bass', 9, [
  noteEvent('stress-b9-e2', 0, 'half', { step: 'E', octave: 2 }),
  noteEvent('stress-b9-g2', 2, 'half', { step: 'G', octave: 2 }),
]);

const stressWithBassFinal = withMeasureEvents(
  stressBass9,
  'bass',
  11,
  [
    chordEvent('stress-b-final', 0, 'whole', [
      { step: 'C', octave: 2 },
      { step: 'G', octave: 2 },
      { step: 'C', octave: 3 },
    ]),
  ],
);

const stressExplicitMarks: NotationMark[] = [
  {
    end: {
      beat: 4,
      measureIndex: 9,
      staffId: 'treble',
      voiceIndex: 0,
    },
    id: 'stress-ottava-8va-m9',
    kind: 'ottava',
    ottava: '8va',
    placement: 'above',
    scope: 'range',
    sourceEventId: 'stress-m9-d5',
    start: {
      beat: 0,
      measureIndex: 9,
      staffId: 'treble',
      voiceIndex: 0,
    },
    targetEventId: 'stress-m9-c5',
  },
];

export const stressPianoHardeningFixture: Score = {
  ...stressWithBassFinal,
  marks: stressExplicitMarks,
};

const extremeTupletRepeatBase = setMeasureSectionMarker(
  setMeasureKeySignature(
    setScoreTimeSignature(
      createEmptyScore('grand', {
        id: 'fixture-extreme-tuplet-repeat-etude',
        title: 'Extreme Tuplet Repeat Etude',
        composer: 'SheetLab QA',
        measureCount: 10,
        tempo: 144,
      }),
      { beats: 5, beatUnit: 4 },
    ),
    0,
    'D',
  ),
  0,
  'A',
);

const extremeTupletRepeatMetaPatches: Array<[number, MeasureFixturePatch]> = [
  [0, { repeatJump: 'repeat-start' as const }],
  [3, { repeatJump: 'repeat-end' as const }],
  [5, { repeatJump: 'segno' as const, sectionMarker: 'B' }],
  [6, { repeatJump: 'to-coda' as const }],
  [8, { repeatJump: 'coda' as const, sectionMarker: 'Coda' }],
  [9, { repeatJump: 'ds-al-coda' as const }],
];

const extremeTupletRepeatMeta = extremeTupletRepeatMetaPatches.reduce(
  (score, [measureIndex, patch]) =>
    withMeasurePatch(score, 'treble', measureIndex, patch),
  extremeTupletRepeatBase,
);

const extremeTupletRepeatM0 = withMeasureVoiceEvents(
  extremeTupletRepeatMeta,
  'treble',
  0,
  [
    [
      ...tupletNoteEvents({
        actualNotes: 2,
        beat: 0,
        duration: 'half',
        id: 'extreme-duplet-opening',
        normalNotes: 1,
        pitches: [
          { step: 'C', octave: 5 },
          { step: 'E', octave: 5 },
        ],
      }),
      ...tupletNoteEvents({
        actualNotes: 3,
        beat: 2,
        duration: 'quarter',
        id: 'extreme-triplet-opening',
        normalNotes: 2,
        pitches: [
          { step: 'F', octave: 5 },
          { accidental: 'sharp', step: 'F', octave: 5 },
          { step: 'G', octave: 5 },
        ],
      }),
      noteEvent('extreme-opening-anchor', 4, 'quarter', { step: 'A', octave: 5 }, {
        articulations: ['accent', 'tenuto'],
        chordSymbol: 'Dmaj9',
        dynamic: 'mf',
      }),
    ],
    [
      chordEvent('extreme-v2-open-d', 0, 'half', [
        { step: 'D', octave: 4 },
        { step: 'A', octave: 4 },
      ], {
        stemDirection: 'down',
      }),
      chordEvent('extreme-v2-open-g', 2, 'half', [
        { step: 'G', octave: 4 },
        { step: 'B', octave: 4 },
      ], {
        stemDirection: 'down',
      }),
      noteEvent('extreme-v2-open-cs', 4, 'quarter', {
        accidental: 'sharp',
        step: 'C',
        octave: 5,
      }, {
        stemDirection: 'down',
      }),
    ],
  ],
);

const extremeTupletRepeatM1 = withMeasureEvents(
  extremeTupletRepeatM0,
  'treble',
  1,
  [
    ...tupletNoteEvents({
      actualNotes: 5,
      beat: 0,
      duration: 'sixteenth',
      id: 'extreme-quintuplet-run',
      normalNotes: 4,
      pitches: [
        { step: 'D', octave: 5 },
        { step: 'E', octave: 5 },
        { accidental: 'sharp', step: 'F', octave: 5 },
        { step: 'A', octave: 5 },
        { step: 'B', octave: 5 },
      ],
    }),
    ...tupletNoteEvents({
      actualNotes: 6,
      beat: 1,
      duration: 'sixteenth',
      id: 'extreme-sextuplet-run',
      normalNotes: 4,
      pitches: [
        { step: 'C', octave: 6 },
        { step: 'B', octave: 5 },
        { step: 'A', octave: 5 },
        { step: 'G', octave: 5 },
        { accidental: 'sharp', step: 'F', octave: 5 },
        { step: 'E', octave: 5 },
      ],
    }),
    ...tupletNoteEvents({
      actualNotes: 7,
      beat: 2,
      duration: 'sixteenth',
      id: 'extreme-septuplet-run',
      normalNotes: 4,
      pitches: [
        { step: 'D', octave: 5 },
        { step: 'E', octave: 5 },
        { accidental: 'sharp', step: 'F', octave: 5 },
        { step: 'G', octave: 5 },
        { step: 'A', octave: 5 },
        { step: 'B', octave: 5 },
        { step: 'C', octave: 6 },
      ],
    }),
    ...tupletNoteEvents({
      actualNotes: 8,
      beat: 3,
      duration: 'sixteenth',
      id: 'extreme-octuplet-run',
      normalNotes: 4,
      pitches: [
        { step: 'D', octave: 6 },
        { step: 'C', octave: 6 },
        { step: 'B', octave: 5 },
        { step: 'A', octave: 5 },
        { step: 'G', octave: 5 },
        { accidental: 'sharp', step: 'F', octave: 5 },
        { step: 'E', octave: 5 },
        { step: 'D', octave: 5 },
      ],
    }),
    noteEvent('extreme-run-cadence', 4, 'quarter', { step: 'C', octave: 5 }, {
      articulations: ['staccatissimo'],
    }),
  ],
);

const extremeTupletRepeatM2 = withMeasureEvents(
  extremeTupletRepeatM1,
  'treble',
  2,
  [
    ...tupletNoteEvents({
      actualNotes: 9,
      beat: 0,
      duration: 'thirtySecond',
      id: 'extreme-nonuplet-spark',
      normalNotes: 8,
      pitches: [
        { step: 'B', octave: 5 },
        { step: 'A', octave: 5 },
        { step: 'G', octave: 5 },
        { accidental: 'sharp', step: 'F', octave: 5 },
        { step: 'E', octave: 5 },
        { step: 'D', octave: 5 },
        { accidental: 'sharp', step: 'C', octave: 5 },
        { step: 'B', octave: 4 },
        { step: 'A', octave: 4 },
      ],
    }),
    noteEvent('extreme-m2-lyric-a', 1, 'quarter', { step: 'G', octave: 4 }, {
      lyric: 'flash',
      lyricMap: {
        eventIds: ['extreme-m2-lyric-a', 'extreme-m2-lyric-b'],
      },
    }),
    noteEvent('extreme-m2-lyric-b', 2, 'quarter', { step: 'A', octave: 4 }),
    noteEvent('extreme-m2-bridge-b', 3, 'quarter', { step: 'B', octave: 4 }, {
      articulations: ['breath'],
    }),
    noteEvent('extreme-m2-bridge-c', 4, 'quarter', { step: 'C', octave: 5 }, {
      articulations: ['caesura'],
    }),
  ],
);

const extremeTupletRepeatM3 = withMeasureEvents(
  extremeTupletRepeatM2,
  'treble',
  3,
  [
    noteEvent('extreme-repeat-m3-a', 0, 'quarter', { step: 'D', octave: 5 }),
    noteEvent('extreme-repeat-m3-b', 1, 'quarter', { step: 'E', octave: 5 }),
    noteEvent('extreme-repeat-m3-c', 2, 'quarter', {
      accidental: 'sharp',
      step: 'F',
      octave: 5,
    }),
    noteEvent('extreme-repeat-m3-d', 3, 'quarter', { step: 'G', octave: 5 }),
    noteEvent('extreme-repeat-cross-source', 4, 'quarter', { step: 'A', octave: 5 }, {
      hairpin: 'crescendo',
      pedal: 'start',
      slurs: [{ id: 'extreme-repeat-cross-slur', targetEventId: 'extreme-repeat-cross-target' }],
      ties: [
        {
          pitchIndex: 0,
          targetEventId: 'extreme-repeat-cross-target',
          targetPitchIndex: 0,
        },
      ],
    }),
  ],
);

const extremeTupletRepeatM4 = withMeasureEvents(
  setMeasureKeySignature(extremeTupletRepeatM3, 4, 'A'),
  'treble',
  4,
  [
    noteEvent('extreme-repeat-cross-target', 0, 'quarter', { step: 'A', octave: 5 }, {
      dynamic: 'f',
      pedal: 'release',
    }),
    noteEvent('extreme-repeat-m4-b', 1, 'quarter', { step: 'B', octave: 5 }),
    noteEvent('extreme-repeat-m4-cs', 2, 'quarter', {
      accidental: 'sharp',
      step: 'C',
      octave: 6,
    }),
    chordEvent('extreme-repeat-m4-chord', 3, 'half', [
      { step: 'D', octave: 5 },
      { accidental: 'sharp', step: 'F', octave: 5 },
      { step: 'A', octave: 5 },
    ], {
      chordSymbol: 'D/A',
    }),
  ],
);

const extremeTupletRepeatTrebleDone = [5, 6, 7, 8, 9].reduce((score, measureIndex) => {
  const root = ['E', 'F', 'G', 'A', 'B'][measureIndex - 5] as Pitch['step'];

  return withMeasureEvents(score, 'treble', measureIndex, [
    noteEvent(`extreme-repeat-m${measureIndex}-a`, 0, 'quarter', {
      step: root,
      octave: 5,
    }),
    noteEvent(`extreme-repeat-m${measureIndex}-b`, 1, 'quarter', {
      step: root === 'B' ? 'C' : root,
      octave: root === 'B' ? 6 : 5,
    }, {
      glissando: measureIndex === 8,
    }),
    chordEvent(`extreme-repeat-m${measureIndex}-chord`, 2, 'half', [
      { step: 'D', octave: 5 },
      { accidental: 'sharp', step: 'F', octave: 5 },
      { step: 'A', octave: 5 },
    ], {
      dynamic: measureIndex === 9 ? 'ff' : undefined,
    }),
    noteEvent(`extreme-repeat-m${measureIndex}-tail`, 4, 'quarter', {
      step: 'C',
      octave: 6,
    }),
  ]);
}, extremeTupletRepeatM4);

const extremeTupletRepeatBassDone = Array.from({ length: 10 }, (_, index) => index)
  .reduce((score, measureIndex) => withMeasureEvents(score, 'bass', measureIndex, [
    chordEvent(`extreme-repeat-b${measureIndex}-bass-open`, 0, 'half', [
      { step: 'D', octave: 2 },
      { step: 'A', octave: 2 },
    ]),
    noteEvent(`extreme-repeat-b${measureIndex}-bass-mid`, 2, 'half', {
      step: measureIndex % 2 === 0 ? 'F' : 'G',
      octave: 2,
      accidental: measureIndex % 2 === 0 ? 'sharp' : undefined,
    }),
    noteEvent(`extreme-repeat-b${measureIndex}-bass-tail`, 4, 'quarter', {
      step: 'D',
      octave: 3,
    }),
  ]), extremeTupletRepeatTrebleDone);

export const extremeTupletRepeatEtudeFixture: Score = extremeTupletRepeatBassDone;

const extremeVocalBase = setMeasureSectionMarker(
  setMeasureKeySignature(
    createEmptyScore('grand', {
      id: 'fixture-extreme-vocal-piano',
      title: 'Extreme Vocal Piano Map Study',
      composer: 'SheetLab QA',
      measureCount: 8,
      tempo: 84,
    }),
    0,
    'Bb',
  ),
  0,
  'Verse',
);

const extremeVocalTreble0 = withMeasureEvents(extremeVocalBase, 'treble', 0, [
  noteEvent('extreme-vocal-m0-a', 0, 'quarter', { step: 'D', octave: 4 }, {
    chordSymbol: 'Bbmaj7',
    dynamic: 'mp',
    lyric: 'glo',
    lyricMap: {
      eventIds: [
        'extreme-vocal-m0-a',
        'extreme-vocal-m0-a2',
        'extreme-vocal-m0-a3',
      ],
    },
  }),
  noteEvent('extreme-vocal-m0-a2', 1, 'quarter', { step: 'F', octave: 4 }, {
    articulations: ['tenuto'],
  }),
  noteEvent('extreme-vocal-m0-a3', 2, 'quarter', { step: 'G', octave: 4 }),
  noteEvent('extreme-vocal-m0-close', 3, 'quarter', { step: 'A', octave: 4 }, {
    lyric: 'ria',
  }),
]);

const extremeVocalTreble1 = withMeasureEvents(extremeVocalTreble0, 'treble', 1, [
  noteEvent('extreme-vocal-m1-one', 0, 'quarter', {
    accidental: 'flat',
    step: 'B',
    octave: 4,
  }, {
    lyric: 'in',
  }),
  noteEvent('extreme-vocal-m1-two', 1, 'quarter', { step: 'A', octave: 4 }, {
    lyric: 'the',
    articulations: ['breath'],
  }),
  noteEvent('extreme-vocal-m1-three', 2, 'quarter', { step: 'G', octave: 4 }, {
    lyric: 'dark',
    articulations: ['staccatissimo'],
  }),
  noteEvent('extreme-vocal-m1-four', 3, 'quarter', { step: 'F', octave: 4 }, {
    lyric: 'air',
    articulations: ['caesura'],
    dynamic: 'p',
  }),
]);

const extremeVocalTreble2 = withMeasureEvents(extremeVocalTreble1, 'treble', 2, [
  noteEvent('extreme-vocal-m2-start', 0, 'quarter', { step: 'E', octave: 4 }, {
    chordSymbol: 'Gm9',
    lyric: 'ris',
  }),
  noteEvent('extreme-vocal-m2-hold', 1, 'quarter', { step: 'F', octave: 4 }, {
    lyric: 'ing',
  }),
  ...tupletNoteEvents({
    actualNotes: 3,
    beat: 2,
    duration: 'quarter',
    id: 'extreme-vocal-triplet-word',
    normalNotes: 2,
    pitches: [
      { step: 'G', octave: 4 },
      { step: 'A', octave: 4 },
      { accidental: 'flat', step: 'B', octave: 4 },
    ],
  }).map((event, index) => ({
    ...event,
    lyric: index === 0 ? 'now' : undefined,
    lyricMap:
      index === 0
        ? {
            eventIds: [
              'extreme-vocal-triplet-word-1',
              'extreme-vocal-triplet-word-2',
              'extreme-vocal-triplet-word-3',
            ],
          }
        : undefined,
  })),
]);

const extremeVocalTreble3 = withMeasureEvents(
  setMeasureSectionMarker(extremeVocalTreble2, 3, 'Lift'),
  'treble',
  3,
  [
    noteEvent('extreme-vocal-m3-a', 0, 'quarter', { step: 'C', octave: 5 }, {
      dynamic: 'mf',
    }),
    noteEvent('extreme-vocal-m3-b', 1, 'quarter', { step: 'D', octave: 5 }),
    noteEvent('extreme-vocal-m3-c', 2, 'quarter', { step: 'E', octave: 5 }),
    noteEvent('extreme-vocal-cross-source', 3, 'quarter', { step: 'F', octave: 5 }, {
      hairpin: 'crescendo',
      pedal: 'start',
      slurs: [{ id: 'extreme-vocal-cross-slur', targetEventId: 'extreme-vocal-cross-target' }],
      ties: [
        {
          pitchIndex: 0,
          targetEventId: 'extreme-vocal-cross-target',
          targetPitchIndex: 0,
        },
      ],
    }),
  ],
);

const extremeVocalTreble4 = withMeasureEvents(
  setMeasureKeySignature(extremeVocalTreble3, 4, 'Eb'),
  'treble',
  4,
  [
    noteEvent('extreme-vocal-cross-target', 0, 'quarter', { step: 'F', octave: 5 }, {
      dynamic: 'f',
      pedal: 'release',
    }),
    noteEvent('extreme-vocal-m4-g', 1, 'quarter', { step: 'G', octave: 5 }, {
      chordSymbol: 'Eb/Bb',
      lyric: 'shine',
    }),
    noteEvent('extreme-vocal-m4-f', 2, 'quarter', { step: 'F', octave: 5 }),
    noteEvent('extreme-vocal-m4-eb', 3, 'quarter', {
      accidental: 'flat',
      step: 'E',
      octave: 5,
    }, {
      fermata: true,
    }),
  ],
);

const extremeVocalTrebleDone = [5, 6, 7].reduce((score, measureIndex) => {
  const ids = ['fall', 'echo', 'end'] as const;
  const syllable = ids[measureIndex - 5] ?? 'line';

  return withMeasureEvents(score, 'treble', measureIndex, [
    noteEvent(`extreme-vocal-m${measureIndex}-a`, 0, 'quarter', {
      step: 'D',
      octave: 5,
    }, {
      lyric: syllable,
      chordSymbol: measureIndex === 7 ? 'Bb6' : undefined,
    }),
    noteEvent(`extreme-vocal-m${measureIndex}-b`, 1, 'quarter', {
      step: 'C',
      octave: 5,
    }),
    noteEvent(`extreme-vocal-m${measureIndex}-c`, 2, 'quarter', {
      accidental: 'flat',
      step: 'B',
      octave: 4,
    }, {
      glissando: measureIndex === 6,
    }),
    noteEvent(`extreme-vocal-m${measureIndex}-d`, 3, 'quarter', {
      step: 'A',
      octave: 4,
    }, {
      dynamic: measureIndex === 7 ? 'pp' : undefined,
    }),
  ]);
}, extremeVocalTreble4);

const extremeVocalBassDone = Array.from({ length: 8 }, (_, index) => index)
  .reduce((score, measureIndex) => withMeasureEvents(score, 'bass', measureIndex, [
    chordEvent(`extreme-vocal-b${measureIndex}-low`, 0, 'half', [
      { accidental: 'flat', step: 'B', octave: 1 },
      { step: 'F', octave: 2 },
    ]),
    chordEvent(`extreme-vocal-b${measureIndex}-mid`, 2, 'half', [
      { accidental: measureIndex >= 4 ? 'flat' : undefined, step: 'E', octave: 2 },
      { accidental: 'flat', step: 'B', octave: 2 },
    ]),
  ]), extremeVocalTrebleDone);

export const extremeVocalPianoFixture: Score = extremeVocalBassDone;

const extremeClefOttavaBase = setMeasureSectionMarker(
  setMeasureKeySignature(
    createEmptyScore('grand', {
      id: 'fixture-extreme-clef-ottava-chromatic',
      title: 'Extreme Clef Ottava Chromatic Study',
      composer: 'SheetLab QA',
      measureCount: 8,
      tempo: 108,
    }),
    0,
    'C#',
  ),
  0,
  'Chrome',
);

const extremeClefOttavaMetaPatches: Array<[number, MeasureFixturePatch]> = [
  [2, { keySignature: 'F' as const, repeatJump: 'fine' as const }],
  [4, { keySignature: 'Gb' as const, sectionMarker: 'Mirror' }],
  [7, { repeatJump: 'dc-al-fine' as const }],
];

const extremeClefOttavaMeta = extremeClefOttavaMetaPatches.reduce(
  (score, [measureIndex, patch]) =>
    withMeasurePatch(score, 'treble', measureIndex, patch),
  extremeClefOttavaBase,
);

const extremeClefOttavaTreble0 = withMeasureEvents(
  extremeClefOttavaMeta,
  'treble',
  0,
  [
    noteEvent('extreme-clef-ottava-t0-e6', 0, 'quarter', { step: 'E', octave: 6 }, {
      articulations: ['marcato'],
      dynamic: 'ff',
    }),
    noteEvent('extreme-clef-ottava-t0-ds6', 1, 'quarter', {
      accidental: 'sharp',
      step: 'D',
      octave: 6,
    }),
    noteEvent('extreme-clef-ottava-t0-cs6', 2, 'quarter', {
      accidental: 'sharp',
      step: 'C',
      octave: 6,
    }),
    noteEvent('extreme-clef-ottava-t0-b5', 3, 'quarter', { step: 'B', octave: 5 }),
  ],
);

const extremeClefOttavaTrebleDone = [1, 2, 3, 4, 5, 6, 7].reduce(
  (score, measureIndex) => {
    const patchedScore =
      measureIndex === 4
        ? withMeasurePatch(score, 'treble', 4, {
            clefChanges: [
              {
                beat: 1,
                clef: 'bass',
                id: 'extreme-clef-treble-to-bass',
              },
            ],
          })
        : measureIndex === 5
          ? withMeasurePatch(score, 'treble', 5, {
              clefChanges: [
                {
                  beat: 0,
                  clef: 'treble',
                  id: 'extreme-clef-treble-return',
                },
              ],
            })
          : score;
    const events =
      measureIndex === 4
        ? [
            noteEvent('extreme-clef-ottava-t4-g4', 0, 'quarter', {
              step: 'G',
              octave: 4,
            }),
            noteEvent('extreme-clef-ottava-t4-e3', 1, 'quarter', {
              step: 'E',
              octave: 3,
            }, {
              chordSymbol: 'Gb/E',
            }),
            noteEvent('extreme-clef-ottava-t4-d3', 2, 'quarter', {
              step: 'D',
              octave: 3,
            }),
            noteEvent('extreme-clef-ottava-t4-c3', 3, 'quarter', {
              step: 'C',
              octave: 3,
            }),
          ]
        : [
            noteEvent(`extreme-clef-ottava-t${measureIndex}-a`, 0, 'quarter', {
              step: measureIndex % 2 === 0 ? 'A' : 'D',
              octave: measureIndex >= 5 ? 5 : 6,
            }),
            noteEvent(`extreme-clef-ottava-t${measureIndex}-b`, 1, 'quarter', {
              accidental: measureIndex % 2 === 0 ? 'flat' : 'sharp',
              step: measureIndex % 2 === 0 ? 'B' : 'F',
              octave: 5,
            }),
            noteEvent(`extreme-clef-ottava-t${measureIndex}-c`, 2, 'quarter', {
              step: 'E',
              octave: 5,
            }, {
              hairpin: measureIndex === 6 ? 'diminuendo' : undefined,
            }),
            chordEvent(`extreme-clef-ottava-t${measureIndex}-chord`, 3, 'quarter', [
              { step: 'C', octave: 5 },
              { step: 'E', octave: 5 },
              { step: 'G', octave: 5 },
            ], {
              fermata: measureIndex === 7,
            }),
          ];

    return withMeasureEvents(patchedScore, 'treble', measureIndex, events);
  },
  extremeClefOttavaTreble0,
);

const extremeClefOttavaBassDone = Array.from({ length: 8 }, (_, index) => index)
  .reduce((score, measureIndex) => {
    const patchedScore =
      measureIndex === 2
        ? withMeasurePatch(score, 'bass', 2, {
            clefChanges: [
              {
                beat: 0,
                clef: 'treble',
                id: 'extreme-clef-bass-to-treble',
              },
            ],
          })
        : measureIndex === 3
          ? withMeasurePatch(score, 'bass', 3, {
              clefChanges: [
                {
                  beat: 0,
                  clef: 'bass',
                  id: 'extreme-clef-bass-return',
                },
              ],
            })
          : score;
    const events =
      measureIndex === 2
        ? [
            noteEvent('extreme-clef-ottava-b2-c5', 0, 'quarter', {
              step: 'C',
              octave: 5,
            }, {
              dynamic: 'mf',
            }),
            noteEvent('extreme-clef-ottava-b2-d5', 1, 'quarter', {
              step: 'D',
              octave: 5,
            }),
            noteEvent('extreme-clef-ottava-b2-e5', 2, 'quarter', {
              step: 'E',
              octave: 5,
            }),
            noteEvent('extreme-clef-ottava-b2-f5', 3, 'quarter', {
              step: 'F',
              octave: 5,
            }),
          ]
        : measureIndex === 3
          ? [
              noteEvent('extreme-clef-ottava-b3-a1', 0, 'half', {
                step: 'A',
                octave: 1,
              }),
              noteEvent('extreme-clef-ottava-b3-c2', 2, 'half', {
                step: 'C',
                octave: 2,
              }),
            ]
          : [
              chordEvent(`extreme-clef-ottava-b${measureIndex}-open`, 0, 'half', [
                { step: 'C', octave: 2 },
                { step: 'G', octave: 2 },
              ]),
              noteEvent(`extreme-clef-ottava-b${measureIndex}-tail`, 2, 'half', {
                step: measureIndex % 2 === 0 ? 'E' : 'F',
                octave: 2,
                accidental: measureIndex % 2 === 0 ? undefined : 'sharp',
              }),
            ];

    return withMeasureEvents(patchedScore, 'bass', measureIndex, events);
  }, extremeClefOttavaTrebleDone);

const extremeClefOttavaMarks: NotationMark[] = [
  {
    end: {
      beat: 2,
      measureIndex: 1,
      staffId: 'treble',
      voiceIndex: 0,
    },
    id: 'extreme-clef-15ma-top',
    kind: 'ottava',
    ottava: '15ma',
    placement: 'above',
    scope: 'range',
    sourceEventId: 'extreme-clef-ottava-t0-e6',
    start: {
      beat: 0,
      measureIndex: 0,
      staffId: 'treble',
      voiceIndex: 0,
    },
    targetEventId: 'extreme-clef-ottava-t1-b',
  },
  {
    end: {
      beat: 2,
      measureIndex: 2,
      staffId: 'bass',
      voiceIndex: 0,
    },
    id: 'extreme-clef-8vb-bass-treble-clef',
    kind: 'ottava',
    ottava: '8vb',
    placement: 'below',
    scope: 'range',
    sourceEventId: 'extreme-clef-ottava-b2-c5',
    start: {
      beat: 0,
      measureIndex: 2,
      staffId: 'bass',
      voiceIndex: 0,
    },
    targetEventId: 'extreme-clef-ottava-b2-d5',
  },
  {
    end: {
      beat: 4,
      measureIndex: 3,
      staffId: 'bass',
      voiceIndex: 0,
    },
    id: 'extreme-clef-15mb-low-bass',
    kind: 'ottava',
    ottava: '15mb',
    placement: 'below',
    scope: 'range',
    sourceEventId: 'extreme-clef-ottava-b3-a1',
    start: {
      beat: 0,
      measureIndex: 3,
      staffId: 'bass',
      voiceIndex: 0,
    },
    targetEventId: 'extreme-clef-ottava-b3-c2',
  },
];

export const extremeClefOttavaChromaticFixture: Score = {
  ...extremeClefOttavaBassDone,
  marks: extremeClefOttavaMarks,
};

const readableSpacingBase = setMeasureSectionMarker(
  setMeasureKeySignature(
    createEmptyScore('grand', {
      id: 'fixture-readable-spacing-stress',
      title: 'Readable Spacing Stress',
      composer: 'SheetLab QA',
      measureCount: 4,
    }),
    0,
    'F#',
  ),
  0,
  'Spacing',
);

const readableSpacingChromaticPitches: Pitch[] = [
  { accidental: 'sharp', step: 'F', octave: 5 },
  { accidental: 'sharp', step: 'G', octave: 5 },
  { accidental: 'sharp', step: 'A', octave: 5 },
  { step: 'B', octave: 5 },
  { accidental: 'sharp', step: 'C', octave: 6 },
  { accidental: 'sharp', step: 'D', octave: 6 },
  { step: 'E', octave: 6 },
  { accidental: 'sharp', step: 'F', octave: 6 },
  { accidental: 'sharp', step: 'G', octave: 6 },
];

const readableSpacingTrebleDense = withMeasureEvents(
  readableSpacingBase,
  'treble',
  0,
  [0, 1, 2, 3].flatMap((beat) =>
    tupletNoteEvents({
      actualNotes: 9,
      beat,
      duration: 'thirtySecond',
      id: `readable-spacing-nonuplet-${beat + 1}`,
      normalNotes: 8,
      pitches: readableSpacingChromaticPitches.map((pitch, pitchIndex) => ({
        ...pitch,
        octave: pitch.octave - (beat % 2 === 0 ? 0 : 1),
        accidental:
          pitchIndex % 3 === 1 && beat % 2 === 1
            ? 'flat'
            : pitch.accidental,
      })),
    }),
  ),
);

const readableSpacingTrebleChords = withMeasureEvents(
  readableSpacingTrebleDense,
  'treble',
  1,
  [
    chordEvent('readable-spacing-second-chord-1', 0, 'eighth', [
      { step: 'E', octave: 4 },
      { accidental: 'sharp', step: 'F', octave: 4 },
    ], {
      articulations: ['staccato', 'accent'],
    }),
    chordEvent('readable-spacing-second-chord-2', 0.5, 'eighth', [
      { step: 'F', octave: 4 },
      { accidental: 'sharp', step: 'G', octave: 4 },
    ]),
    chordEvent('readable-spacing-second-chord-3', 1, 'eighth', [
      { step: 'G', octave: 4 },
      { accidental: 'sharp', step: 'A', octave: 4 },
    ]),
    chordEvent('readable-spacing-second-chord-4', 1.5, 'eighth', [
      { step: 'A', octave: 4 },
      { accidental: 'sharp', step: 'B', octave: 4 },
    ]),
    ...tupletNoteEvents({
      actualNotes: 7,
      beat: 2,
      duration: 'sixteenth',
      id: 'readable-spacing-septuplet-tail',
      normalNotes: 4,
      pitches: [
        { accidental: 'sharp', step: 'C', octave: 5 },
        { step: 'D', octave: 5 },
        { accidental: 'sharp', step: 'E', octave: 5 },
        { step: 'F', octave: 5 },
        { accidental: 'sharp', step: 'G', octave: 5 },
        { step: 'A', octave: 5 },
        { accidental: 'sharp', step: 'B', octave: 5 },
      ],
    }),
  ],
);

export const readableSpacingStressFixture: Score = [0, 1, 2, 3].reduce(
  (score, measureIndex) =>
    withMeasureEvents(score, 'bass', measureIndex, [
      chordEvent(`readable-spacing-bass-${measureIndex}-open`, 0, 'half', [
        { step: 'C', octave: 2 },
        { step: 'G', octave: 2 },
      ]),
      chordEvent(`readable-spacing-bass-${measureIndex}-close`, 2, 'half', [
        { accidental: measureIndex % 2 === 0 ? undefined : 'flat', step: 'E', octave: 2 },
        { step: 'B', octave: 2 },
      ]),
    ]),
  readableSpacingTrebleChords,
);

export const extremeScoreFixtures = [
  stressPianoHardeningFixture,
  extremeTupletRepeatEtudeFixture,
  extremeVocalPianoFixture,
  extremeClefOttavaChromaticFixture,
  readableSpacingStressFixture,
] satisfies readonly Score[];
