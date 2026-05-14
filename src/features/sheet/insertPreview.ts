import { getDurationBeats } from '../../domain/score/durations';
import { isPitchedScoreEvent } from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { DurationValue, Score, ScoreEvent } from '../../domain/score/types';
import type { MusicPosition } from './interaction';
import { snapInsertPositionToEventBoundary } from './insertPosition';
import { getMeasureContentWidth } from './layout';
import { getBeatX } from './notationGeometry';
import { snapPositionToInputGrid } from './overlayPositioning';
import type { RenderedEventLayout } from './renderedEventLayout';

const INSERT_PREVIEW_MIN_SHIFT_PX = 8;
const INSERT_PREVIEW_MAX_SHIFT_PX = 22;
const INSERT_PREVIEW_SHIFT_RATIO = 0.35;
const BEAT_EPSILON = 0.0001;

export interface InsertPreviewItem {
  event: ScoreEvent;
  layout: RenderedEventLayout;
  previewX: number;
  shiftX: number;
}

function getTargetVoiceEvents(
  score: Score,
  staffId: string,
  measureIndex: number,
  voiceIndex: number,
) {
  return score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId)
    ?.measures.find((measure) => measure.index === measureIndex)
    ?.voices[voiceIndex]?.events ?? [];
}

export function getInsertTargetEvent(
  score: Score,
  position: MusicPosition,
  voiceIndex: number,
) {
  return (
    getTargetVoiceEvents(
      score,
      position.staffId,
      position.measureIndex,
      voiceIndex,
    )
      .filter(
        (event) =>
          isPitchedScoreEvent(event) &&
          Math.abs(event.beat - position.beat) <= BEAT_EPSILON,
      )
      .sort((first, second) => first.beat - second.beat)[0] ?? null
  );
}

export function getInsertPreviewShiftPx(
  score: Score,
  position: MusicPosition,
  duration: DurationValue,
  dots = 0,
) {
  const durationWidth =
    (getDurationBeats(duration, dots) / getMeasureBeats(score.timeSignature)) *
    getMeasureContentWidth(position.measureIndex, score);

  return Math.min(
    INSERT_PREVIEW_MAX_SHIFT_PX,
    Math.max(
      INSERT_PREVIEW_MIN_SHIFT_PX,
      durationWidth * INSERT_PREVIEW_SHIFT_RATIO,
    ),
  );
}

export function resolveInsertDisplayPosition({
  dots,
  duration,
  eventLayouts,
  position,
  score,
  voiceIndex,
}: {
  dots: number;
  duration: DurationValue;
  eventLayouts: Record<string, RenderedEventLayout>;
  position: MusicPosition;
  score: Score;
  voiceIndex: number;
}) {
  const boundaryPosition = snapInsertPositionToEventBoundary(
    score,
    position,
    voiceIndex,
  );
  const boundaryX = getBeatX(
    boundaryPosition.measureIndex,
    boundaryPosition.beat,
    getMeasureBeats(score.timeSignature),
    score,
  );

  const snappedPosition = snapPositionToInputGrid(
    {
      ...boundaryPosition,
      x: boundaryX,
    },
    duration,
    dots,
    score,
    eventLayouts,
    voiceIndex,
    { preferRenderedPosition: true },
  );
  const targetEvent = getInsertTargetEvent(score, snappedPosition, voiceIndex);

  if (!targetEvent) {
    return null;
  }

  const targetLayout = eventLayouts[targetEvent.id];

  return {
    ...snappedPosition,
    beat: targetEvent.beat,
    x:
      targetLayout?.staffId === snappedPosition.staffId &&
      targetLayout.measureIndex === snappedPosition.measureIndex
        ? targetLayout.x
        : getBeatX(
            snappedPosition.measureIndex,
            targetEvent.beat,
            getMeasureBeats(score.timeSignature),
            score,
          ),
  };
}

export function getInsertPreviewItems({
  dots,
  duration,
  eventLayouts,
  insertPosition,
  score,
  voiceIndex,
}: {
  dots: number;
  duration: DurationValue;
  eventLayouts: Record<string, RenderedEventLayout>;
  insertPosition: MusicPosition | null;
  score: Score;
  voiceIndex: number;
}): InsertPreviewItem[] {
  if (!insertPosition) {
    return [];
  }

  const targetEvent = getInsertTargetEvent(score, insertPosition, voiceIndex);

  if (!targetEvent) {
    return [];
  }

  const targetLayout = eventLayouts[targetEvent.id];

  if (!targetLayout || targetLayout.staffId !== insertPosition.staffId) {
    return [];
  }

  const shiftX = getInsertPreviewShiftPx(
    score,
    insertPosition,
    duration,
    dots,
  );

  return [
    {
      event: targetEvent,
      layout: targetLayout,
      previewX: targetLayout.x + shiftX,
      shiftX,
    },
  ];
}
