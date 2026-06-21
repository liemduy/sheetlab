import { describe, expect, it } from 'vitest';
import type { Score } from '../../domain/score/types';
import { importScoreFromMusicXml } from '../../domain/score/externalScoreImport';
import {
  getMeasureWidth,
  getScoreSystemMeasureIndexes,
} from './layout';
import { getMeasureReadableMinWidthForLocalIndex } from './measureWidthPolicy';
import { auditScoreSpacing } from './spacingAudit';

function denseImportedSystemXml(measureCount: number) {
  const denseNotes = Array.from({ length: 16 }, (_, index) => `
    <note>
      <pitch>
        <step>${index % 2 === 0 ? 'F' : 'B'}</step>
        <alter>${index % 2 === 0 ? '1' : '-1'}</alter>
        <octave>5</octave>
      </pitch>
      <duration>1</duration>
      <type>16th</type>
      ${index % 4 === 0 ? '<lyric><text>wide lyric</text></lyric>' : ''}
    </note>
  `).join('');

  return `
    <score-partwise version="3.1">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1">
        ${Array.from({ length: measureCount }, (_, index) => `
          <measure number="${index + 1}" width="120">
            ${index === 0 ? `
              <attributes>
                <divisions>4</divisions>
                <time><beats>4</beats><beat-type>4</beat-type></time>
              </attributes>
            ` : ''}
            ${index === measureCount - 1 ? '<print new-system="yes" />' : ''}
            ${denseNotes}
          </measure>
        `).join('')}
      </part>
    </score-partwise>
  `;
}

function createImportedChromaticChordPressureScore(): Score {
  const chromaticChordEvents = Array.from({ length: 6 }, (_, index) => ({
    beat: index * 0.5,
    duration: 'sixteenth' as const,
    id: `chromatic-chord-${index}`,
    kind: 'chord' as const,
    pitches: [
      {
        accidental: index % 2 === 0 ? ('sharp' as const) : ('flat' as const),
        octave: 5,
        step: index % 2 === 0 ? ('F' as const) : ('B' as const),
      },
      {
        accidental: index % 2 === 0 ? ('flat' as const) : ('sharp' as const),
        octave: 5,
        step: index % 2 === 0 ? ('B' as const) : ('F' as const),
      },
    ],
  }));
  const measures = Array.from({ length: 4 }, (_, index) => ({
    id: `m-${index}`,
    index,
    voices: [
      {
        id: `v-${index}`,
        events:
          index === 0
            ? chromaticChordEvents
            : [
                {
                  beat: 0,
                  duration: 'whole' as const,
                  id: `rest-${index}`,
                  kind: 'rest' as const,
                },
              ],
      },
    ],
  }));

  return {
    composer: '',
    id: 'imported-chromatic-pressure',
    importedLayout: {
      measureLayouts: measures.map((measure) => ({
        measureIndex: measure.index,
        systemBreakBefore: measure.index === 2,
        xmlWidth: 120,
      })),
      source: 'musicxml',
    },
    pageSize: 'a4',
    parts: [
      {
        id: 'P1',
        name: 'Piano',
        staves: [
          {
            clef: 'treble',
            id: 'treble',
            measures,
          },
        ],
      },
    ],
    tempo: 92,
    timeSignature: {
      beatUnit: 4,
      beats: 4,
    },
    title: 'Imported chromatic pressure',
    type: 'treble',
  };
}

function createOverwideManualMeasureScore(): Score {
  const denseEvents = Array.from({ length: 40 }, (_, index) => ({
    beat: index * 0.25,
    duration: 'sixteenth' as const,
    id: `manual-dense-${index}`,
    kind: 'note' as const,
    pitch: {
      accidental: index % 2 === 0 ? ('sharp' as const) : ('flat' as const),
      octave: 5,
      step: index % 2 === 0 ? ('F' as const) : ('B' as const),
    },
  }));

  return {
    composer: '',
    id: 'manual-overwide-measure',
    pageSize: 'a4',
    parts: [
      {
        id: 'P1',
        name: 'Piano',
        staves: [
          {
            clef: 'treble',
            id: 'treble',
            measures: [
              {
                id: 'm-0',
                index: 0,
                voices: [
                  {
                    id: 'v-0',
                    events: denseEvents,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    tempo: 100,
    timeSignature: {
      beatUnit: 4,
      beats: 4,
    },
    title: 'Manual overwide measure',
    type: 'treble',
  };
}

describe('score spacing audit', () => {
  it('treats imported system breaks as preferred and reflows before a dense system overfills', () => {
    const { score } = importScoreFromMusicXml(denseImportedSystemXml(4));
    const firstSystemMeasureIndexes = getScoreSystemMeasureIndexes(score, 0);

    expect(firstSystemMeasureIndexes.length).toBeLessThan(3);
    expect(firstSystemMeasureIndexes).not.toEqual([0, 1, 2]);
    expect(auditScoreSpacing(score)).toEqual([]);
  });

  it('uses imported measure widths as proportions only after enforcing readable minimums', () => {
    const { score } = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1" width="1000">
            <attributes>
              <divisions>1</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="2" width="20">
            <note>
              <pitch><step>D</step><octave>4</octave></pitch>
              <duration>1</duration>
              <type>quarter</type>
              <lyric><text>minimum space</text></lyric>
            </note>
          </measure>
          <measure number="3" width="20">
            <print new-system="yes" />
            <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
        </part>
      </score-partwise>
    `);
    const secondMeasureMinWidth = getMeasureReadableMinWidthForLocalIndex(
      score,
      1,
      1,
    );

    expect(getScoreSystemMeasureIndexes(score, 0)).toEqual([0, 1]);
    expect(getMeasureWidth(1, score)).toBeGreaterThanOrEqual(
      secondMeasureMinWidth - 0.001,
    );
    expect(
      getMeasureWidth(0, score) + getMeasureWidth(1, score),
    ).toBeCloseTo(848, 2);
  });

  it('forces imported chromatic chord pressure into its own readable system', () => {
    const score = createImportedChromaticChordPressureScore();
    const firstMeasureMinWidth = getMeasureReadableMinWidthForLocalIndex(
      score,
      0,
      0,
    );

    expect(firstMeasureMinWidth).toBeGreaterThanOrEqual(820);
    expect(getScoreSystemMeasureIndexes(score, 0)).toEqual([0]);
    expect(auditScoreSpacing(score)).toEqual([]);
  });

  it('reports a manual measure that is still too dense after system fitting', () => {
    const score = createOverwideManualMeasureScore();
    const issues = auditScoreSpacing(score);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'measure-under-readable-minimum',
          measureIndex: 0,
          systemIndex: 0,
        }),
      ]),
    );
    expect(
      issues.find((issue) => issue.kind === 'measure-under-readable-minimum')
      ?.overflow,
    ).toBeGreaterThan(0);
  });

  it('does not flag an imported single-measure system after giving it the full line', () => {
    const score = {
      ...createOverwideManualMeasureScore(),
      importedLayout: {
        measureLayouts: [
          {
            measureIndex: 0,
            systemBreakBefore: true,
            xmlWidth: 120,
          },
          {
            measureIndex: 1,
            systemBreakBefore: true,
            xmlWidth: 120,
          },
        ],
        source: 'musicxml' as const,
      },
    };

    expect(getScoreSystemMeasureIndexes(score, 0)).toEqual([0]);
    expect(auditScoreSpacing(score)).toEqual([]);
  });
});
