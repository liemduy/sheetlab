import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { getDurationBeats } from '../../domain/score/durations';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';
import {
  formatEventPitchList,
  getEventDots,
  getEventPitches,
  getPrimaryEventPitch,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import {
  formatPitch,
  mapPointToMusicPosition,
  mapStaffYToPitch,
} from './interaction';
import type { MusicPosition } from './interaction';
import {
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  getScoreStaffGap,
  getMeasureX,
  getStaffRight,
  getStaffTop,
} from './layout';
import { snapInsertPositionToEventBoundary } from './insertPosition';
import { getBeatX, getPitchY } from './notationGeometry';
import { ChordGlyph, NoteGlyph, RestGlyph } from './notationGlyph';
import { getMeasureKey } from './measureKey';
import { snapPositionToRhythmSlot } from './rhythmSlots';

export interface RenderedEventLayout {
  beat: number;
  maxX: number;
  maxY: number;
  measureIndex: number;
  minX: number;
  minY: number;
  staffId: string;
  x: number;
  y: number;
}

const RENDERED_COLUMN_SNAP_RADIUS = 34;
const BEAT_MATCH_EPSILON = 0.0001;

interface NotationOverlayProps {
  activeEventId?: string | null;
  dots: number;
  duration: DurationValue;
  entryMode: EntryMode;
  eventLayouts?: Record<string, RenderedEventLayout>;
  hoverPosition?: MusicPosition | null;
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  invalidMeasureKeys?: readonly string[];
  onClearInteraction?: () => void;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string, pitchIndex?: number | null) => void;
  onDeleteEvent?: (eventId: string, pitchIndex?: number | null) => void;
  onMoveEvent?: (
    eventId: string,
    position: MusicPosition,
    pitchIndex?: number | null,
  ) => void;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  score: Score;
  selectedEventId?: string | null;
  selectedPitchIndex?: number | null;
  svgHeight: number;
}

function getSvgPoint(event: MouseEvent<SVGSVGElement>, svgHeight: number) {
  const bounds = event.currentTarget.getBoundingClientRect();

  if (bounds.width === 0 || bounds.height === 0) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    x: ((event.clientX - bounds.left) / bounds.width) * SVG_WIDTH,
    y: ((event.clientY - bounds.top) / bounds.height) * svgHeight,
  };
}

function getNestedSvgPoint(event: MouseEvent<SVGElement>) {
  const svg = event.currentTarget.ownerSVGElement;

  if (!svg) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  const bounds = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const parsedViewBox = svg
    .getAttribute('viewBox')
    ?.split(/\s+/)
    .map(Number);
  const svgHeightAttribute = Number(svg.getAttribute('height'));
  const safeViewBox =
    Number.isFinite(viewBox.width) && viewBox.width > 0
      ? viewBox
      : {
          x: parsedViewBox?.[0] ?? 0,
          y: parsedViewBox?.[1] ?? 0,
          width: parsedViewBox?.[2] ?? SVG_WIDTH,
          height:
            parsedViewBox?.[3] ??
            (Number.isFinite(svgHeightAttribute) && svgHeightAttribute > 0
              ? svgHeightAttribute
              : 1),
        };

  if (bounds.width === 0 || bounds.height === 0) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    x: safeViewBox.x + ((event.clientX - bounds.left) / bounds.width) * safeViewBox.width,
    y: safeViewBox.y + ((event.clientY - bounds.top) / bounds.height) * safeViewBox.height,
  };
}

function EventHitTarget({
  activeEventId,
  beatsPerMeasure,
  event,
  eventLayout,
  isInputArmed,
  measureIndex,
  onDeleteEvent,
  onDeleteHoverChange,
  onStartDrag,
  onSelectEvent,
  placementMode,
  selectedEventId,
  selectedPitchIndex,
  staff,
  staffGap,
  staffIndex,
}: {
  activeEventId?: string | null;
  beatsPerMeasure: number;
  event: ScoreEvent;
  eventLayout?: RenderedEventLayout;
  isInputArmed?: boolean;
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
  staff: Staff;
  staffGap: number;
  staffIndex: number;
}) {
  const eventPitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, staff.clef),
  );
  const primaryPitch = getPrimaryEventPitch(event);
  const displayPrimaryPitch = primaryPitch
    ? clampPitchToClefRange(primaryPitch, staff.clef)
    : null;
  const fallbackY =
    displayPrimaryPitch
      ? getPitchY(displayPrimaryPitch, staff.clef, staffIndex, staffGap)
      : getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 2;
  const x = eventLayout?.x ?? getBeatX(measureIndex, event.beat, beatsPerMeasure);
  const y = eventLayout?.y ?? fallbackY;
  const label =
    event.kind === 'rest'
      ? `Rest measure ${measureIndex + 1} beat ${event.beat + 1}`
      : `${event.kind === 'chord' ? 'Chord' : 'Note'} ${formatEventPitchList(
          event,
          formatPitch,
        )} measure ${measureIndex + 1} beat ${
          event.beat + 1
        }`;
  const targetWidth =
    placementMode === 'insert'
      ? 16
      : Math.max(34, (eventLayout?.maxX ?? x + 10) - (eventLayout?.minX ?? x - 10) + 28);
  const targetHeight =
    placementMode === 'insert'
      ? 30
      : Math.max(42, (eventLayout?.maxY ?? y + 10) - (eventLayout?.minY ?? y - 10) + 30);
  const deleteX = (eventLayout?.maxX ?? x) + 22;
  const deleteY = (eventLayout?.minY ?? y) - 24;
  const selectedPitch =
    selectedEventId === event.id && selectedPitchIndex !== null && selectedPitchIndex !== undefined
      ? eventPitches[selectedPitchIndex]
      : selectedEventId === event.id
        ? eventPitches[0]
        : null;
  const selectedPitchY = selectedPitch
    ? getPitchY(selectedPitch, staff.clef, staffIndex, staffGap)
    : null;
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
        const pitchY = getPitchY(pitch, staff.clef, staffIndex, staffGap);
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
      y: getPitchY(pitch, staff.clef, staffIndex, staffGap),
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
        }${activeEventId === event.id ? ' is-playing' : ''}${
          isInputArmed ? ' is-input-armed' : ''
        }`}
        data-duration={event.duration}
        data-event-id={event.id}
        data-layout-x={x.toFixed(2)}
        data-layout-y={y.toFixed(2)}
        data-testid="score-event"
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
          data-pitch-index={selectedPitchIndex ?? 0}
          data-testid="selected-notehead"
          rx={8.4}
          ry={5.8}
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

function GhostEvent({
  dots,
  duration,
  entryMode,
  position,
  score,
  staffGap,
}: {
  dots: number;
  duration: DurationValue;
  entryMode: EntryMode;
  position: MusicPosition;
  score: Score;
  staffGap: number;
}) {
  const staff = score.parts[0]?.staves[position.staffIndex];

  if (!staff) {
    return null;
  }

  const x = position.x;
  const noteY = getPitchY(
    position.pitch,
    staff.clef,
    position.staffIndex,
    staffGap,
  );
  const restY = getStaffTop(position.staffIndex, staffGap) + STAFF_LINE_SPACING * 2;

  return (
    <g
      aria-label={`Ghost ${entryMode}`}
      className="ghost-event"
      data-duration={duration}
      data-entry-mode={entryMode}
      data-testid="ghost-event"
    >
      {entryMode === 'note' ? (
        <NoteGlyph
          duration={duration}
          dots={dots}
          pitch={position.pitch}
          staffGap={staffGap}
          staffIndex={position.staffIndex}
          variant="ghost"
          x={x}
          y={noteY}
        />
      ) : (
        <RestGlyph
          duration={duration}
          dots={dots}
          staffGap={staffGap}
          staffIndex={position.staffIndex}
          variant="ghost"
          x={x}
          y={restY}
        />
      )}
    </g>
  );
}

function InsertionCursor({
  position,
  score,
  staffGap,
}: {
  position: MusicPosition;
  score: Score;
  staffGap: number;
}) {
  const staff = score.parts[0]?.staves[position.staffIndex];

  if (!staff) {
    return null;
  }

  const x = getBeatX(
    position.measureIndex,
    position.beat,
    score.timeSignature.beats,
  );
  const yRange = getTimelineYRange(score, position.staffIndex, staffGap);

  return (
    <line
      className="insertion-cursor"
      data-testid="insertion-cursor"
      x1={x}
      x2={x}
      y1={yRange.y1}
      y2={yRange.y2}
    />
  );
}

function getTimelineYRange(score: Score, staffIndex: number, staffGap: number) {
  const staves = score.parts[0]?.staves ?? [];

  if (score.type === 'grand' && staves.length > 1) {
    return {
      y1: getStaffTop(0, staffGap) - 36,
      y2: getStaffTop(staves.length - 1, staffGap) + STAFF_LINE_SPACING * 4 + 36,
    };
  }

  return {
    y1: getStaffTop(staffIndex, staffGap) - 36,
    y2: getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 4 + 36,
  };
}

function getStaffSlotYRange(staffIndex: number, staffGap: number) {
  return {
    y1: getStaffTop(staffIndex, staffGap) - 16,
    y2: getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 4 + 16,
  };
}

function StaffHoverGuide({
  position,
  score,
  staffGap,
}: {
  position: MusicPosition;
  score: Score;
  staffGap: number;
}) {
  const staff = score.parts[0]?.staves[position.staffIndex];

  if (!staff) {
    return null;
  }

  const staffTop = getStaffTop(position.staffIndex, staffGap);
  const measureCount = staff.measures.length;

  return (
    <g
      className="staff-hover-guide"
      data-staff-id={staff.id}
      data-testid="staff-hover-guide"
    >
      <rect
        height={STAFF_LINE_SPACING * 4 + 34}
        rx={8}
        width={getStaffRight(measureCount) - STAFF_LEFT}
        x={STAFF_LEFT}
        y={staffTop - 17}
      />
    </g>
  );
}

function InvalidMeasureWarning({
  measureIndex,
  staffId,
  staffIndex,
  staffGap,
}: {
  measureIndex: number;
  staffId: Staff['id'];
  staffIndex: number;
  staffGap: number;
}) {
  const x1 = getMeasureX(measureIndex);
  const x2 = getMeasureX(measureIndex + 1);
  const staffTop = getStaffTop(staffIndex, staffGap);

  return (
    <g
      className="invalid-measure-warning"
      data-measure-key={getMeasureKey(staffId, measureIndex)}
      data-testid="invalid-measure-warning"
    >
      <rect
        className="invalid-measure-bg"
        height={STAFF_LINE_SPACING * 4 + 28}
        width={x2 - x1}
        x={x1}
        y={staffTop - 14}
      />
      {Array.from({ length: 5 }, (_, lineIndex) => (
        <line
          key={lineIndex}
          className="invalid-measure-staff-line"
          x1={x1}
          x2={x2}
          y1={staffTop + lineIndex * STAFF_LINE_SPACING}
          y2={staffTop + lineIndex * STAFF_LINE_SPACING}
        />
      ))}
      <line
        className="invalid-measure-barline"
        x1={x1}
        x2={x1}
        y1={staffTop}
        y2={staffTop + STAFF_LINE_SPACING * 4}
      />
      <line
        className="invalid-measure-barline"
        x1={x2}
        x2={x2}
        y1={staffTop}
        y2={staffTop + STAFF_LINE_SPACING * 4}
      />
    </g>
  );
}

function RhythmSlots({
  inputCursor,
  isInputArmed,
  score,
}: {
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  score: Score;
}) {
  if (!isInputArmed || !inputCursor) {
    return null;
  }

  const staffGap = getScoreStaffGap(score);
  const slotStartX = getBeatX(
    inputCursor.measureIndex,
    inputCursor.beat,
    score.timeSignature.beats,
  );
  const slotEndBeat = Math.min(
    score.timeSignature.beats,
    inputCursor.beat +
      getDurationBeats(inputCursor.duration, inputCursor.dots ?? 0),
  );
  const slotEndX = getBeatX(
    inputCursor.measureIndex,
    slotEndBeat,
    score.timeSignature.beats,
  );
  const yRange = getStaffSlotYRange(inputCursor.staffIndex, staffGap);

  return (
    <g className="rhythm-slots" data-testid="rhythm-slots">
      <g
        className={`active-input-cursor active-input-cursor-${inputCursor.mode}`}
        data-beat={inputCursor.beat}
        data-duration={inputCursor.duration}
        data-measure-index={inputCursor.measureIndex}
        data-staff-id={inputCursor.staffId}
        data-testid="active-input-cursor"
      >
        <rect
          className="rhythm-slot timeline-slot is-active"
          data-beat={inputCursor.beat}
          data-duration={inputCursor.duration}
          data-measure-index={inputCursor.measureIndex}
          data-slot-end-beat={slotEndBeat}
          data-staff-id={inputCursor.staffId}
          data-testid="rhythm-slot"
          height={yRange.y2 - yRange.y1}
          rx={7}
          width={Math.max(6, slotEndX - slotStartX)}
          x={slotStartX}
          y={yRange.y1}
        />
      </g>
    </g>
  );
}

function inputCursorToMusicPosition(
  cursor: InputCursor | null | undefined,
  score: Score,
  staffGap: number,
): MusicPosition | null {
  if (!cursor) {
    return null;
  }

  const staff = score.parts[0]?.staves[cursor.staffIndex];

  if (!staff || staff.id !== cursor.staffId) {
    return null;
  }

  const x = getBeatX(
    cursor.measureIndex,
    cursor.beat,
    score.timeSignature.beats,
  );
  const y =
    cursor.mode === 'note-input'
      ? getPitchY(cursor.pitchPreview, staff.clef, cursor.staffIndex, staffGap)
      : getStaffTop(cursor.staffIndex, staffGap) + STAFF_LINE_SPACING * 2;

  return {
    beat: cursor.beat,
    clientX: cursor.clientX,
    clientY: cursor.clientY,
    measureIndex: cursor.measureIndex,
    pitch: cursor.pitchPreview,
    staffId: cursor.staffId,
    staffIndex: cursor.staffIndex,
    x,
    y,
  };
}

function snapPositionToInputGrid(
  position: MusicPosition,
  duration: DurationValue,
  dots: number,
  score: Score,
  staffGap: number,
  eventLayouts: Record<string, RenderedEventLayout> = {},
) {
  const rhythmSlotPosition = snapPositionToRhythmSlot(score, position);
  const snappedPosition =
    inputCursorToMusicPosition(
      createInputCursorFromPosition(
        rhythmSlotPosition,
        duration,
        'note-input',
        score.timeSignature.beats,
        dots,
      ),
      score,
      staffGap,
    ) ?? rhythmSlotPosition;
  const nearbyEventLayout = Object.values(eventLayouts)
    .filter(
      (layout) =>
        layout.measureIndex === snappedPosition.measureIndex &&
        Math.abs(layout.beat - snappedPosition.beat) <= BEAT_MATCH_EPSILON &&
        Math.abs(layout.x - position.x) <= RENDERED_COLUMN_SNAP_RADIUS,
    )
    .sort((a, b) => {
      const staffPriority =
        Number(b.staffId === position.staffId) -
        Number(a.staffId === position.staffId);

      if (staffPriority !== 0) {
        return staffPriority;
      }

      return Math.abs(a.x - position.x) - Math.abs(b.x - position.x);
    })[0];

  return nearbyEventLayout
    ? {
        ...snappedPosition,
        x: nearbyEventLayout.x,
      }
    : snappedPosition;
}

export function NotationOverlay({
  activeEventId,
  dots,
  duration,
  entryMode,
  eventLayouts = {},
  hoverPosition,
  inputCursor,
  isInputArmed = false,
  invalidMeasureKeys = [],
  onClearInteraction,
  onHoverPositionChange,
  onMoveEvent,
  onPlaceAtPosition,
  onDeleteEvent,
  onSelectEvent,
  playbackBeat,
  placementMode = 'place',
  score,
  selectedEventId,
  selectedPitchIndex,
  svgHeight,
}: NotationOverlayProps) {
  const [dragState, setDragState] = useState<{
    eventId: string;
    hasMoved: boolean;
    originPosition: MusicPosition | null;
    pitchIndex: number | null;
    previewPosition: MusicPosition | null;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const [deleteHoverEventId, setDeleteHoverEventId] = useState<string | null>(
    null,
  );
  const suppressNextPlaceRef = useRef(false);
  const staves = score.parts[0]?.staves ?? [];
  const staffGap = getScoreStaffGap(score);
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);
  const ariaLabel =
    score.type === 'grand' ? 'Grand staff notation system' : 'Treble staff notation system';
  const draggedEvent =
    dragState === null
      ? null
      : staves
          .flatMap((staff) => staff.measures)
          .flatMap((measure) => measure.voices)
          .flatMap((voice) => voice.events)
          .find((event) => event.id === dragState.eventId) ?? null;
  const snappedHoverPosition = hoverPosition
    ? snapPositionToInputGrid(
        hoverPosition,
        duration,
        dots,
        score,
        staffGap,
        eventLayouts,
      )
    : null;
  const shouldShowInputPreview =
    isInputArmed && !dragState && !deleteHoverEventId && !selectedEventId;
  const displayHoverPosition =
    shouldShowInputPreview && placementMode === 'insert' && snappedHoverPosition
      ? snapInsertPositionToEventBoundary(score, snappedHoverPosition)
      : shouldShowInputPreview
        ? snappedHoverPosition
        : null;

  function getEventMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const position = mapPointToMusicPosition(getSvgPoint(event, svgHeight), score);

    return position
      ? {
          ...position,
          clientX: event.clientX,
          clientY: event.clientY,
        }
      : null;
  }

  function getDragMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const point = getSvgPoint(event, svgHeight);

    if (!dragState?.originPosition) {
      const position = mapPointToMusicPosition(point, score);

      return position
        ? {
            ...position,
            clientX: event.clientX,
            clientY: event.clientY,
          }
        : null;
    }

    const origin = dragState.originPosition;
    const mappedPosition = mapPointToMusicPosition(
      {
        ...point,
        x: origin.x,
      },
      score,
    );
    const targetStaffIndex = mappedPosition?.staffIndex ?? origin.staffIndex;
    const staff = staves[targetStaffIndex];

    if (!staff) {
      return null;
    }

    const pitch = mapStaffYToPitch(point.y, staff.clef, targetStaffIndex, staffGap);
    const y = getPitchY(pitch, staff.clef, targetStaffIndex, staffGap);

    return {
      ...origin,
      clientX: event.clientX,
      clientY: event.clientY,
      pitch,
      staffId: staff.id,
      staffIndex: targetStaffIndex,
      y,
    };
  }

  return (
    <svg
      aria-label={ariaLabel}
      className="staff-renderer notation-overlay"
      data-testid="staff-renderer"
      role="img"
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      onMouseMove={(event) => {
        const position = getDragMusicPosition(event);

        if (dragState) {
          const movement = Math.hypot(
            event.clientX - dragState.startClientX,
            event.clientY - dragState.startClientY,
          );
          const hasMoved = dragState.hasMoved || movement > 3;

          setDragState({
            ...dragState,
            hasMoved,
            previewPosition: hasMoved ? position : dragState.previewPosition,
          });
          onHoverPositionChange?.(null);
          return;
        }

        onHoverPositionChange?.(
          isInputArmed && position
            ? snapPositionToInputGrid(
                position,
                duration,
                dots,
                score,
                staffGap,
                eventLayouts,
              )
            : null,
        );
      }}
      onMouseLeave={() => {
        setDragState(null);
        setDeleteHoverEventId(null);
        onHoverPositionChange?.(null);
      }}
      onMouseUp={(event) => {
        if (!dragState) {
          return;
        }

        const position = getDragMusicPosition(event);

        if (dragState.hasMoved && position) {
          suppressNextPlaceRef.current = true;
          if (dragState.pitchIndex !== null) {
            onMoveEvent?.(dragState.eventId, position, dragState.pitchIndex);
          } else {
            onMoveEvent?.(dragState.eventId, position);
          }
        }

        setDragState(null);
      }}
      onClick={(event) => {
        if (suppressNextPlaceRef.current) {
          suppressNextPlaceRef.current = false;
          return;
        }

        const position = getEventMusicPosition(event);
        const placementPosition = position
          ? snapPositionToInputGrid(
              position,
              duration,
              dots,
              score,
              staffGap,
              eventLayouts,
            )
          : null;

        if (isInputArmed && placementPosition) {
          onPlaceAtPosition?.(placementPosition);
        } else {
          onClearInteraction?.();
        }
      }}
    >
      <rect className="staff-page-bg" x={0} y={0} width={SVG_WIDTH} height={svgHeight} />
      <RhythmSlots
        inputCursor={inputCursor}
        isInputArmed={shouldShowInputPreview}
        score={score}
      />
      {!dragState && displayHoverPosition ? (
        <StaffHoverGuide
          position={displayHoverPosition}
          score={score}
          staffGap={staffGap}
        />
      ) : null}
      {score.type === 'grand' && staves.length > 1 ? (
        <line
          className="measure-guide"
          data-testid="grand-staff-connector"
          x1={STAFF_LEFT}
          x2={STAFF_LEFT}
          y1={getStaffTop(0, staffGap)}
          y2={getStaffTop(staves.length - 1, staffGap) + STAFF_LINE_SPACING * 4}
        />
      ) : null}
      {displayHoverPosition ? (
        <>
          {placementMode === 'insert' ? (
            <InsertionCursor
              position={displayHoverPosition}
              score={score}
              staffGap={staffGap}
            />
          ) : null}
          <GhostEvent
            dots={dots}
            duration={duration}
            entryMode={entryMode}
            position={displayHoverPosition}
            score={score}
            staffGap={staffGap}
          />
        </>
      ) : null}
      {staves.map((staff, staffIndex) => (
        <g key={staff.id} data-testid={`staff-${staff.id}`}>
          {staff.measures.map((measure) =>
            invalidMeasureKeySet.has(getMeasureKey(staff.id, measure.index)) ? (
              <InvalidMeasureWarning
                key={`invalid-${staff.id}-${measure.index}`}
                measureIndex={measure.index}
                staffGap={staffGap}
                staffId={staff.id}
                staffIndex={staffIndex}
              />
            ) : null,
          )}
          {Array.from(
            { length: staff.measures.length + 1 },
            (_, barlineIndex) => (
              <line
                key={barlineIndex}
                className="measure-guide"
                data-testid={`measure-barline-${staff.id}`}
                x1={getMeasureX(barlineIndex)}
                x2={getMeasureX(barlineIndex)}
                y1={getStaffTop(staffIndex, staffGap)}
                y2={getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 4}
              />
            ),
          )}
          {staff.measures.flatMap((measure) =>
            measure.voices[0]?.events.map((event) => (
              <EventHitTarget
                key={event.id}
                activeEventId={activeEventId}
                beatsPerMeasure={score.timeSignature.beats}
                event={event}
                eventLayout={eventLayouts[event.id]}
                isInputArmed={isInputArmed}
                measureIndex={measure.index}
                onDeleteEvent={onDeleteEvent}
                onDeleteHoverChange={setDeleteHoverEventId}
                onStartDrag={(eventId, pitchIndex, originPosition, dragEvent) =>
                  setDragState({
                    eventId,
                    hasMoved: false,
                    originPosition,
                    pitchIndex,
                    previewPosition: null,
                    startClientX: dragEvent.clientX,
                    startClientY: dragEvent.clientY,
                  })
                }
                onSelectEvent={onSelectEvent}
                placementMode={placementMode}
                selectedEventId={selectedEventId}
                selectedPitchIndex={selectedPitchIndex}
                staff={staff}
                staffGap={staffGap}
                staffIndex={staffIndex}
              />
            )),
          )}
        </g>
      ))}
      {playbackBeat !== null && playbackBeat !== undefined ? (
        <line
          className="playhead"
          data-testid="playhead"
          x1={getBeatX(
            Math.floor(playbackBeat / score.timeSignature.beats),
            playbackBeat % score.timeSignature.beats,
            score.timeSignature.beats,
          )}
          x2={getBeatX(
            Math.floor(playbackBeat / score.timeSignature.beats),
            playbackBeat % score.timeSignature.beats,
            score.timeSignature.beats,
          )}
          y1={getStaffTop(0, staffGap) - 24}
          y2={getStaffTop(staves.length - 1, staffGap) + STAFF_LINE_SPACING * 4 + 24}
        />
      ) : null}
      {dragState?.previewPosition && draggedEvent ? (
        <GhostEvent
          dots={getEventDots(draggedEvent)}
          duration={draggedEvent.duration}
          entryMode={draggedEvent.kind === 'rest' ? 'rest' : 'note'}
          position={dragState.previewPosition}
          score={score}
          staffGap={staffGap}
        />
      ) : null}
    </svg>
  );
}
