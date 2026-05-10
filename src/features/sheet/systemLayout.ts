import type { Score, ScoreType } from '../../domain/score/types';
import {
  MAX_SYSTEM_NOTEHEADS,
  MEASURES_PER_SYSTEM,
} from './layoutConstants';
import { countMeasureLaneDensities } from './measureDensity';

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
  const systems: ScoreSystemLayout[] = [];
  let currentSystemMeasureIndexes: number[] = [];
  let currentSystemLaneDensities = new Map<string, number>();

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const measureLaneDensities = countMeasureLaneDensities(score, measureIndex);
    const shouldBreakForCount =
      currentSystemMeasureIndexes.length >= MEASURES_PER_SYSTEM;
    const shouldBreakForDensity =
      currentSystemMeasureIndexes.length > 0 &&
      [...measureLaneDensities].some(
        ([laneKey, measureDensity]) =>
          (currentSystemLaneDensities.get(laneKey) ?? 0) + measureDensity >
          MAX_SYSTEM_NOTEHEADS,
      );

    if (shouldBreakForCount || shouldBreakForDensity) {
      systems.push({
        firstMeasureIndex: currentSystemMeasureIndexes[0] ?? measureIndex,
        measureIndexes: currentSystemMeasureIndexes,
      });
      currentSystemMeasureIndexes = [];
      currentSystemLaneDensities = new Map<string, number>();
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
    systems.push({
      firstMeasureIndex: currentSystemMeasureIndexes[0] ?? 0,
      measureIndexes: currentSystemMeasureIndexes,
    });
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
