import type {
  Clef,
  Pitch,
  Score,
  ScoreEvent,
} from '../../domain/score/types';
import { getEventAnnotationOffset } from '../../domain/score/annotationOffsets';
import {
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { findScoreEventContext } from '../../domain/score/eventLookup';
import { getEffectiveStemDirection } from '../../domain/score/stemDirection';
import {
  getActiveClefState,
} from '../../domain/score/clefChanges';
import { getLyricMapEventIds } from '../../domain/score/lyricMapping';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  getDisplayPitchForClefOctaveShift,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  FIRST_MEASURE_LEFT_PADDING,
  MEASURE_LEFT_PADDING,
  MEASURE_RIGHT_PADDING,
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
} from './layoutConstants';
import {
  NOTEHEAD_ANNOTATION_INK_PADDING,
  type AnnotationPlacement,
  createManualAnnotationPlacement,
  getAnnotationBaseline,
  getAnnotationBounds,
  getAutomaticAnnotationSide,
  getEventAnnotationKinds,
  getEventAnnotationText,
  hasManualAnnotationLayout,
  insetAnnotationBounds,
  keepAnnotationPlacementOutsideStaff,
  moveAnnotationBounds,
  placeAnnotationInRows,
  resolveAnnotationPlacementCollisions,
} from './annotationLayoutPolicy';
import {
  getEstimatedEventBottomInkPadding,
  getEstimatedEventTopInkPadding,
} from './eventInkMetrics';

const STEM_INK_ESTIMATE = STAFF_LINE_SPACING * 2;
const INTER_STAFF_MIN_CLEARANCE = 22;

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
  const pitchYs =
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
          voice.events.flatMap((event) => {
            const activeClefState = getActiveClefState(
              score,
              staff.id,
              measure.index,
              event.beat,
            );

            return getEventPitches(event).map((pitch) =>
              getPitchYRelativeToStaffTop(
                clampPitchToClefRange(
                  getDisplayPitchForClefOctaveShift(
                    pitch,
                    activeClefState.octaveShift,
                  ),
                  activeClefState.clef,
                ),
                activeClefState.clef,
              ),
            );
          }),
        ),
      ) ?? [];

  if (!staff || pitchYs.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

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

        const activeClefState = getActiveClefState(
          score,
          staff.id,
          measure.index,
          event.beat,
        );
        const pitchYs = eventPitches.map((pitch) =>
          getPitchYRelativeToStaffTop(
            clampPitchToClefRange(
              getDisplayPitchForClefOctaveShift(
                pitch,
                activeClefState.octaveShift,
              ),
              activeClefState.clef,
            ),
            activeClefState.clef,
          ),
        );
        const minPitchY = Math.min(...pitchYs);
        const maxPitchY = Math.max(...pitchYs);
        const stemDirection = getEffectiveStemDirection({
          clef: activeClefState.clef,
          clefOctaveShift: activeClefState.octaveShift,
          event,
          hasMultipleVoices,
          voiceIndex,
        });

        if (!stemDirection) {
          return [];
        }

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
    maxY: Math.max(
      STAFF_LINE_SPACING * 4,
      ...eventBounds.map((bounds) => bounds.maxY),
    ),
    minY: Math.min(
      0,
      ...eventBounds.map((bounds) => bounds.minY),
    ),
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

function getEventPitchBounds(
  score: Score,
  staffIndex: number,
  measureIndex: number,
  beat: number,
  eventPitches: Pitch[],
) {
  const staff = score.parts[0]?.staves[staffIndex];

  if (!staff || eventPitches.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  const activeClefState = getActiveClefState(score, staff.id, measureIndex, beat);
  const pitchYs = eventPitches.map((pitch) =>
    getPitchYRelativeToStaffTop(
      clampPitchToClefRange(
        getDisplayPitchForClefOctaveShift(
          pitch,
          activeClefState.octaveShift,
        ),
        activeClefState.clef,
      ),
      activeClefState.clef,
    ),
  );

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...pitchYs),
    minY: Math.min(0, ...pitchYs),
  };
}

function getEstimatedEventInkBounds({
  beat,
  event,
  measureIndex,
  score,
  staffIndex,
  x,
}: {
  beat: number;
  event: ScoreEvent;
  measureIndex: number;
  score: Score;
  staffIndex: number;
  x: number;
}) {
  const eventPitches = getEventPitches(event);
  const eventPitchBounds = getEventPitchBounds(
    score,
    staffIndex,
    measureIndex,
    beat,
    eventPitches,
  );

  return {
    maxX: x + 24,
    maxY: eventPitchBounds.maxY + getEstimatedEventBottomInkPadding(event),
    minX: x - 24,
    minY: eventPitchBounds.minY - getEstimatedEventTopInkPadding(event),
  };
}

function getStaffSystemAnnotationExtents(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  const staffBounds = {
    maxY: STAFF_LINE_SPACING * 4,
    minY: 0,
  };
  const systemAnnotationPlacements: AnnotationPlacement[] = [];
  const voiceStates = new Map<
    number,
    {
      abovePlacements: AnnotationPlacement[];
      belowPlacements: AnnotationPlacement[];
    }
  >();
  const ownSystemEvents = getSystemMeasures(score, staffIndex, systemIndex, measureIndexes)
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
  const lastStaffIndex = Math.max(0, (score.parts[0]?.staves.length ?? 1) - 1);
  const delegatedGrandPedalEvents =
    score.type === 'grand' && staffIndex === lastStaffIndex
      ? score.parts[0]?.staves.flatMap((_, candidateStaffIndex) =>
          candidateStaffIndex === staffIndex
            ? []
            : getSystemMeasures(
                score,
                candidateStaffIndex,
                systemIndex,
                measureIndexes,
              ).flatMap((measure) =>
                measure.voices.flatMap((voice, voiceIndex) =>
                  voice.events
                    .filter(
                      (event) =>
                        !isGeneratedRestEvent(event) && Boolean(event.pedal),
                    )
                    .sort((a, b) => a.beat - b.beat)
                    .map((event) => ({
                      delegatedGrandPedal: true,
                      event,
                      measure,
                      voiceIndex,
                    })),
                ),
              ),
        ) ?? []
      : [];
  const systemEvents = [
    ...ownSystemEvents.map((eventContext) => ({
      ...eventContext,
      delegatedGrandPedal: false,
    })),
    ...delegatedGrandPedalEvents,
  ].sort(
    (a, b) =>
      a.measure.index - b.measure.index ||
      a.event.beat - b.event.beat ||
      a.event.id.localeCompare(b.event.id),
  );
  const staffInkBlockers = ownSystemEvents.map(({ event, measure }) => {
    const x = getEstimatedEventX(
      score,
      measure.index,
      event.beat,
      measureIndexes,
    );

    return {
      bounds: getEstimatedEventInkBounds({
        beat: event.beat,
        event,
        measureIndex: measure.index,
        score,
        staffIndex,
        x,
      }),
      eventId: event.id,
    };
  });
  const getVoiceState = (voiceIndex: number) => {
    const existingState = voiceStates.get(voiceIndex);

    if (existingState) {
      return existingState;
    }

    const nextState = {
      abovePlacements: [],
      belowPlacements: [],
    };

    voiceStates.set(voiceIndex, nextState);
    return nextState;
  };

  systemEvents
    .forEach(({ delegatedGrandPedal, event, measure, voiceIndex }) => {
      const x = getEstimatedEventX(
        score,
        measure.index,
        event.beat,
        measureIndexes,
      );
      const voiceState = getVoiceState(voiceIndex);

      const annotationKinds = delegatedGrandPedal
        ? (['pedal'] as const)
        : getEventAnnotationKinds(event);

      annotationKinds.forEach((kind) => {
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
        const automaticSide = getAutomaticAnnotationSide(
          event,
          kind,
          voiceState.abovePlacements,
          voiceState.belowPlacements,
        );
        const side =
          kind === 'pedal' &&
          score.type === 'grand' &&
          event.annotationPlacements?.pedal !== 'above'
            ? 'below'
            : automaticSide;

        if (
          kind === 'pedal' &&
          score.type === 'grand' &&
          side === 'below' &&
          staffIndex !== lastStaffIndex
        ) {
          return;
        }

        const isManualLayout = hasManualAnnotationLayout(event, kind);
        const eventInkBounds = delegatedGrandPedal
          ? staffBounds
          : getEstimatedEventInkBounds({
              beat: event.beat,
              event,
              measureIndex: measure.index,
              score,
              staffIndex,
              x,
            });

        const preferredBounds = getAnnotationBounds({
          kind,
          text,
          x: annotationX,
          y: getAnnotationBaseline({
            eventInkBounds,
            kind,
            side,
            staffBounds,
          }),
        });
        const otherEventInkBlockers = staffInkBlockers
          .filter((blocker) => blocker.eventId !== event.id)
          .map((blocker) =>
            insetAnnotationBounds(blocker.bounds, { x: 10, y: 6 }),
          );

        if (isManualLayout) {
          const placement = keepAnnotationPlacementOutsideStaff(
            moveAnnotationBounds(
              createManualAnnotationPlacement(preferredBounds, side),
              getEventAnnotationOffset(event, kind),
            ),
            staffBounds,
          );
          const resolvedPlacement = keepAnnotationPlacementOutsideStaff(
            resolveAnnotationPlacementCollisions({
              blockers: [
                ...otherEventInkBlockers,
                ...systemAnnotationPlacements,
              ],
              direction: side,
              placement,
            }),
            staffBounds,
          );

          systemAnnotationPlacements.push(resolvedPlacement);
          return;
        }

        const placement = placeAnnotationInRows({
          blockers: [
            ...otherEventInkBlockers,
            ...systemAnnotationPlacements,
          ],
          direction: side,
          placements:
            side === 'below'
              ? voiceState.belowPlacements
              : voiceState.abovePlacements,
          preferredBounds,
        });

        systemAnnotationPlacements.push(placement);
      });
    });

  const belowBottom =
    systemAnnotationPlacements.length === 0
      ? STAFF_LINE_SPACING * 4
      : Math.max(
          STAFF_LINE_SPACING * 4,
          ...systemAnnotationPlacements.map((placement) => placement.maxY),
        );
  const aboveTop =
    systemAnnotationPlacements.length === 0
      ? 0
      : Math.min(
          0,
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
  const trebleInkBounds = getStaffInkBounds(score, 0, systemIndex, measureIndexes);
  const bassInkBounds = getStaffInkBounds(score, 1, systemIndex, measureIndexes);
  const trebleAnnotationExtents = getStaffSystemAnnotationExtents(
    score,
    0,
    systemIndex,
    measureIndexes,
  );
  const bassAnnotationExtents = getStaffSystemAnnotationExtents(
    score,
    1,
    systemIndex,
    measureIndexes,
  );
  const trebleBottomExtent = Math.max(
    trebleInkBounds.maxY,
    trebleAnnotationExtents.belowBottom,
  );
  const bassTopExtent = Math.max(
    0,
    -bassInkBounds.minY,
    bassAnnotationExtents.aboveExtent,
  );
  const collisionClearanceGap =
    trebleBottomExtent + bassTopExtent + INTER_STAFF_MIN_CLEARANCE;

  return Math.max(STAFF_GAP, collisionClearanceGap);
}

export function computeSystemAboveStaffExtent(
  score: Score,
  staffIndex: number,
  systemIndex: number,
  measureIndexes?: number[],
) {
  return getStaffSystemAnnotationExtents(
    score,
    staffIndex,
    systemIndex,
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
      measureIndexes,
    ).belowBottom,
  );

  return Math.max(0, belowBottom - STAFF_LINE_SPACING * 4);
}
