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
import { STAFF_LINE_SPACING, getStaffTop } from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { getNestedSvgPoint } from './overlaySvgPoint';
import type { RenderedEventLayout } from './renderedEventLayout';

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
  staffGap: number;
  staffIndex: number;
  systemGap: number;
  voiceIndex?: number;
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
  staffGap,
  staffIndex,
  systemGap,
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
      ? getPitchY(
          displayPrimaryPitch,
          staff.clef,
          staffIndex,
          staffGap,
          measureIndex,
          systemGap,
        )
      : getStaffTop(staffIndex, staffGap, measureIndex, systemGap) +
        STAFF_LINE_SPACING * 2;
  const x =
    eventLayout?.x ??
    getBeatX(measureIndex, event.beat, beatsPerMeasure, score);
  const y = eventLayout?.y ?? fallbackY;
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
      : Math.max(34, (eventLayout?.maxX ?? x + 10) - (eventLayout?.minX ?? x - 10) + 28);
  const targetHeight =
    placementMode === 'insert'
      ? 30
      : Math.max(42, (eventLayout?.maxY ?? y + 10) - (eventLayout?.minY ?? y - 10) + 30);
  const selectedPitch =
    selectedEventId === event.id && selectedPitchIndex !== null && selectedPitchIndex !== undefined
      ? eventPitches[selectedPitchIndex]
      : selectedEventId === event.id
        ? eventPitches[0]
        : null;
  const selectedPitchY = selectedPitch
    ? getPitchY(
        selectedPitch,
        staff.clef,
        staffIndex,
        staffGap,
        measureIndex,
        systemGap,
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
        const pitchY = getPitchY(
          pitch,
          staff.clef,
          staffIndex,
          staffGap,
          measureIndex,
          systemGap,
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
      y: getPitchY(pitch, staff.clef, staffIndex, staffGap, measureIndex, systemGap),
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
          x={x - targetWidth / 2}
          y={y - targetHeight / 2}
        />
      </g>
      {selectedEventId === event.id && selectedPitch && selectedPitchY !== null ? (
        <ellipse
          className="selected-notehead-overlay"
          cx={x}
          cy={selectedPitchY}
          data-selection-style="notehead-color"
          data-pitch-index={selectedPitchIndex ?? 0}
          data-testid="selected-notehead"
          rx={7.4}
          ry={4.8}
          transform={`rotate(-20 ${x} ${selectedPitchY})`}
        />
      ) : null}
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
