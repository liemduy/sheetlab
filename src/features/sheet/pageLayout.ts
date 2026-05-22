import type { PageSize, Score } from '../../domain/score/types';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
  getScoreSvgHeight,
  getScoreSystemCount,
  getScoreSystemMeasureIndexes,
} from './layout';

export interface ScorePageViewport {
  height: number;
  index: number;
  measureIndexes: number[];
  y: number;
}

const PAGE_NOTATION_HEIGHT = {
  a4: 1120,
  letter: 1040,
} satisfies Record<PageSize, number>;
const MIN_PAGINATED_MEASURES = 32;
const PAGE_SYSTEM_TOP_PADDING = 48;
const PAGE_SYSTEM_BOTTOM_PADDING = 112;

function getScoreMeasureCount(score: Score) {
  return Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function getUnpaginatedViewport(score: Score): ScorePageViewport {
  return {
    height: Math.max(PAGE_NOTATION_HEIGHT[score.pageSize], getScoreSvgHeight(score)),
    index: 0,
    measureIndexes: Array.from(
      { length: getScoreMeasureCount(score) },
      (_, index) => index,
    ),
    y: 0,
  };
}

function getSystemBounds(score: Score, systemIndex: number) {
  const measureIndexes = getScoreSystemMeasureIndexes(score, systemIndex);
  const firstMeasureIndex = measureIndexes[0] ?? 0;
  const lastMeasureIndex = measureIndexes[measureIndexes.length - 1] ?? firstMeasureIndex;
  const staffCount = score.parts[0]?.staves.length ?? 1;
  const top = Math.max(
    0,
    getScoreStaffTop(score, 0, firstMeasureIndex) - PAGE_SYSTEM_TOP_PADDING,
  );
  const bottom =
    getScoreStaffTop(score, Math.max(0, staffCount - 1), lastMeasureIndex) +
    STAFF_LINE_SPACING * 4 +
    PAGE_SYSTEM_BOTTOM_PADDING;

  return {
    bottom,
    measureIndexes,
    top,
  };
}

export function getScorePageViewports(score: Score): ScorePageViewport[] {
  if (getScoreMeasureCount(score) <= MIN_PAGINATED_MEASURES) {
    return [getUnpaginatedViewport(score)];
  }

  const systemCount = getScoreSystemCount(score);
  const pageHeight = PAGE_NOTATION_HEIGHT[score.pageSize];
  const pages: ScorePageViewport[] = [];
  let pageMeasureIndexes: number[] = [];
  let pageTop = 0;
  let pageBottom = pageHeight;

  for (let systemIndex = 0; systemIndex < systemCount; systemIndex += 1) {
    const system = getSystemBounds(score, systemIndex);
    const shouldStartNextPage =
      pageMeasureIndexes.length > 0 && system.bottom > pageBottom;

    if (shouldStartNextPage) {
      pages.push({
        height: pageBottom - pageTop,
        index: pages.length,
        measureIndexes: pageMeasureIndexes,
        y: pageTop,
      });
      pageMeasureIndexes = [];
      pageTop = system.top;
      pageBottom = pageTop + pageHeight;
    }

    pageMeasureIndexes.push(...system.measureIndexes);
    pageBottom = Math.max(pageBottom, system.bottom);
  }

  if (pageMeasureIndexes.length > 0) {
    pages.push({
      height: Math.max(pageHeight, pageBottom - pageTop),
      index: pages.length,
      measureIndexes: pageMeasureIndexes,
      y: pageTop,
    });
  }

  return pages.length > 0
    ? pages
    : [getUnpaginatedViewport(score)];
}

export function getScorePageForMeasureIndex(
  pages: readonly ScorePageViewport[],
  measureIndex: number,
) {
  return pages.find((page) => page.measureIndexes.includes(measureIndex)) ?? null;
}
