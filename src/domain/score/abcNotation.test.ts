import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import { setMeasureKeySignature } from './editing';
import { exportScoreToAbc, importScoreFromAbc } from './abcNotation';
import { duChoTanTheExcerptFixture } from './fixtures';

describe('ABC notation conversion', () => {
  it('exports a grand staff score with headers, voices, notes, rests, and chords', () => {
    const score = setMeasureKeySignature(
      {
        ...createEmptyScore('grand', {
          composer: 'Composer',
          measureCount: 1,
          tempo: 96,
          title: 'ABC Export',
        }),
        parts: [
          {
            ...createEmptyScore('grand', { measureCount: 1 }).parts[0],
            staves: [
              {
                clef: 'treble',
                id: 'treble',
                measures: [
                  {
                    id: 'measure-treble-1',
                    index: 0,
                    voices: [
                      {
                        id: 'voice-treble-1-main',
                        events: [
                          {
                            articulations: ['accent', 'staccato'],
                            beat: 0,
                            chordSymbol: 'D',
                            duration: 'quarter',
                            id: 'n1',
                            kind: 'note',
                            lyric: 'Du',
                            pitch: {
                              octave: 4,
                              step: 'C',
                            },
                          },
                          {
                            beat: 1,
                            duration: 'quarter',
                            id: 'c1',
                            kind: 'chord',
                            pitches: [
                              { octave: 4, step: 'E' },
                              { octave: 4, step: 'G' },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                clef: 'bass',
                id: 'bass',
                measures: [
                  {
                    id: 'measure-bass-1',
                    index: 0,
                    voices: [
                      {
                        id: 'voice-bass-1-main',
                        events: [
                          {
                            beat: 0,
                            duration: 'half',
                            id: 'r1',
                            kind: 'rest',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      0,
      'D',
    );

    const abc = exportScoreToAbc(score);

    expect(abc).toContain('T:ABC Export');
    expect(abc).toContain('C:Composer');
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('L:1/32');
    expect(abc).toContain('Q:1/4=96');
    expect(abc).toContain('K:D');
    expect(abc).toContain('V:T clef=treble');
    expect(abc).toContain('[V:T] !accent!!staccato!"D"C8 [EG]8 |');
    expect(abc).toContain('w: Du * |');
    expect(abc).toContain('[V:B] z16 |');
  });

  it('imports basic ABC notation into the score model', () => {
    const { score, warnings } = importScoreFromAbc(`
X:1
T:Imported Tune
C:ABC Composer
M:3/4
L:1/32
Q:1/4=112
K:D
\"D\"C8 D8 z4 | [EGB]8 |
`);

    const trebleMeasures = score.parts[0]?.staves[0]?.measures ?? [];

    expect(warnings).toEqual([]);
    expect(score.title).toBe('Imported Tune');
    expect(score.composer).toBe('ABC Composer');
    expect(score.tempo).toBe(112);
    expect(score.timeSignature).toEqual({ beats: 3, beatUnit: 4 });
    expect(score.type).toBe('treble');
    expect(trebleMeasures[0]?.keySignature).toBe('D');
    expect(trebleMeasures[0]?.voices[0]?.events).toHaveLength(3);
    expect(trebleMeasures[0]?.voices[0]?.events[0]).toMatchObject({
      chordSymbol: 'D',
    });
    expect(trebleMeasures[1]?.voices[0]?.events[0]).toMatchObject({
      duration: 'quarter',
      kind: 'chord',
    });
  });

  it('imports supported ABC articulation decorations onto the next pitched event', () => {
    const { score, warnings } = importScoreFromAbc(`
X:1
T:Decorated
M:4/4
L:1/32
K:C
!marcato!!tenuto!C8 !accent!z8 |
`);

    const events = score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events ?? [];

    expect(warnings).toEqual([]);
    expect(events[0]).toMatchObject({
      articulations: ['marcato', 'tenuto'],
      kind: 'note',
    });
    expect(events[1]).not.toMatchObject({
      articulations: expect.any(Array),
    });
  });

  it('imports ABC voice headers as grand staff piano when a bass voice exists', () => {
    const { score } = importScoreFromAbc(`
X:1
T:Piano ABC
M:4/4
L:1/32
V:T clef=treble
V:B clef=bass
K:C
[V:T] c8 |
[V:B] C,8 |
`);

    const staves = score.parts[0]?.staves ?? [];

    expect(score.type).toBe('grand');
    expect(staves.find((staff) => staff.id === 'treble')?.measures[0]?.voices[0]?.events[0])
      .toMatchObject({
        kind: 'note',
        pitch: {
          octave: 5,
          step: 'C',
        },
      });
    expect(staves.find((staff) => staff.id === 'bass')?.measures[0]?.voices[0]?.events[0])
      .toMatchObject({
        kind: 'note',
        pitch: {
          octave: 3,
          step: 'C',
        },
      });
  });

  it('exports the real-world excerpt fixture with chord symbols and lyrics', () => {
    const abc = exportScoreToAbc(duChoTanTheExcerptFixture);

    expect(abc).toContain('M:2/4');
    expect(abc).toContain('K:D');
    expect(abc).toContain('"D"F8 "E7/D"A8');
    expect(abc).toContain('w: du cho |');
  });
});
