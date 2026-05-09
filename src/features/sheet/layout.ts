import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Clef,
  Pitch,
  Score,
  ScoreEvent,
  ScoreType,
} from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getMeasureBeats } from '../../domain/score/timeSignatures';

export const STAFF_LEFT = 36;
export const STAFF_RIGHT = 884;
export const STAFF_LINE_SPACING = 11;
export const STAFF_GAP = 132;
export const MEASURE_WIDTH = 212;
export const MEASURES_PER_SYSTEM = 4;
export const MEASURE_LEFT_PADDING = 20;
export const FIRST_MEASURE_LEFT_PADDING = 78;
export const MEASURE_RIGHT_PADDING = 20;
export const FIRST_STAFF_Y = 118;
export const SVG_WIDTH = 920;
export const SYSTEM_WIDTH = STAFF_RIGHT - STAFF_LEFT;
export const VEXFLOW_STAVE_TOP_LINE_OFFSET = 44.5;

const STAFF_DYNAMIC_PADDING = 28;
const TREBLE_SYSTEM_GAP = 170;
const GRAND_SYSTEM_PADDING = 152;
const ANNOTATION_ROW_GAP = 26;
const MAX_AUTO_BELOW_ANNOTATION_ROWS = 2;
const BELOW_STAFF_ANNOTATION_INK_GAP = 10;
const BELOW_STAFF_ANNOTATION_TEXT_HEIGHT = 18;
const BELOW_STAFF_NOTE_INK_ESTIMATE = 14;
const ABOVE_STAFF_ANNOTATION_DESCENT = 5;
const ABOVE_STAFF_ANNOTATION_GAP = 10;
const ABOVE_STAFF_CLOSE_BASELINE_OFFSET = -18;
const ABOVE_STAFF_FAR_BASELINE_OFFSET = -42;
const MIN_MEASURE_READABLE_WIDTH = 128;
const MIN_FIRST_MEASURE_READABLE_WIDTH = 170;
const MEASURE_COMPLEXITY_WEIGHT_SCALE = 1.5;
const MEASURE_COMPLEXITY_WIDTH_SCALE = 24;
const MAX_SYSTEM_NOTEHEADS = 18;

interface ScoreSystemLayout {
  firstMeasureIndex: number;
  measureIndexes: number[];
}

type PitchBounds = { maxY: number; minY: number };
type AnnotationSide = Exclude<AnnotationPlacementSide, 'auto'>;
type AnnotationBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};
type AnnotationPlacement = AnnotationBounds & {
  row: number;
  side: AnnotationSide;
};
type ScoreLayoutCache = {
  measureSystemIndexes: number[];
  maxStaffGap: number;
  systems: ScoreSystemLayout[];
  systemGaps: number[];
  systemTops: number[];
};

const scoreLayoutCache = new WeakMap<Score, ScoreLayoutCache>();

const PEDAL_MARK_TEXT = {
  release: '*',
  start: 'Ped.',
  'start-release': 'Ped. *',
} as const;

const ANNOTATION_METRICS = {
  chordSymbol: { charWidth: 9.5, descent: 5, height: 20, minWidth: 22 },
  dynamic: { charWidth: 9, descent: 5, height: 21, minWidth: 18 },
  fermata: { charWidth: 14, descent: 5, height: 26, minWidth: 18 },
  lyric: { charWidth: 8.2, descent: 5, height: 18, minWidth: 18 },
  pedal: { charWidth: 8.5, descent: 5, height: 19, minWidth: 20 },
} satisfies Record<
  AnnotationKind,
  { charWidth: number; descent: number; height: number; minWidth: number }
>;

function getPitchYRelativeToStaffTop(pitch: Pitch, clef: Clef) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return -diatonicOffset * (STAFF_LINE_SPACING / 2);
}

function getStaffPitchBounds(
  score: Score,
  staffIndex: number,
  systemIndex?: number,
  measureIndexes?: number[],
) {
  const staff = score.parts[0]?.staves[staffIndex];
  const measureStart = systemIndex === undefined
    ? 0
    : systemIndex * MEASURES_PER_SYSTEM;
  const measureEnd = measureStart + MEASURES_PER_SYSTEM;
  const eventPitches =
    staff?.measures
      .filter(
        (measure) =>
          measureIndexes
            ? measureIndexes.includes(measure.index)
            : systemIndex === undefined ||
              (measure.index >= measureStart && measure.index < measureEnd),
      )
      .flatMap((measure) =>
        measure.voices.flatMap((voice) =>
          voice.events.flatMap((event) => getEventPitches(event)),
        ),
      ) ?? [];

  if (!staff || eventPitches.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  const pitchYs = eventPitches.map((pitch) =>
    getPitchYRelativeToStaffTop(
      clampPitchToClefRange(pitch, staff.clef),
      staff.clef,
    ),
  );

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...pitchYs),
    minY: Math.min(0, ...pitchYs),
  };
}

function getStaffVoicePitchBounds(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  voiceIndex: number,
  measureIndexes?: number[],
) {
  const staff = score.parts[0]?.staves[staffIndex];
  const measureStart = systemIndex * MEASURES_PER_SYSTEM;
  const measureEnd = measureStart + MEASURES_PER_SYSTEM;
  const eventPitches =
    staff?.measures
      .filter(
        (measure) =>
          measureIndexes
            ? measureIndexes.includes(measure.index)
            : measure.index >= measureStart && measure.index < measureEnd,
      )
      .flatMap((measure) =>
        measure.voices[voiceIndex]?.events.flatMap((event) =>
          getEventPitches(event),
        ) ?? [],
      ) ?? [];

  if (!staff || eventPitches.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  const pitchYs = eventPitches.map((pitch) =>
    getPitchYRelativeToStaffTop(
      clampPitchToClefRange(pitch, staff.clef),
      staff.clef,
    ),
  );

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...pitchYs),
    minY: Math.min(0, ...pitchYs),
  };
}

function getSystemMeasures(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const staff = score.parts[0]?.staves[staffIndex];
  const measureStart = systemIndex * MEASURES_PER_SYSTEM;
  const measureEnd = measureStart + MEASURES_PER_SYSTEM;

  return (
    staff?.measures.filter(
      (measure) =>
        measureIndexes
          ? measureIndexes.includes(measure.index)
          : measure.index >= measureStart && measure.index < measureEnd,
    ) ?? []
  );
}

function getAnnotationText(event: ScoreEvent, kind: AnnotationKind) {
  if (kind === 'chordSymbol') {
    return event.chordSymbol ?? null;
  }

  if (kind === 'dynamic') {
    return event.dynamic ?? null;
  }

  if (kind === 'fermata') {
    return event.fermata ? 'fermata' : null;
  }

  if (kind === 'lyric') {
    return event.lyric ?? null;
  }

  return event.pedal ? PEDAL_MARK_TEXT[event.pedal] : null;
}

function getEventAnnotationKinds(event: ScoreEvent) {
  return ([
    event.chordSymbol ? 'chordSymbol' : null,
    event.lyric ? 'lyric' : null,
    event.dynamic ? 'dynamic' : null,
    event.fermata ? 'fermata' : null,
    event.pedal ? 'pedal' : null,
  ].filter(Boolean) as AnnotationKind[]);
}

function getAnnotationBounds({
  kind,
  text,
  x,
  y,
}: {
  kind: AnnotationKind;
  text: string;
  x: number;
  y: number;
}): AnnotationBounds {
  const metrics = ANNOTATION_METRICS[kind];
  const width = Math.max(metrics.minWidth, text.length * metrics.charWidth) + 12;

  return {
    maxX: x + width / 2,
    maxY: y + metrics.descent,
    minX: x - width / 2,
    minY: y - metrics.height,
  };
}

function doAnnotationBoundsOverlap(
  first: AnnotationBounds,
  second: AnnotationBounds,
) {
  return (
    first.minX < second.maxX &&
    first.maxX > second.minX &&
    first.minY < second.maxY &&
    first.maxY > second.minY
  );
}

function getAnnotationRowCount(placements: AnnotationPlacement[]) {
  return placements.length === 0
    ? 0
    : Math.max(...placements.map((placement) => placement.row)) + 1;
}

function getAutomaticAnnotationSide(
  event: ScoreEvent,
  kind: AnnotationKind,
  abovePlacements: AnnotationPlacement[],
  belowPlacements: AnnotationPlacement[],
): AnnotationSide {
  const override = event.annotationPlacements?.[kind];

  if (override === 'above' || override === 'below') {
    return override;
  }

  if (kind === 'chordSymbol' || kind === 'fermata') {
    return 'above';
  }

  if (kind === 'lyric') {
    return 'below';
  }

  const belowRows = getAnnotationRowCount(belowPlacements);
  const aboveRows = getAnnotationRowCount(abovePlacements);

  return belowRows >= MAX_AUTO_BELOW_ANNOTATION_ROWS && belowRows > aboveRows
    ? 'above'
    : 'below';
}

function placeEstimatedAnnotation(
  side: AnnotationSide,
  preferredBounds: AnnotationBounds,
  placements: AnnotationPlacement[],
) {
  const rowDirection = side === 'below' ? 1 : -1;

  for (let row = 0; row < 8; row += 1) {
    const bounds = {
      maxX: preferredBounds.maxX,
      maxY: preferredBounds.maxY + rowDirection * row * ANNOTATION_ROW_GAP,
      minX: preferredBounds.minX,
      minY: preferredBounds.minY + rowDirection * row * ANNOTATION_ROW_GAP,
    };
    const hasCollision = placements.some((placement) =>
      doAnnotationBoundsOverlap(bounds, placement),
    );

    if (!hasCollision) {
      const placement = { ...bounds, row, side };

      placements.push(placement);
      return placement;
    }
  }

  const fallbackRow = 8;
  const fallbackPlacement = {
    maxX: preferredBounds.maxX,
    maxY: preferredBounds.maxY + rowDirection * fallbackRow * ANNOTATION_ROW_GAP,
    minX: preferredBounds.minX,
    minY: preferredBounds.minY + rowDirection * fallbackRow * ANNOTATION_ROW_GAP,
    row: fallbackRow,
    side,
  };

  placements.push(fallbackPlacement);
  return fallbackPlacement;
}

function getStaffSystemAnnotationExtents(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  pitchBounds: PitchBounds,
  measureIndexes?: number[],
) {
  const abovePlacements: AnnotationPlacement[] = [];
  const belowPlacements: AnnotationPlacement[] = [];

  getSystemMeasures(score, staffIndex, systemIndex, measureIndexes)
    .flatMap((measure) =>
      measure.voices.flatMap((voice, voiceIndex) =>
        voice.events
          .filter((event) => !isGeneratedRestEvent(event))
          .sort((a, b) => a.beat - b.beat)
          .map((event) => ({ event, measure, voiceIndex })),
      ),
    )
    .sort(
      (a, b) =>
        a.measure.index - b.measure.index ||
        a.event.beat - b.event.beat ||
        a.event.id.localeCompare(b.event.id),
    )
    .forEach(({ event, measure, voiceIndex }) => {
      const localMeasureIndex = measureIndexes
        ? Math.max(0, measureIndexes.indexOf(measure.index))
        : getLocalMeasureIndex(measure.index);
      const measureLeftPadding =
        localMeasureIndex === 0 ? FIRST_MEASURE_LEFT_PADDING : MEASURE_LEFT_PADDING;
      const estimatedMeasureX = STAFF_LEFT + localMeasureIndex * MEASURE_WIDTH;
      const estimatedMeasureContentWidth =
        MEASURE_WIDTH - measureLeftPadding - MEASURE_RIGHT_PADDING;
      const x =
        estimatedMeasureX +
        measureLeftPadding +
        (event.beat / getMeasureBeats(score.timeSignature)) *
          estimatedMeasureContentWidth;
      const voicePitchBounds = getStaffVoicePitchBounds(
        score,
        staffIndex,
        systemIndex,
        voiceIndex,
        measureIndexes,
      );
      const estimatedInkBottom = Math.max(
        STAFF_LINE_SPACING * 4,
        voicePitchBounds.maxY + BELOW_STAFF_NOTE_INK_ESTIMATE,
      );
      const belowBaseline = Math.max(
        STAFF_LINE_SPACING * 4,
        estimatedInkBottom,
      ) +
        BELOW_STAFF_ANNOTATION_INK_GAP +
        BELOW_STAFF_ANNOTATION_TEXT_HEIGHT;
      const aboveBaseline = Math.max(
        ABOVE_STAFF_FAR_BASELINE_OFFSET,
        Math.min(
          ABOVE_STAFF_CLOSE_BASELINE_OFFSET,
          voicePitchBounds.minY -
            ABOVE_STAFF_ANNOTATION_GAP -
            ABOVE_STAFF_ANNOTATION_DESCENT,
        ),
      );

      getEventAnnotationKinds(event).forEach((kind) => {
        const text = getAnnotationText(event, kind);

        if (!text) {
          return;
        }

        const side = getAutomaticAnnotationSide(
          event,
          kind,
          abovePlacements,
          belowPlacements,
        );
        const y =
          side === 'below'
            ? belowBaseline
            : kind === 'fermata'
              ? Math.max(
                  ABOVE_STAFF_FAR_BASELINE_OFFSET,
                  Math.min(-30, voicePitchBounds.minY - 18),
                )
              : kind === 'dynamic' || kind === 'lyric' || kind === 'pedal'
                ? ABOVE_STAFF_CLOSE_BASELINE_OFFSET
              : aboveBaseline;

        placeEstimatedAnnotation(
          side,
          getAnnotationBounds({ kind, text, x, y }),
          side === 'below' ? belowPlacements : abovePlacements,
        );
      });
    });

  const belowBottom =
    belowPlacements.length === 0
      ? pitchBounds.maxY
      : Math.max(
          pitchBounds.maxY,
          ...belowPlacements.map((placement) => placement.maxY),
        );
  const aboveTop =
    abovePlacements.length === 0
      ? pitchBounds.minY
      : Math.min(
          pitchBounds.minY,
          ...abovePlacements.map((placement) => placement.minY),
        );

  return {
    aboveExtent: Math.max(0, -aboveTop),
    belowBottom,
  };
}

function computeSystemStaffGap(
  score: Score,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const trebleBounds = getStaffPitchBounds(score, 0, systemIndex, measureIndexes);
  const bassBounds = getStaffPitchBounds(score, 1, systemIndex, measureIndexes);
  const trebleBelowStaff = Math.max(0, trebleBounds.maxY - STAFF_LINE_SPACING * 4);
  const bassAboveStaff = Math.max(0, -bassBounds.minY);
  const extraGap = trebleBelowStaff + bassAboveStaff;
  const pitchDrivenGap =
    extraGap === 0 ? STAFF_GAP : STAFF_GAP + extraGap + STAFF_DYNAMIC_PADDING;
  const trebleAnnotationExtents = getStaffSystemAnnotationExtents(
    score,
    0,
    systemIndex,
    trebleBounds,
    measureIndexes,
  );
  const bassAnnotationExtents = getStaffSystemAnnotationExtents(
    score,
    1,
    systemIndex,
    bassBounds,
    measureIndexes,
  );
  const trebleBottomExtent = Math.max(
    STAFF_LINE_SPACING * 4,
    trebleBounds.maxY,
    trebleAnnotationExtents.belowBottom,
  );
  const bassAboveExtent = Math.max(
    bassAboveStaff,
    bassAnnotationExtents.aboveExtent,
  );
  const annotationDrivenGap =
    trebleBottomExtent + bassAboveExtent + STAFF_DYNAMIC_PADDING;

  return Math.max(STAFF_GAP, pitchDrivenGap, annotationDrivenGap);
}

function getScoreMeasureCount(score: Score | ScoreType) {
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

function getStaticSystemCount(score: Score | ScoreType) {
  return Math.max(1, Math.ceil(getScoreMeasureCount(score) / MEASURES_PER_SYSTEM));
}

function computeScoreSystems(score: Score): ScoreSystemLayout[] {
  const measureCount = getScoreMeasureCount(score);
  const systems: ScoreSystemLayout[] = [];
  let currentSystemMeasureIndexes: number[] = [];
  let currentSystemNoteheads = 0;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const measureNoteheads = countMeasureNoteheads(score, measureIndex);
    const shouldBreakForCount =
      currentSystemMeasureIndexes.length >= MEASURES_PER_SYSTEM;
    const shouldBreakForDensity =
      currentSystemMeasureIndexes.length > 0 &&
      currentSystemNoteheads + measureNoteheads > MAX_SYSTEM_NOTEHEADS;

    if (shouldBreakForCount || shouldBreakForDensity) {
      systems.push({
        firstMeasureIndex: currentSystemMeasureIndexes[0] ?? measureIndex,
        measureIndexes: currentSystemMeasureIndexes,
      });
      currentSystemMeasureIndexes = [];
      currentSystemNoteheads = 0;
    }

    currentSystemMeasureIndexes.push(measureIndex);
    currentSystemNoteheads += measureNoteheads;
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

function normalizeBoundary(beat: number, beatsPerMeasure: number) {
  return Number(Math.min(beatsPerMeasure, Math.max(0, beat)).toFixed(4));
}

function countMeasureRhythmIntervals(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const boundaries = new Set<number>([
    0,
    beatsPerMeasure,
  ]);

  for (let beat = 1; beat < beatsPerMeasure; beat += 1) {
    boundaries.add(normalizeBoundary(beat, beatsPerMeasure));
  }

  score.parts
    .flatMap((part) => part.staves)
    .forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice) => {
        voice.events.forEach((event) => {
          if (isGeneratedRestEvent(event)) {
            return;
          }

          const eventStart = normalizeBoundary(event.beat, beatsPerMeasure);
          const eventEnd = normalizeBoundary(
            event.beat + getDurationBeats(event.duration, getEventDots(event)),
            beatsPerMeasure,
          );

          boundaries.add(eventStart);
          boundaries.add(eventEnd);
        });
      });
    });

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

  return sortedBoundaries.reduce((intervalCount, boundary, index) => {
    const nextBoundary = sortedBoundaries[index + 1];

    return nextBoundary !== undefined && nextBoundary - boundary > 0.0001
      ? intervalCount + 1
      : intervalCount;
  }, 0);
}

function countMeasureNoteheads(score: Score, measureIndex: number) {
  return score.parts
    .flatMap((part) => part.staves)
    .reduce((total, staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      if (!measure) {
        return total;
      }

      return (
        total +
        measure.voices.reduce(
          (measureTotal, voice) =>
            measureTotal +
            voice.events.reduce((voiceTotal, event) => {
              if (isGeneratedRestEvent(event) || event.kind === 'rest') {
                return voiceTotal;
              }

              return voiceTotal + getEventPitches(event).length;
            }, 0),
          0,
        )
      );
    }, 0);
}

export function getMeasureSlotWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  return Math.max(
    beatsPerMeasure,
    countMeasureRhythmIntervals(score, measureIndex),
  );
}

function getMeasureReadableMinWidth(measureIndex: number, score?: Score) {
  return getLocalMeasureIndex(measureIndex, score) === 0
    ? MIN_FIRST_MEASURE_READABLE_WIDTH
    : MIN_MEASURE_READABLE_WIDTH;
}

function getMeasureDistributionWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const extraIntervals = Math.max(
    0,
    getMeasureSlotWeight(score, measureIndex) - beatsPerMeasure,
  );

  return beatsPerMeasure + Math.sqrt(extraIntervals) * MEASURE_COMPLEXITY_WEIGHT_SCALE;
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
