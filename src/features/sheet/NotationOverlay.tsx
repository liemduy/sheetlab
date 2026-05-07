import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
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
import { formatPitch, mapPointToMusicPosition } from './interaction';
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

interface NotationOverlayProps {
  activeEventId?: string | null;
  dots: number;
  duration: DurationValue;
  entryMode: EntryMode;
  hoverPosition?: MusicPosition | null;
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  onClearInteraction?: () => void;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  onMoveEvent?: (eventId: string, position: MusicPosition) => void;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  score: Score;
  selectedEventId?: string | null;
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

function EventHitTarget({
  activeEventId,
  beatsPerMeasure,
  event,
  measureIndex,
  onDeleteEvent,
  onDeleteHoverChange,
  onStartDrag,
  onSelectEvent,
  placementMode,
  selectedEventId,
  staff,
  staffGap,
  staffIndex,
}: {
  activeEventId?: string | null;
  beatsPerMeasure: number;
  event: ScoreEvent;
  measureIndex: number;
  onDeleteEvent?: (eventId: string) => void;
  onDeleteHoverChange: (eventId: string | null) => void;
  onStartDrag: (eventId: string, event: MouseEvent<SVGGElement>) => void;
  onSelectEvent?: (eventId: string) => void;
  placementMode: PlacementMode;
  selectedEventId?: string | null;
  staff: Staff;
  staffGap: number;
  staffIndex: number;
}) {
  const x = getBeatX(measureIndex, event.beat, beatsPerMeasure);
  const eventPitches = getEventPitches(event);
  const primaryPitch = getPrimaryEventPitch(event);
  const y =
    primaryPitch
      ? getPitchY(primaryPitch, staff.clef, staffIndex, staffGap)
      : getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 2;
  const label =
    event.kind === 'rest'
      ? `Rest measure ${measureIndex + 1} beat ${event.beat + 1}`
      : `${event.kind === 'chord' ? 'Chord' : 'Note'} ${formatEventPitchList(
          event,
          formatPitch,
        )} measure ${measureIndex + 1} beat ${
          event.beat + 1
        }`;
  const targetWidth = placementMode === 'insert' ? 16 : 28;
  const targetHeight = placementMode === 'insert' ? 30 : 40;

  if (isGeneratedRestEvent(event)) {
    return null;
  }

  return (
    <>
      <g
        aria-label={label}
        className={`score-event-hit${
          selectedEventId === event.id ? ' is-selected' : ''
        }${activeEventId === event.id ? ' is-playing' : ''}`}
        data-duration={event.duration}
        data-event-id={event.id}
        data-testid="score-event"
        role="button"
        tabIndex={0}
        onClick={(eventClick) => {
          eventClick.stopPropagation();
          onSelectEvent?.(event.id);
        }}
        onMouseDown={(eventMouseDown) => {
          eventMouseDown.stopPropagation();
          onSelectEvent?.(event.id);
          onStartDrag(event.id, eventMouseDown);
        }}
        onKeyDown={(eventKey) => {
          if (eventKey.key === 'Enter' || eventKey.key === ' ') {
            eventKey.preventDefault();
            onSelectEvent?.(event.id);
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
        {selectedEventId === event.id || activeEventId === event.id ? (
          <ellipse className="score-event-ring" cx={x} cy={y} rx={14} ry={11} />
        ) : null}
      </g>
      {selectedEventId === event.id ? (
        <g
          aria-label={`Delete ${label}`}
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
            onDeleteEvent?.(event.id);
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
              onDeleteEvent?.(event.id);
            }
          }}
        >
          <circle
            className="score-event-delete-target"
            cx={x + 22}
            cy={y - 24}
            r={18}
          />
          <circle className="score-event-delete-bg" cx={x + 22} cy={y - 24} r={9} />
          <path
            className="score-event-delete-mark"
            d={`M ${x + 18} ${y - 28} L ${x + 26} ${y - 20} M ${x + 26} ${
              y - 28
            } L ${x + 18} ${y - 20}`}
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

  const x = getBeatX(
    position.measureIndex,
    position.beat,
    score.timeSignature.beats,
  );
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

  const staves = score.parts[0]?.staves ?? [];
  const shouldRenderSharedColumns = score.type === 'grand' && staves.length > 1;
  const staffGap = getScoreStaffGap(score);
  const sharedColumnRange = getTimelineYRange(score, 0, staffGap);
  const x = getBeatX(
    inputCursor.measureIndex,
    inputCursor.beat,
    score.timeSignature.beats,
  );
  const y =
    getStaffTop(inputCursor.staffIndex, staffGap) + STAFF_LINE_SPACING * 2;

  return (
    <g className="rhythm-slots" data-testid="rhythm-slots">
      {shouldRenderSharedColumns ? (
        <g className="timeline-columns" data-testid="timeline-columns">
          <line
            className="timeline-column is-active"
            data-beat={inputCursor.beat}
            data-measure-index={inputCursor.measureIndex}
            data-testid="timeline-column"
            x1={x}
            x2={x}
            y1={sharedColumnRange.y1}
            y2={sharedColumnRange.y2}
          />
        </g>
      ) : null}
      <rect
        className="rhythm-slot is-active"
        data-beat={inputCursor.beat}
        data-measure-index={inputCursor.measureIndex}
        data-staff-id={inputCursor.staffId}
        data-testid="rhythm-slot"
        height={3}
        rx={1.5}
        width={10}
        x={x - 5}
        y={y - 1.5}
      />
    </g>
  );
}

function ActiveInputCursor({
  cursor,
  score,
  staffGap,
}: {
  cursor?: InputCursor | null;
  score: Score;
  staffGap: number;
}) {
  if (!cursor) {
    return null;
  }

  const staff = score.parts[0]?.staves[cursor.staffIndex];

  if (!staff) {
    return null;
  }

  const x = getBeatX(
    cursor.measureIndex,
    cursor.beat,
    score.timeSignature.beats,
  );
  const yRange = getTimelineYRange(score, cursor.staffIndex, staffGap);
  return (
    <g
      className={`active-input-cursor active-input-cursor-${cursor.mode}`}
      data-beat={cursor.beat}
      data-measure-index={cursor.measureIndex}
      data-staff-id={cursor.staffId}
      data-testid="active-input-cursor"
    >
      <line
        className="active-input-cursor-line"
        data-testid="active-input-cursor-line"
        x1={x}
        x2={x}
        y1={yRange.y1}
        y2={yRange.y2}
      />
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
) {
  return (
    inputCursorToMusicPosition(
      createInputCursorFromPosition(
        position,
        duration,
        'note-input',
        score.timeSignature.beats,
        dots,
      ),
      score,
      staffGap,
    ) ?? position
  );
}

export function NotationOverlay({
  activeEventId,
  dots,
  duration,
  entryMode,
  hoverPosition,
  inputCursor,
  isInputArmed = false,
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
  svgHeight,
}: NotationOverlayProps) {
  const [dragState, setDragState] = useState<{
    eventId: string;
    hasMoved: boolean;
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
    ? snapPositionToInputGrid(hoverPosition, duration, dots, score, staffGap)
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
    return mapPointToMusicPosition(getSvgPoint(event, svgHeight), score);
  }

  return (
    <svg
      aria-label={ariaLabel}
      className="staff-renderer notation-overlay"
      data-testid="staff-renderer"
      role="img"
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      onMouseMove={(event) => {
        const position = getEventMusicPosition(event);

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

        onHoverPositionChange?.(isInputArmed ? position : null);
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

        const position = getEventMusicPosition(event);

        if (dragState.hasMoved && position) {
          suppressNextPlaceRef.current = true;
          onMoveEvent?.(dragState.eventId, position);
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
          ? snapPositionToInputGrid(position, duration, dots, score, staffGap)
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
        isInputArmed={isInputArmed}
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
      {shouldShowInputPreview ? (
        <ActiveInputCursor cursor={inputCursor} score={score} staffGap={staffGap} />
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
                measureIndex={measure.index}
                onDeleteEvent={onDeleteEvent}
                onDeleteHoverChange={setDeleteHoverEventId}
                onStartDrag={(eventId, dragEvent) =>
                  setDragState({
                    eventId,
                    hasMoved: false,
                    previewPosition: null,
                    startClientX: dragEvent.clientX,
                    startClientY: dragEvent.clientY,
                  })
                }
                onSelectEvent={onSelectEvent}
                placementMode={placementMode}
                selectedEventId={selectedEventId}
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
