import type { Score, ScoreType } from '../../domain/score/types';
import {
  getImportedMeasureLayout,
  hasImportedSystemLayout,
} from '../../domain/score/importedLayout';
import {
  MAX_SYSTEM_NOTEHEADS,
  MEASURES_PER_SYSTEM,
  SYSTEM_READABILITY_BREATHING_ROOM,
  SYSTEM_WIDTH,
} from './layoutConstants';
import { countMeasureLaneDensities } from './measureDensity';
import { getMeasureReadableMinWidthForLocalIndex } from './measureWidthPolicy';

export const IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM = 32;

export interface ScoreSystemLayout {
  firstMeasureIndex: number;
  measureIndexes: number[];
}

export function getScoreMeasureCount(score: Score | ScoreType) {
  if (typeof score === 'string') {
    return MEASURES_PER_SYSTEM;
  }

  return Math.max(
    MEASURES_PER_SYSTEM,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

export function getStaticSystemCount(score: Score | ScoreType) {
  return Math.max(1, Math.ceil(getScoreMeasureCount(score) / MEASURES_PER_SYSTEM));
}

export function computeScoreSystems(score: Score): ScoreSystemLayout[] {
  const measureCount = getScoreMeasureCount(score);
  const usesImportedBreaks = hasImportedSystemLayout(score);

  const systems: ScoreSystemLayout[] = [];
  let currentSystemMeasureIndexes: number[] = [];
  let currentSystemLaneDensities = new Map<string, number>();
  const readableWidthLimit = usesImportedBreaks
    ? SYSTEM_WIDTH - IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM
    : SYSTEM_WIDTH - SYSTEM_READABILITY_BREATHING_ROOM;

  function getProjectedReadableWidth(measureIndexes: number[]) {
    return measureIndexes.reduce(
      (total, measureIndex, localMeasureIndex) =>
        total +
        getMeasureReadableMinWidthForLocalIndex(
          score,
          measureIndex,
          localMeasureIndex,
        ),
      0,
    );
  }

  function flushCurrentSystem(fallbackMeasureIndex: number) {
    if (currentSystemMeasureIndexes.length === 0) {
      return;
    }

    systems.push({
      firstMeasureIndex: currentSystemMeasureIndexes[0] ?? fallbackMeasureIndex,
      measureIndexes: currentSystemMeasureIndexes,
    });
    currentSystemMeasureIndexes = [];
    currentSystemLaneDensities = new Map<string, number>();
  }

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const importedLayout = usesImportedBreaks
      ? getImportedMeasureLayout(score, measureIndex)
      : null;
    const shouldHonorImportedBreak =
      measureIndex > 0 &&
      currentSystemMeasureIndexes.length > 0 &&
      Boolean(importedLayout?.systemBreakBefore || importedLayout?.pageBreakBefore);

    if (shouldHonorImportedBreak) {
      flushCurrentSystem(measureIndex);
    }

    const measureLaneDensities = countMeasureLaneDensities(score, measureIndex);
    const shouldBreakForCount =
      !usesImportedBreaks &&
      currentSystemMeasureIndexes.length >= MEASURES_PER_SYSTEM;
    const shouldBreakForReadableWidth =
      currentSystemMeasureIndexes.length > 0 &&
      getProjectedReadableWidth([...currentSystemMeasureIndexes, measureIndex]) >
        readableWidthLimit;
    const shouldBreakForDensity =
      !usesImportedBreaks &&
      currentSystemMeasureIndexes.length > 0 &&
      [...measureLaneDensities].some(
        ([laneKey, measureDensity]) =>
          (currentSystemLaneDensities.get(laneKey) ?? 0) + measureDensity >
          MAX_SYSTEM_NOTEHEADS,
      );

    if (shouldBreakForCount || shouldBreakForReadableWidth || shouldBreakForDensity) {
      flushCurrentSystem(measureIndex);
    }

    currentSystemMeasureIndexes.push(measureIndex);
    measureLaneDensities.forEach((measureDensity, laneKey) => {
      currentSystemLaneDensities.set(
        laneKey,
        (currentSystemLaneDensities.get(laneKey) ?? 0) + measureDensity,
      );
    });
  }

  if (currentSystemMeasureIndexes.length > 0) {
    flushCurrentSystem(0);
  }

  return systems.length > 0
    ? systems
    : [
        {
          firstMeasureIndex: 0,
          measureIndexes: Array.from(
            { length: Math.min(MEASURES_PER_SYSTEM, measureCount) },
            (_, index) => index,
          ),
        },
      ];
}
