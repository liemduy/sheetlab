import type { Score, ScoreType } from '../../domain/score/types';
import {
  FIRST_MEASURE_LEFT_PADDING,
  FIRST_STAFF_Y,
  GRAND_SYSTEM_PADDING,
  MEASURE_COMPLEXITY_WIDTH_SCALE,
  MEASURE_LEFT_PADDING,
  MEASURE_RIGHT_PADDING,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  MIN_FIRST_MEASURE_READABLE_WIDTH,
  MIN_MEASURE_READABLE_WIDTH,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  STAFF_RIGHT,
  SVG_WIDTH,
  SYSTEM_WIDTH,
  TREBLE_SYSTEM_GAP,
} from './layoutConstants';
import {
  getMeasureDistributionWeight,
  getMeasureSlotWeight,
} from './measureDensity';
import { computeSystemStaffGap } from './staffSpacing';
import {
  computeScoreSystems,
  getScoreMeasureCount,
  getStaticSystemCount,
  type ScoreSystemLayout,
} from './systemLayout';

export {
  FIRST_MEASURE_LEFT_PADDING,
  FIRST_STAFF_Y,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  STAFF_RIGHT,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
} from './layoutConstants';
export { getMeasureSlotWeight } from './measureDensity';

type ScoreLayoutCache = {
  measureSystemIndexes: number[];
  maxStaffGap: number;
  systems: ScoreSystemLayout[];
  systemGaps: number[];
  systemTops: number[];
};

const scoreLayoutCache = new WeakMap<Score, ScoreLayoutCache>();

export function getScoreSystemCount(score: Score | ScoreType) {
  if (typeof score === 'string') {
    return getStaticSystemCount(score);
  }

  return getScoreLayoutCache(score).systems.length;
}

function getScoreLayoutCache(score: Score) {
  const cached = scoreLayoutCache.get(score);

  if (cached) {
    return cached;
  }

  const systems = computeScoreSystems(score);
  const systemGaps = systems.map((system, systemIndex) =>
    score.type === 'grand'
      ? computeSystemStaffGap(score, systemIndex, system.measureIndexes)
      : STAFF_GAP,
  );
  const systemTops: number[] = [];
  const measureSystemIndexes = Array.from(
    { length: getScoreMeasureCount(score) },
    () => 0,
  );
  let y = FIRST_STAFF_Y;

  systems.forEach((system, systemIndex) => {
    systemTops[systemIndex] = y;
    system.measureIndexes.forEach((measureIndex) => {
      measureSystemIndexes[measureIndex] = systemIndex;
    });
    y += score.type === 'grand'
      ? systemGaps[systemIndex] + GRAND_SYSTEM_PADDING
      : TREBLE_SYSTEM_GAP;
  });

  const nextCache = {
    measureSystemIndexes,
    maxStaffGap: Math.max(STAFF_GAP, ...systemGaps),
    systems,
    systemGaps,
    systemTops,
  };

  scoreLayoutCache.set(score, nextCache);
  return nextCache;
}

export function getScoreStaffGap(
  score: Score | ScoreType,
  measureIndex?: number,
): number {
  if (score === 'treble' || score === 'grand') {
    return STAFF_GAP;
  }

  if (score.type !== 'grand') {
    return STAFF_GAP;
  }

  const cache = getScoreLayoutCache(score);

  return measureIndex === undefined
    ? cache.maxStaffGap
    : cache.systemGaps[getSystemIndex(measureIndex, score)] ?? STAFF_GAP;
}

export function getSystemIndex(measureIndex: number, score?: Score | ScoreType) {
  if (score && typeof score !== 'string') {
    return (
      getScoreLayoutCache(score).measureSystemIndexes[Math.max(0, measureIndex)] ??
      Math.floor(Math.max(0, measureIndex) / MEASURES_PER_SYSTEM)
    );
  }

  return Math.floor(Math.max(0, measureIndex) / MEASURES_PER_SYSTEM);
}

export function getLocalMeasureIndex(measureIndex: number, score?: Score | ScoreType) {
  if (score && typeof score !== 'string') {
    const system = getScoreLayoutCache(score).systems[getSystemIndex(measureIndex, score)];
    const localMeasureIndex = system?.measureIndexes.indexOf(measureIndex) ?? -1;

    return localMeasureIndex >= 0
      ? localMeasureIndex
      : Math.max(0, measureIndex) % MEASURES_PER_SYSTEM;
  }

  return Math.max(0, measureIndex) % MEASURES_PER_SYSTEM;
}

export function getScoreSystemGap(
  score: Score | ScoreType,
  measureIndex?: number,
) {
  const scoreType = typeof score === 'string' ? score : score.type;

  return scoreType === 'grand'
    ? getScoreStaffGap(score, measureIndex) + GRAND_SYSTEM_PADDING
    : TREBLE_SYSTEM_GAP;
}

export function getScoreSystemTop(score: Score | ScoreType, measureIndex = 0) {
  const targetSystemIndex = getSystemIndex(measureIndex, score);

  if (typeof score === 'string') {
    return FIRST_STAFF_Y + targetSystemIndex * getScoreSystemGap(score);
  }

  return getScoreLayoutCache(score).systemTops[targetSystemIndex] ?? FIRST_STAFF_Y;
}

export function getScoreStaffTop(
  score: Score | ScoreType,
  staffIndex: number,
  measureIndex = 0,
) {
  return (
    getScoreSystemTop(score, measureIndex) +
    staffIndex * getScoreStaffGap(score, measureIndex)
  );
}

export function getSystemFirstMeasureIndex(
  measureIndex: number,
  score?: Score | ScoreType,
) {
  if (score && typeof score !== 'string') {
    return (
      getScoreLayoutCache(score).systems[getSystemIndex(measureIndex, score)]
        ?.firstMeasureIndex ?? 0
    );
  }

  return getSystemIndex(measureIndex) * MEASURES_PER_SYSTEM;
}

export function getMeasureCountForSystem(
  measureCount: number,
  systemIndex: number,
  score?: Score | ScoreType,
) {
  if (score && typeof score !== 'string') {
    return getScoreLayoutCache(score).systems[systemIndex]?.measureIndexes.length ?? 0;
  }

  const remainingMeasures = measureCount - systemIndex * MEASURES_PER_SYSTEM;

  return Math.max(0, Math.min(MEASURES_PER_SYSTEM, remainingMeasures));
}

export function getScoreSystemMeasureIndexes(
  score: Score | ScoreType,
  systemIndex: number,
) {
  if (typeof score === 'string') {
    const measureCount = getScoreMeasureCount(score);
    const firstMeasureIndex = systemIndex * MEASURES_PER_SYSTEM;
    const measureCountForSystem = getMeasureCountForSystem(
      measureCount,
      systemIndex,
    );

    return Array.from(
      { length: measureCountForSystem },
      (_, offset) => firstMeasureIndex + offset,
    );
  }

  return getScoreLayoutCache(score).systems[systemIndex]?.measureIndexes ?? [];
}

export function isScoreSystemEndMeasure(score: Score, measureIndex: number) {
  const systemMeasureIndexes = getScoreSystemMeasureIndexes(
    score,
    getSystemIndex(measureIndex, score),
  );

  return systemMeasureIndexes[systemMeasureIndexes.length - 1] === measureIndex;
}

export function getStaffTop(
  staffIndex: number,
  staffGap = STAFF_GAP,
  measureIndex = 0,
  systemGap = staffGap + GRAND_SYSTEM_PADDING,
) {
  return FIRST_STAFF_Y + getSystemIndex(measureIndex) * systemGap + staffIndex * staffGap;
}

function getMeasureReadableMinWidth(measureIndex: number, score?: Score) {
  return getLocalMeasureIndex(measureIndex, score) === 0
    ? MIN_FIRST_MEASURE_READABLE_WIDTH
    : MIN_MEASURE_READABLE_WIDTH;
}

function getSystemMeasureIndexes(score: Score, systemIndex: number) {
  return getScoreLayoutCache(score).systems[systemIndex]?.measureIndexes ?? [];
}

function getSystemMeasureWidths(score: Score, systemIndex: number) {
  const systemMeasureIndexes = getSystemMeasureIndexes(score, systemIndex);

  if (systemMeasureIndexes.length === 0) {
    return [];
  }

  const minWidths = systemMeasureIndexes.map((measureIndex) =>
    getMeasureReadableMinWidth(measureIndex, score),
  );
  const weights = systemMeasureIndexes.map((index) =>
    getMeasureDistributionWeight(score, index),
  );
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const equalWidth = SYSTEM_WIDTH / systemMeasureIndexes.length;

  if (maxWeight - minWeight < 0.0001) {
    return systemMeasureIndexes.map(() => equalWidth);
  }

  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const averageWeight = totalWeight / systemMeasureIndexes.length;
  const rawWidths = weights.map(
    (weight) =>
      equalWidth + (weight - averageWeight) * MEASURE_COMPLEXITY_WIDTH_SCALE,
  );
  let widths = rawWidths.map((width, index) =>
    Math.max(minWidths[index] ?? MIN_MEASURE_READABLE_WIDTH, width),
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const widthTotal = widths.reduce((total, width) => total + width, 0);
    const overflow = widthTotal - SYSTEM_WIDTH;

    if (Math.abs(overflow) < 0.001) {
      break;
    }

    if (overflow < 0) {
      const addition = Math.abs(overflow) / widths.length;

      widths = widths.map((width) => width + addition);
      continue;
    }

    const reducibleWidths = widths.map((width, index) =>
      Math.max(0, width - (minWidths[index] ?? MIN_MEASURE_READABLE_WIDTH)),
    );
    const totalReducibleWidth = reducibleWidths.reduce(
      (total, width) => total + width,
      0,
    );

    if (totalReducibleWidth <= 0) {
      return minWidths.map((width) => (SYSTEM_WIDTH * width) / widthTotal);
    }

    widths = widths.map((width, index) => {
      const minimumWidth = minWidths[index] ?? MIN_MEASURE_READABLE_WIDTH;
      const reduction =
        overflow * ((reducibleWidths[index] ?? 0) / totalReducibleWidth);

      return Math.max(minimumWidth, width - reduction);
    });
  }

  return widths;
}

export function getMeasureWidth(measureIndex: number, score?: Score) {
  if (!score) {
    return MEASURE_WIDTH;
  }

  const systemIndex = getSystemIndex(measureIndex, score);
  const systemMeasureIndexes = getSystemMeasureIndexes(
    score,
    systemIndex,
  );

  if (systemMeasureIndexes.length === 0) {
    return MEASURE_WIDTH;
  }

  const measureOffset = systemMeasureIndexes.indexOf(measureIndex);

  return measureOffset >= 0
    ? getSystemMeasureWidths(score, systemIndex)[measureOffset] ?? MEASURE_WIDTH
    : MEASURE_WIDTH;
}

export function getMeasureX(measureIndex: number, score?: Score) {
  if (!score) {
    return STAFF_LEFT + getLocalMeasureIndex(measureIndex) * MEASURE_WIDTH;
  }

  const firstMeasureIndex = getSystemFirstMeasureIndex(measureIndex, score);
  let x = STAFF_LEFT;

  for (let index = firstMeasureIndex; index < measureIndex; index += 1) {
    x += getMeasureWidth(index, score);
  }

  return x;
}

export function getMeasureRight(measureIndex: number, score?: Score) {
  return getMeasureX(measureIndex, score) + getMeasureWidth(measureIndex, score);
}

function getMeasureLeftPadding(measureIndex: number, score?: Score) {
  const desiredPadding =
    getLocalMeasureIndex(measureIndex, score) === 0
      ? FIRST_MEASURE_LEFT_PADDING
      : MEASURE_LEFT_PADDING;

  if (!score) {
    return desiredPadding;
  }

  const measureWidth = getMeasureWidth(measureIndex, score);
  const maxPadding = Math.max(
    MEASURE_LEFT_PADDING,
    measureWidth - MEASURE_RIGHT_PADDING - 24,
  );

  return Math.min(desiredPadding, maxPadding);
}

export function getMeasureContentLeft(measureIndex: number, score?: Score) {
  return getMeasureX(measureIndex, score) + getMeasureLeftPadding(measureIndex, score);
}

export function getMeasureContentRight(measureIndex: number, score?: Score) {
  return getMeasureRight(measureIndex, score) - MEASURE_RIGHT_PADDING;
}

export function getMeasureContentWidth(measureIndex: number, score?: Score) {
  return getMeasureContentRight(measureIndex, score) - getMeasureContentLeft(measureIndex, score);
}

export function getStaffRight(
  measureCount: number,
  measureIndex = 0,
  score?: Score,
) {
  if (!score) {
    return (
      STAFF_LEFT +
      getMeasureCountForSystem(
        measureCount,
        getSystemIndex(measureIndex),
      ) *
        MEASURE_WIDTH
    );
  }

  const systemIndex = getSystemIndex(measureIndex, score);
  const systemMeasureIndexes = getScoreSystemMeasureIndexes(score, systemIndex);
  const measureCountForSystem = systemMeasureIndexes.length;

  if (measureCountForSystem <= 0) {
    return STAFF_LEFT;
  }

  const lastMeasureIndex = systemMeasureIndexes[measureCountForSystem - 1] ?? measureIndex;

  return getMeasureRight(lastMeasureIndex, score);
}

export function getStaticMeasureX(measureIndex: number) {
  return STAFF_LEFT + getLocalMeasureIndex(measureIndex) * MEASURE_WIDTH;
}

export function getScoreSvgHeight(score: Score | ScoreType) {
  const scoreType = typeof score === 'string' ? score : score.type;
  const systemCount = getScoreSystemCount(score);
  const lastSystemMeasureIndexes = getScoreSystemMeasureIndexes(
    score,
    systemCount - 1,
  );
  const lastMeasureIndex =
    lastSystemMeasureIndexes[lastSystemMeasureIndexes.length - 1] ?? 0;

  if (scoreType === 'grand') {
    const lastStaffBottom =
      getScoreStaffTop(score, 1, lastMeasureIndex) +
      STAFF_LINE_SPACING * 4;

    return Math.max(420, lastStaffBottom + 128);
  }

  return Math.max(
    280,
    getScoreStaffTop(score, 0, lastMeasureIndex) +
      STAFF_LINE_SPACING * 4 +
      110,
  );
}
