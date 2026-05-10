import type {
  Clef,
  Pitch,
  Score,
} from '../../domain/score/types';
import {
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { findScoreEventContext } from '../../domain/score/eventLookup';
import { getLyricMapEventIds } from '../../domain/score/lyricMapping';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  BELOW_STAFF_NOTE_INK_ESTIMATE,
  FIRST_MEASURE_LEFT_PADDING,
  MEASURE_LEFT_PADDING,
  MEASURE_RIGHT_PADDING,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  STAFF_DYNAMIC_PADDING,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
} from './layoutConstants';
import {
  ANNOTATION_METRICS,
  ABOVE_STAFF_INK_GAP,
  BELOW_STAFF_INK_GAP,
  NOTEHEAD_ANNOTATION_INK_PADDING,
  type AnnotationPlacement,
  getAnnotationBounds,
  getAutomaticAnnotationSide,
  getEventAnnotationKinds,
  getEventAnnotationText,
  placeAnnotationInRows,
} from './annotationLayoutPolicy';

type PitchBounds = { maxY: number; minY: number };
const STEM_INK_ESTIMATE = STAFF_LINE_SPACING * 2;

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

function getStaffInkBounds(
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
  const measures =
    staff?.measures.filter(
      (measure) =>
        measureIndexes
          ? measureIndexes.includes(measure.index)
          : systemIndex === undefined ||
            (measure.index >= measureStart && measure.index < measureEnd),
    ) ?? [];
  const eventBounds = measures.flatMap((measure) => {
    const visibleVoices = measure.voices.filter((voice) =>
      voice.events.some((event) => !isGeneratedRestEvent(event)),
    );
    const hasMultipleVoices = visibleVoices.length > 1;

    return measure.voices.flatMap((voice, voiceIndex) =>
      voice.events.flatMap((event) => {
        const eventPitches = getEventPitches(event);

        if (!staff || isGeneratedRestEvent(event) || eventPitches.length === 0) {
          return [];
        }

        const pitchYs = eventPitches.map((pitch) =>
          getPitchYRelativeToStaffTop(
            clampPitchToClefRange(pitch, staff.clef),
            staff.clef,
          ),
        );
        const minPitchY = Math.min(...pitchYs);
        const maxPitchY = Math.max(...pitchYs);
        const averageY =
          pitchYs.reduce((total, pitchY) => total + pitchY, 0) / pitchYs.length;
        const stemDirection = hasMultipleVoices
          ? voiceIndex === 0
            ? 'up'
            : 'down'
          : averageY <= STAFF_LINE_SPACING * 2
            ? 'down'
            : 'up';

        return [
          {
            maxY:
              stemDirection === 'down'
                ? maxPitchY + STEM_INK_ESTIMATE
                : maxPitchY > STAFF_LINE_SPACING * 4
                  ? maxPitchY + NOTEHEAD_ANNOTATION_INK_PADDING
                  : maxPitchY,
            minY:
              stemDirection === 'up'
                ? minPitchY - STEM_INK_ESTIMATE
                : minPitchY < 0
                  ? minPitchY - NOTEHEAD_ANNOTATION_INK_PADDING
                  : minPitchY,
          },
        ];
      }),
    );
  });

  if (!staff || eventBounds.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...eventBounds.map((bounds) => bounds.maxY)),
    minY: Math.min(0, ...eventBounds.map((bounds) => bounds.minY)),
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

function getStaticLocalMeasureIndex(measureIndex: number) {
  return Math.max(0, measureIndex) % MEASURES_PER_SYSTEM;
}

function getEstimatedEventX(
  score: Score,
  measureIndex: number,
  beat: number,
  measureIndexes?: number[],
) {
  const localMeasureIndex = measureIndexes
    ? Math.max(0, measureIndexes.indexOf(measureIndex))
    : getStaticLocalMeasureIndex(measureIndex);
  const measureLeftPadding =
    localMeasureIndex === 0 ? FIRST_MEASURE_LEFT_PADDING : MEASURE_LEFT_PADDING;
  const estimatedMeasureX = STAFF_LEFT + localMeasureIndex * MEASURE_WIDTH;
  const estimatedMeasureContentWidth =
    MEASURE_WIDTH - measureLeftPadding - MEASURE_RIGHT_PADDING;

  return (
    estimatedMeasureX +
    measureLeftPadding +
    (beat / getMeasureBeats(score.timeSignature)) * estimatedMeasureContentWidth
  );
}

function isMeasureInSpacingSystem(
  measureIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const measureStart = systemIndex * MEASURES_PER_SYSTEM;
  const measureEnd = measureStart + MEASURES_PER_SYSTEM;

  return measureIndexes
    ? measureIndexes.includes(measureIndex)
    : measureIndex >= measureStart && measureIndex < measureEnd;
}

function getEstimatedLyricAnnotationX({
  eventId,
  fallbackX,
  measureIndexes,
  score,
  systemIndex,
}: {
  eventId: string;
  fallbackX: number;
  measureIndexes?: number[];
  score: Score;
  systemIndex: number;
}) {
  const targetXs = getLyricMapEventIds(score, eventId)
    .flatMap((targetEventId) => {
      const targetContext = findScoreEventContext(score, targetEventId);

      return targetContext &&
        isMeasureInSpacingSystem(
          targetContext.measureIndex,
          systemIndex,
          measureIndexes,
        )
        ? [
            getEstimatedEventX(
              score,
              targetContext.measureIndex,
              targetContext.event.beat,
              measureIndexes,
            ),
          ]
        : [];
    });

  if (targetXs.length === 0) {
    return fallbackX;
  }

  return (Math.min(...targetXs) + Math.max(...targetXs)) / 2;
}

function getEventPitchBounds(score: Score, staffIndex: number, eventPitches: Pitch[]) {
  const staff = score.parts[0]?.staves[staffIndex];

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

function getStaffSystemAnnotationExtents(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  pitchBounds: PitchBounds,
  measureIndexes?: number[],
) {
  const systemAnnotationPlacements: AnnotationPlacement[] = [];
  const voiceStates = new Map<
    number,
    {
      abovePlacements: AnnotationPlacement[];
      belowPlacements: AnnotationPlacement[];
      voiceBounds: PitchBounds;
    }
  >();
  const systemEvents = getSystemMeasures(score, staffIndex, systemIndex, measureIndexes)
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
    );
  const staffInkBlockers = systemEvents.map(({ event, measure }) => {
    const eventPitchBounds = getEventPitchBounds(
      score,
      staffIndex,
      getEventPitches(event),
    );
    const x = getEstimatedEventX(
      score,
      measure.index,
      event.beat,
      measureIndexes,
    );

    return {
      maxX: x + 24,
      maxY: eventPitchBounds.maxY + BELOW_STAFF_NOTE_INK_ESTIMATE,
      minX: x - 24,
      minY: eventPitchBounds.minY - NOTEHEAD_ANNOTATION_INK_PADDING,
    };
  });
  const getVoiceState = (voiceIndex: number) => {
    const existingState = voiceStates.get(voiceIndex);

    if (existingState) {
      return existingState;
    }

    const voicePitchBounds = getStaffVoicePitchBounds(
      score,
      staffIndex,
      systemIndex,
      voiceIndex,
      measureIndexes,
    );
    const nextState = {
      abovePlacements: [],
      belowPlacements: [],
      voiceBounds: {
        maxY: voicePitchBounds.maxY + BELOW_STAFF_NOTE_INK_ESTIMATE,
        minY: voicePitchBounds.minY - NOTEHEAD_ANNOTATION_INK_PADDING,
      },
    };

    voiceStates.set(voiceIndex, nextState);
    return nextState;
  };

  systemEvents
    .forEach(({ event, measure, voiceIndex }) => {
      const x = getEstimatedEventX(
        score,
        measure.index,
        event.beat,
        measureIndexes,
      );
      const voiceState = getVoiceState(voiceIndex);

      getEventAnnotationKinds(event).forEach((kind) => {
        const text = getEventAnnotationText(event, kind);

        if (!text) {
          return;
        }

        const annotationX =
          kind === 'lyric'
            ? getEstimatedLyricAnnotationX({
                eventId: event.id,
                fallbackX: x,
                measureIndexes,
                score,
                systemIndex,
              })
            : x;
        const side = getAutomaticAnnotationSide(
          event,
          kind,
          voiceState.abovePlacements,
          voiceState.belowPlacements,
        );
        const metrics = ANNOTATION_METRICS[kind];
        const y =
          side === 'below'
            ? voiceState.voiceBounds.maxY + BELOW_STAFF_INK_GAP + metrics.height
            : voiceState.voiceBounds.minY -
              ABOVE_STAFF_INK_GAP -
              metrics.descent;

        const placement = placeAnnotationInRows({
          blockers: [
            ...staffInkBlockers,
            ...systemAnnotationPlacements,
          ],
          direction: side,
          placements:
            side === 'below'
              ? voiceState.belowPlacements
              : voiceState.abovePlacements,
          preferredBounds: getAnnotationBounds({
            kind,
            text,
            x: annotationX,
            y,
          }),
        });

        systemAnnotationPlacements.push(placement);
      });
    });

  const belowBottom =
    systemAnnotationPlacements.length === 0
      ? pitchBounds.maxY
      : Math.max(
          pitchBounds.maxY,
          ...systemAnnotationPlacements.map((placement) => placement.maxY),
        );
  const aboveTop =
    systemAnnotationPlacements.length === 0
      ? pitchBounds.minY
      : Math.min(
          pitchBounds.minY,
          ...systemAnnotationPlacements.map((placement) => placement.minY),
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
  const trebleInkBounds = getStaffInkBounds(score, 0, systemIndex, measureIndexes);
  const bassInkBounds = getStaffInkBounds(score, 1, systemIndex, measureIndexes);
  const trebleBelowStaff = Math.max(
    0,
    trebleInkBounds.maxY - STAFF_LINE_SPACING * 4,
  );
  const bassAboveStaff = Math.max(0, -bassInkBounds.minY);
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
    trebleInkBounds.maxY,
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

export function computeSystemAboveStaffExtent(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const pitchBounds = getStaffPitchBounds(
    score,
    staffIndex,
    systemIndex,
    measureIndexes,
  );

  return getStaffSystemAnnotationExtents(
    score,
    staffIndex,
    systemIndex,
    pitchBounds,
    measureIndexes,
  ).aboveExtent;
}

export function computeSystemBelowStaffExtent(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const pitchBounds = getStaffPitchBounds(
    score,
    staffIndex,
    systemIndex,
    measureIndexes,
  );
  const inkBounds = getStaffInkBounds(score, staffIndex, systemIndex, measureIndexes);
  const belowBottom = Math.max(
    pitchBounds.maxY,
    inkBounds.maxY,
    getStaffSystemAnnotationExtents(
      score,
      staffIndex,
      systemIndex,
      pitchBounds,
      measureIndexes,
    ).belowBottom,
  );

  return Math.max(0, belowBottom - STAFF_LINE_SPACING * 4);
}
