import type {
  ImportedMeasureLayout,
  Score,
} from './types';

function getMeasureLayoutMap(score: Score) {
  return new Map(
    (score.importedLayout?.measureLayouts ?? []).map((layout) => [
      layout.measureIndex,
      layout,
    ]),
  );
}

export function getImportedMeasureLayout(
  score: Score,
  measureIndex: number,
): ImportedMeasureLayout | null {
  return getMeasureLayoutMap(score).get(measureIndex) ?? null;
}

export function hasImportedSystemLayout(score: Score) {
  return Boolean(
    score.importedLayout?.measureLayouts.some(
      (layout) => layout.measureIndex > 0 &&
        (layout.systemBreakBefore || layout.pageBreakBefore),
    ),
  );
}

export function getImportedMeasureXmlWidth(
  score: Score,
  measureIndex: number,
) {
  const width = getImportedMeasureLayout(score, measureIndex)?.xmlWidth;

  return typeof width === 'number' && Number.isFinite(width) && width > 0
    ? width
    : null;
}

export function getImportedPageStartMeasureIndexes(score: Score) {
  if (!hasImportedSystemLayout(score)) {
    return [];
  }

  return [
    0,
    ...(score.importedLayout?.measureLayouts ?? [])
      .filter((layout) => layout.measureIndex > 0 && layout.pageBreakBefore)
      .map((layout) => layout.measureIndex),
  ].sort((first, second) => first - second);
}
