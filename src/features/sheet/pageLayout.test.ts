import { describe, expect, it } from 'vitest';
import {
  composerSketchFixture,
  duChoTanTheFullFixture,
} from '../../domain/score/fixtures';
import {
  getScorePageForMeasureIndex,
  getScorePageViewports,
} from './pageLayout';

describe('score page layout', () => {
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
    expect(pages.length).toBeLessThanOrEqual(10);
    expect(getScorePageForMeasureIndex(pages, 85)?.index).toBe(
      pages.length - 1,
    );
  });
});
