import { describe, expect, it } from 'vitest';
import {
  composerSketchFixture,
  duChoTanTheFullFixture,
} from '../../domain/score/fixtures';
import { importScoreFromMusicXml } from '../../domain/score/externalScoreImport';
import {
  getMeasureWidth,
  getScoreSystemMeasureIndexes,
} from './layout';
import {
  getInitialScorePageIndexes,
  getNearbyScorePageIndexes,
  getScorePageForMeasureIndex,
  getScorePageViewports,
} from './pageLayout';

describe('score page layout', () => {
  it('chooses an immediate first page and bounded page neighbors', () => {
    expect([...getInitialScorePageIndexes(0)]).toEqual([]);
    expect([...getInitialScorePageIndexes(4)]).toEqual([0]);
    expect([...getNearbyScorePageIndexes(0, 4)]).toEqual([0, 1]);
    expect([...getNearbyScorePageIndexes(2, 4)]).toEqual([1, 2, 3]);
    expect([...getNearbyScorePageIndexes(99, 4)]).toEqual([2, 3]);
  });

  it('keeps short scores on one page', () => {
    const pages = getScorePageViewports(composerSketchFixture);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.y).toBe(0);
    expect(pages[0]?.measureIndexes).toEqual([0, 1, 2, 3]);
  });

  it('splits long scores into ordered page viewports without dropping measures', () => {
    const pages = getScorePageViewports(duChoTanTheFullFixture);
    const pageMeasureIndexes = pages.flatMap((page) => page.measureIndexes);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]?.y).toBe(0);
    expect(pageMeasureIndexes).toHaveLength(86);
    expect(pageMeasureIndexes).toEqual(
      Array.from({ length: 86 }, (_, index) => index),
    );
    expect(pages.length).toBeLessThanOrEqual(11);
    expect(getScorePageForMeasureIndex(pages, 85)?.index).toBe(
      pages.length - 1,
    );
  });

  it('honors imported MusicXML system breaks, page breaks, and measure widths', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1" width="300">
            <print><system-layout><top-system-distance>70</top-system-distance></system-layout></print>
            <attributes>
              <divisions>1</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="2" width="100">
            <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="3" width="200">
            <print new-system="yes"><system-layout><system-distance>100</system-distance></system-layout></print>
            <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="4" width="100">
            <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="5" width="500">
            <print new-page="yes"><system-layout><top-system-distance>70</top-system-distance></system-layout></print>
            <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
          <measure number="6" width="500">
            <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
        </part>
      </score-partwise>
    `);
    const score = result.score;
    const pages = getScorePageViewports(score);

    expect(score.importedLayout?.measureLayouts).toHaveLength(6);
    expect(getScoreSystemMeasureIndexes(score, 0)).toEqual([0, 1]);
    expect(getScoreSystemMeasureIndexes(score, 1)).toEqual([2, 3]);
    expect(getScoreSystemMeasureIndexes(score, 2)).toEqual([4, 5]);
    expect(pages.map((page) => page.measureIndexes)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
    expect(getMeasureWidth(0, score) / getMeasureWidth(1, score)).toBeCloseTo(3, 2);
  });
});
