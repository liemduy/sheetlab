import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Clef,
  Pitch,
  Score,
  ScoreEvent,
} from '../../domain/score/types';
import {
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  ABOVE_STAFF_ANNOTATION_DESCENT,
  ABOVE_STAFF_ANNOTATION_GAP,
  ABOVE_STAFF_CLOSE_BASELINE_OFFSET,
  ABOVE_STAFF_FAR_BASELINE_OFFSET,
  ANNOTATION_ROW_GAP,
  BELOW_STAFF_ANNOTATION_INK_GAP,
  BELOW_STAFF_ANNOTATION_TEXT_HEIGHT,
  BELOW_STAFF_NOTE_INK_ESTIMATE,
  FIRST_MEASURE_LEFT_PADDING,
  MAX_AUTO_BELOW_ANNOTATION_ROWS,
  MEASURE_LEFT_PADDING,
  MEASURE_RIGHT_PADDING,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  STAFF_DYNAMIC_PADDING,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
} from './layoutConstants';

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

function getStaticLocalMeasureIndex(measureIndex: number) {
  return Math.max(0, measureIndex) % MEASURES_PER_SYSTEM;
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
        : getStaticLocalMeasureIndex(measure.index);
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

export function computeSystemStaffGap(
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
