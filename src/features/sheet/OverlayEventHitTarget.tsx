import type { MouseEvent } from 'react';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';
import {
  formatEventPitchList,
  getEventPitches,
  getPrimaryEventPitch,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import type { PlacementMode } from '../editor/editorState';
import { formatPitch } from './interaction';
import type { MusicPosition } from './interaction';
import { STAFF_LINE_SPACING, getScoreStaffTop } from './layout';
import { getBeatX, getPitchYForScore } from './notationGeometry';
import { getNestedSvgPoint } from './overlaySvgPoint';
import type { RenderedEventLayout, RenderedPitchLayout } from './renderedEventLayout';

const NOTEHEAD_TARGET_HORIZONTAL_PADDING = 12;
const NOTEHEAD_TARGET_VERTICAL_PADDING = 12;
const MIN_NOTEHEAD_TARGET_WIDTH = 34;
const MIN_NOTEHEAD_TARGET_HEIGHT = 34;

interface EventHitTargetProps {
  activeEventId?: string | null;
  beatsPerMeasure: number;
  event: ScoreEvent;
  eventLayout?: RenderedEventLayout;
  isInputArmed?: boolean;
  isPlaybackActive?: boolean;
  measureIndex: number;
  onDeleteEvent?: (eventId: string, pitchIndex?: number | null) => void;
  onDeleteHoverChange: (eventId: string | null) => void;
  onStartDrag: (
    eventId: string,
    pitchIndex: number | null,
    originPosition: MusicPosition | null,
    event: MouseEvent<SVGGElement>,
  ) => void;
  onSelectEvent?: (eventId: string, pitchIndex?: number | null) => void;
  placementMode: PlacementMode;
  selectedEventId?: string | null;
  selectedPitchIndex?: number | null;
  score: Score;
  staff: Staff;
  staffIndex: number;
  voiceIndex?: number;
}

function findPitchLayout(
  eventLayout: RenderedEventLayout | undefined,
  pitchIndex: number | null | undefined,
) {
  if (pitchIndex === null || pitchIndex === undefined) {
    return null;
  }

  return (
    eventLayout?.pitchLayouts.find(
      (pitchLayout) => pitchLayout.pitchIndex === pitchIndex,
    ) ?? null
  );
}

function getPitchLayoutY(
  eventLayout: RenderedEventLayout | undefined,
  pitchIndex: number,
) {
  return findPitchLayout(eventLayout, pitchIndex)?.y ?? null;
}

function getNoteheadTargetBounds(
  pitchLayouts: RenderedPitchLayout[],
  fallbackX: number,
  fallbackY: number,
) {
  if (pitchLayouts.length === 0) {
    return null;
  }

  const minX = Math.min(...pitchLayouts.map((pitchLayout) => pitchLayout.minX));
  const maxX = Math.max(...pitchLayouts.map((pitchLayout) => pitchLayout.maxX));
  const minY =
    Math.min(...pitchLayouts.map((pitchLayout) => pitchLayout.y)) -
    NOTEHEAD_TARGET_VERTICAL_PADDING;
  const maxY =
    Math.max(...pitchLayouts.map((pitchLayout) => pitchLayout.y)) +
    NOTEHEAD_TARGET_VERTICAL_PADDING;
  const width = Math.max(
    MIN_NOTEHEAD_TARGET_WIDTH,
    maxX - minX + NOTEHEAD_TARGET_HORIZONTAL_PADDING * 2,
  );
  const height = Math.max(
    MIN_NOTEHEAD_TARGET_HEIGHT,
    maxY - minY + NOTEHEAD_TARGET_VERTICAL_PADDING,
  );
  const centerX = Number.isFinite((minX + maxX) / 2)
    ? (minX + maxX) / 2
    : fallbackX;
  const centerY = Number.isFinite((minY + maxY) / 2)
    ? (minY + maxY) / 2
    : fallbackY;

  return {
    centerX,
    centerY,
    height,
    width,
  };
}

export function EventHitTarget({
  activeEventId,
  beatsPerMeasure,
  event,
  eventLayout,
  isInputArmed,
  isPlaybackActive,
  measureIndex,
  onDeleteEvent,
  onDeleteHoverChange,
  onStartDrag,
  onSelectEvent,
  placementMode,
  selectedEventId,
  selectedPitchIndex,
  score,
  staff,
  staffIndex,
  voiceIndex,
}: EventHitTargetProps) {
  const eventPitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, staff.clef),
  );
  const primaryPitch = getPrimaryEventPitch(event);
  const displayPrimaryPitch = primaryPitch
    ? clampPitchToClefRange(primaryPitch, staff.clef)
    : null;
  const fallbackY =
    displayPrimaryPitch
      ? getPitchYForScore(
          displayPrimaryPitch,
          staff.clef,
          staffIndex,
          score,
          measureIndex,
        )
      : getScoreStaffTop(score, staffIndex, measureIndex) +
        STAFF_LINE_SPACING * 2;
  const x =
    eventLayout?.x ??
    getBeatX(measureIndex, event.beat, beatsPerMeasure, score);
  const y = eventLayout?.y ?? fallbackY;
  const noteheadTargetBounds =
    event.kind === 'rest'
      ? null
      : getNoteheadTargetBounds(eventLayout?.pitchLayouts ?? [], x, y);
  const label =
    event.kind === 'rest'
      ? `Rest measure ${measureIndex + 1} beat ${event.beat + 1}`
      : `${event.kind === 'chord' ? 'Chord' : 'Note'} ${formatEventPitchList(
          event,
          formatPitch,
        )} measure ${measureIndex + 1} beat ${event.beat + 1}`;
  const targetWidth =
    placementMode === 'insert'
      ? 16
      : noteheadTargetBounds?.width ??
        Math.max(
          34,
          (eventLayout?.maxX ?? x + 10) - (eventLayout?.minX ?? x - 10) + 28,
        );
  const targetHeight =
    placementMode === 'insert'
      ? 30
      : noteheadTargetBounds?.height ??
        Math.max(
          42,
          (eventLayout?.maxY ?? y + 10) - (eventLayout?.minY ?? y - 10) + 30,
        );
  const targetCenterX = noteheadTargetBounds?.centerX ?? x;
  const targetCenterY = noteheadTargetBounds?.centerY ?? y;
  const selectedPitch =
    selectedEventId === event.id && selectedPitchIndex !== null && selectedPitchIndex !== undefined
      ? eventPitches[selectedPitchIndex]
      : selectedEventId === event.id
        ? eventPitches[0]
        : null;
  const selectedPitchLayoutIndex =
    selectedEventId === event.id ? selectedPitchIndex ?? 0 : null;
  const selectedPitchLayoutY = findPitchLayout(
    eventLayout,
    selectedPitchLayoutIndex,
  )?.y;
  const selectedPitchY = selectedPitch
    ? selectedPitchLayoutY ??
      getPitchYForScore(
        selectedPitch,
        staff.clef,
        staffIndex,
        score,
        measureIndex,
      )
    : null;
  const deleteX = (eventLayout?.maxX ?? x) + 22;
  const deleteAnchorY = selectedPitchY ?? eventLayout?.minY ?? y;
  const deleteY = deleteAnchorY - 24;
  const deleteLabel =
    selectedPitch && event.kind === 'chord'
      ? `Delete Note ${formatPitch(selectedPitch)} from ${label}`
      : `Delete ${label}`;

  function getClosestPitchIndex(pointerEvent: MouseEvent<SVGElement>) {
    if (eventPitches.length <= 1) {
      return null;
    }

    const point = getNestedSvgPoint(pointerEvent);

    return eventPitches.reduce(
      (closest, pitch, pitchIndex) => {
        const pitchY =
          getPitchLayoutY(eventLayout, pitchIndex) ??
          getPitchYForScore(
            pitch,
            staff.clef,
            staffIndex,
            score,
            measureIndex,
          );
        const distance = Math.abs(point.y - pitchY);

        return distance < closest.distance
          ? {
              distance,
              pitchIndex,
            }
          : closest;
      },
      {
        distance: Number.POSITIVE_INFINITY,
        pitchIndex: 0,
      },
    ).pitchIndex;
  }

  function getDragPitchIndex(pointerEvent: MouseEvent<SVGElement>) {
    if (eventPitches.length === 0) {
      return null;
    }

    return eventPitches.length === 1 ? 0 : getClosestPitchIndex(pointerEvent);
  }

  function getDragOriginPosition(pitchIndex: number | null): MusicPosition | null {
    if (pitchIndex === null) {
      return null;
    }

    const pitch = eventPitches[pitchIndex];

    if (!pitch) {
      return null;
    }

    return {
      beat: event.beat,
      measureIndex,
      pitch,
      staffId: staff.id,
      staffIndex,
      x,
      y:
        getPitchLayoutY(eventLayout, pitchIndex) ??
        getPitchYForScore(pitch, staff.clef, staffIndex, score, measureIndex),
    };
  }

  function deleteSelectedTarget() {
    if (selectedPitchIndex !== null && selectedPitchIndex !== undefined) {
      onDeleteEvent?.(event.id, selectedPitchIndex);
      return;
    }

    onDeleteEvent?.(event.id);
  }

  if (isGeneratedRestEvent(event)) {
    return null;
  }

  return (
    <>
      <g
        aria-label={label}
        className={`score-event-hit${
          selectedEventId === event.id ? ' is-selected' : ''
        }${isPlaybackActive || activeEventId === event.id ? ' is-playing' : ''}${
          isInputArmed ? ' is-input-armed' : ''
        }`}
        data-duration={event.duration}
        data-event-id={event.id}
        data-layout-x={x.toFixed(2)}
        data-layout-y={y.toFixed(2)}
        data-testid="score-event"
        data-voice-index={voiceIndex}
        pointerEvents={isInputArmed ? 'none' : undefined}
        role="button"
        tabIndex={0}
        onClick={(eventClick) => {
          eventClick.stopPropagation();
          onSelectEvent?.(event.id, getClosestPitchIndex(eventClick));
        }}
        onMouseDown={(eventMouseDown) => {
          eventMouseDown.stopPropagation();
          const selectionPitchIndex = getClosestPitchIndex(eventMouseDown);
          const dragPitchIndex = getDragPitchIndex(eventMouseDown);

          onSelectEvent?.(event.id, selectionPitchIndex);
          onStartDrag(
            event.id,
            dragPitchIndex,
            getDragOriginPosition(dragPitchIndex),
            eventMouseDown,
          );
        }}
        onKeyDown={(eventKey) => {
          if (eventKey.key === 'Enter' || eventKey.key === ' ') {
            eventKey.preventDefault();
            onSelectEvent?.(event.id, eventPitches.length > 1 ? 0 : null);
          }
        }}
      >
        <rect
          className="score-event-target"
          data-testid="score-event-target"
          height={targetHeight}
          rx={4}
          width={targetWidth}
          x={targetCenterX - targetWidth / 2}
          y={targetCenterY - targetHeight / 2}
        />
      </g>
      {selectedEventId === event.id ? (
        <g
          aria-label={deleteLabel}
          className="score-event-delete"
          data-testid="score-event-delete"
          role="button"
          tabIndex={0}
          onMouseDown={(deleteMouseDown) => {
            deleteMouseDown.preventDefault();
            deleteMouseDown.stopPropagation();
          }}
          onClick={(deleteClick) => {
            deleteClick.preventDefault();
            deleteClick.stopPropagation();
            deleteSelectedTarget();
          }}
          onMouseEnter={(deleteMouseEnter) => {
            deleteMouseEnter.stopPropagation();
            onDeleteHoverChange(event.id);
          }}
          onMouseLeave={(deleteMouseLeave) => {
            deleteMouseLeave.stopPropagation();
            onDeleteHoverChange(null);
          }}
          onMouseMove={(deleteMouseMove) => {
            deleteMouseMove.stopPropagation();
          }}
          onKeyDown={(deleteKey) => {
            if (deleteKey.key === 'Enter' || deleteKey.key === ' ') {
              deleteKey.preventDefault();
              deleteKey.stopPropagation();
              deleteSelectedTarget();
            }
          }}
        >
          <circle
            className="score-event-delete-target"
            cx={deleteX}
            cy={deleteY}
            r={18}
          />
          <circle className="score-event-delete-bg" cx={deleteX} cy={deleteY} r={9} />
          <path
            className="score-event-delete-mark"
            d={`M ${deleteX - 4} ${deleteY - 4} L ${deleteX + 4} ${
              deleteY + 4
            } M ${deleteX + 4} ${deleteY - 4} L ${deleteX - 4} ${
              deleteY + 4
            }`}
          />
        </g>
      ) : null}
    </>
  );
}
