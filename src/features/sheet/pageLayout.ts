import type { PageSize, Score } from '../../domain/score/types';
import { getImportedPageStartMeasureIndexes } from '../../domain/score/importedLayout';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
  getScoreSvgHeight,
  getScoreSystemCount,
  getScoreSystemMeasureIndexes,
  getSystemIndex,
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
const IMPORTED_PAGE_SYSTEM_TOP_PADDING = 24;
const IMPORTED_PAGE_SYSTEM_BOTTOM_PADDING = 48;

export function getInitialScorePageIndexes(pageCount: number) {
  return pageCount <= 0 ? new Set<number>() : new Set([0]);
}

export function getNearbyScorePageIndexes(
  pageIndex: number,
  pageCount: number,
) {
  if (pageCount <= 0) {
    return new Set<number>();
  }

  const safePageIndex = Math.min(pageCount - 1, Math.max(0, pageIndex));
  const start = Math.max(0, safePageIndex - 1);
  const end = Math.min(pageCount - 1, safePageIndex + 1);
  const pageIndexes = new Set<number>();

  for (let index = start; index <= end; index += 1) {
    pageIndexes.add(index);
  }

  return pageIndexes;
}

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
  const topPadding = score.importedLayout
    ? IMPORTED_PAGE_SYSTEM_TOP_PADDING
    : PAGE_SYSTEM_TOP_PADDING;
  const bottomPadding = score.importedLayout
    ? IMPORTED_PAGE_SYSTEM_BOTTOM_PADDING
    : PAGE_SYSTEM_BOTTOM_PADDING;
  const top = Math.max(
    0,
    getScoreStaffTop(score, 0, firstMeasureIndex) - topPadding,
  );
  const bottom =
    getScoreStaffTop(score, Math.max(0, staffCount - 1), lastMeasureIndex) +
    STAFF_LINE_SPACING * 4 +
    bottomPadding;

  return {
    bottom,
    measureIndexes,
    top,
  };
}

function getImportedPageViewports(score: Score): ScorePageViewport[] | null {
  const pageStarts = getImportedPageStartMeasureIndexes(score);

  if (pageStarts.length <= 1) {
    return null;
  }

  const measureCount = getScoreMeasureCount(score);
  const pageHeight = PAGE_NOTATION_HEIGHT[score.pageSize];

  return pageStarts.map((pageStartMeasureIndex, pageIndex) => {
    const nextPageStartMeasureIndex =
      pageStarts[pageIndex + 1] ?? measureCount;
    const firstMeasureIndex = Math.min(
      measureCount - 1,
      Math.max(0, pageStartMeasureIndex),
    );
    const lastMeasureIndex = Math.min(
      measureCount - 1,
      Math.max(firstMeasureIndex, nextPageStartMeasureIndex - 1),
    );
    const firstSystem = getSystemBounds(
      score,
      getSystemIndex(firstMeasureIndex, score),
    );
    const lastSystem = getSystemBounds(
      score,
      getSystemIndex(lastMeasureIndex, score),
    );
    const pageTop = pageIndex === 0 ? 0 : firstSystem.top;
    const pageBottom = Math.max(pageTop + pageHeight, lastSystem.bottom);

    return {
      height: pageBottom - pageTop,
      index: pageIndex,
      measureIndexes: Array.from(
        { length: Math.max(0, lastMeasureIndex - firstMeasureIndex + 1) },
        (_, offset) => firstMeasureIndex + offset,
      ),
      y: pageTop,
    };
  });
}

export function getScorePageViewports(score: Score): ScorePageViewport[] {
  const importedPages = getImportedPageViewports(score);

  if (importedPages) {
    return importedPages;
  }

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
