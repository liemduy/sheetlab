import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { getInputSlotBeats } from '../editor/inputCursor';
import { formatPitch, mapPointToMusicPosition } from './interaction';
import type { MusicPosition } from './interaction';
import {
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  getMeasureX,
  getStaffRight,
  getStaffTop,
} from './layout';
import { snapInsertPositionToEventBoundary } from './insertPosition';
import { getBeatX, getPitchY } from './notationGeometry';
import { NoteGlyph, RestGlyph } from './notationGlyph';

interface NotationOverlayProps {
  activeEventId?: string | null;
  duration: DurationValue;
  entryMode: EntryMode;
  hoverPosition?: MusicPosition | null;
  inputCursor?: InputCursor | null;
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
  onStartDrag,
  onSelectEvent,
  placementMode,
  selectedEventId,
  staff,
  staffIndex,
}: {
  activeEventId?: string | null;
  beatsPerMeasure: number;
  event: ScoreEvent;
  measureIndex: number;
  onDeleteEvent?: (eventId: string) => void;
  onStartDrag: (eventId: string, event: MouseEvent<SVGGElement>) => void;
  onSelectEvent?: (eventId: string) => void;
  placementMode: PlacementMode;
  selectedEventId?: string | null;
  staff: Staff;
  staffIndex: number;
}) {
  const x = getBeatX(measureIndex, event.beat, beatsPerMeasure);
  const y =
    event.kind === 'note'
      ? getPitchY(event.pitch, staff.clef, staffIndex)
      : getStaffTop(staffIndex) + STAFF_LINE_SPACING * 2;
  const label =
    event.kind === 'note'
      ? `Note ${formatPitch(event.pitch)} measure ${measureIndex + 1} beat ${
          event.beat + 1
        }`
      : `Rest measure ${measureIndex + 1} beat ${event.beat + 1}`;
  const targetWidth = placementMode === 'insert' ? 16 : 28;
  const targetHeight = placementMode === 'insert' ? 30 : 40;

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
        <g
          className="score-event-visual"
          data-event-id={event.id}
          data-testid="score-event-visual"
        >
          {event.kind === 'note' ? (
            <NoteGlyph
              duration={event.duration}
              pitch={event.pitch}
              staffIndex={staffIndex}
              variant="placed"
              x={x}
              y={y}
            />
          ) : (
            <RestGlyph
              duration={event.duration}
              variant="placed"
              x={x}
              y={y}
            />
          )}
        </g>
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
            onDeleteEvent?.(event.id);
          }}
          onClick={(deleteClick) => deleteClick.stopPropagation()}
          onKeyDown={(deleteKey) => {
            if (deleteKey.key === 'Enter' || deleteKey.key === ' ') {
              deleteKey.preventDefault();
              deleteKey.stopPropagation();
              onDeleteEvent?.(event.id);
            }
          }}
        >
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
  duration,
  entryMode,
  position,
  score,
}: {
  duration: DurationValue;
  entryMode: EntryMode;
  position: MusicPosition;
  score: Score;
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
  const noteY = getPitchY(position.pitch, staff.clef, position.staffIndex);
  const restY = getStaffTop(position.staffIndex) + STAFF_LINE_SPACING * 2;

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
          pitch={position.pitch}
          staffIndex={position.staffIndex}
          variant="ghost"
          x={x}
          y={noteY}
        />
      ) : (
        <RestGlyph duration={duration} variant="ghost" x={x} y={restY} />
      )}
    </g>
  );
}

function InsertionCursor({
  position,
  score,
}: {
  position: MusicPosition;
  score: Score;
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
  const staffTop = getStaffTop(position.staffIndex);

  return (
    <line
      className="insertion-cursor"
      data-testid="insertion-cursor"
      x1={x}
      x2={x}
      y1={staffTop - 28}
      y2={staffTop + STAFF_LINE_SPACING * 4 + 28}
    />
  );
}

function StaffHoverGuide({
  position,
  score,
}: {
  position: MusicPosition;
  score: Score;
}) {
  const staff = score.parts[0]?.staves[position.staffIndex];

  if (!staff) {
    return null;
  }

  const staffTop = getStaffTop(position.staffIndex);
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
      <text x={STAFF_LEFT - 58} y={staffTop + STAFF_LINE_SPACING * 2 + 4}>
        {staff.clef === 'treble' ? 'Treble' : 'Bass'}
      </text>
    </g>
  );
}

function RhythmSlots({
  duration,
  inputCursor,
  score,
}: {
  duration: DurationValue;
  inputCursor?: InputCursor | null;
  score: Score;
}) {
  const beats = getInputSlotBeats(duration, score.timeSignature.beats);
  const staves = score.parts[0]?.staves ?? [];

  return (
    <g className="rhythm-slots" data-testid="rhythm-slots">
      {staves.flatMap((staff, staffIndex) =>
        staff.measures.flatMap((measure) =>
          beats.map((beat) => {
            const isActive =
              inputCursor?.staffId === staff.id &&
              inputCursor.measureIndex === measure.index &&
              inputCursor.beat === beat;
            const x = getBeatX(measure.index, beat, score.timeSignature.beats);
            const y = getStaffTop(staffIndex) + STAFF_LINE_SPACING * 2;

            return (
              <rect
                key={`${staff.id}-${measure.index}-${beat}`}
                className={`rhythm-slot${isActive ? ' is-active' : ''}`}
                data-beat={beat}
                data-measure-index={measure.index}
                data-staff-id={staff.id}
                data-testid="rhythm-slot"
                height={4}
                rx={1.6}
                width={12}
                x={x - 6}
                y={y - 2}
              />
            );
          }),
        ),
      )}
    </g>
  );
}

function ActiveInputCursor({
  cursor,
  score,
}: {
  cursor?: InputCursor | null;
  score: Score;
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
  const staffTop = getStaffTop(cursor.staffIndex);
  const pitchY = getPitchY(cursor.pitchPreview, staff.clef, cursor.staffIndex);

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
        y1={staffTop - 36}
        y2={staffTop + STAFF_LINE_SPACING * 4 + 36}
      />
      <rect
        className="active-input-cursor-note-box"
        data-testid="active-input-cursor-note-box"
        height={28}
        rx={7}
        width={32}
        x={x - 16}
        y={pitchY - 14}
      />
    </g>
  );
}

export function NotationOverlay({
  activeEventId,
  duration,
  entryMode,
  hoverPosition,
  inputCursor,
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
  const suppressNextPlaceRef = useRef(false);
  const staves = score.parts[0]?.staves ?? [];
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
  const displayHoverPosition =
    placementMode === 'insert' && hoverPosition
      ? snapInsertPositionToEventBoundary(score, hoverPosition)
      : hoverPosition;

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

        onHoverPositionChange?.(position);
      }}
      onMouseLeave={() => {
        setDragState(null);
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

        if (position) {
          onPlaceAtPosition?.(position);
        }
      }}
    >
      <rect className="staff-page-bg" x={0} y={0} width={SVG_WIDTH} height={svgHeight} />
      <RhythmSlots duration={duration} inputCursor={inputCursor} score={score} />
      {!dragState && displayHoverPosition ? (
        <StaffHoverGuide position={displayHoverPosition} score={score} />
      ) : null}
      {score.type === 'grand' && staves.length > 1 ? (
        <line
          className="measure-guide"
          data-testid="grand-staff-connector"
          x1={STAFF_LEFT}
          x2={STAFF_LEFT}
          y1={getStaffTop(0)}
          y2={getStaffTop(staves.length - 1) + STAFF_LINE_SPACING * 4}
        />
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
                y1={getStaffTop(staffIndex)}
                y2={getStaffTop(staffIndex) + STAFF_LINE_SPACING * 4}
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
          y1={getStaffTop(0) - 24}
          y2={getStaffTop(staves.length - 1) + STAFF_LINE_SPACING * 4 + 24}
        />
      ) : null}
      {!dragState ? <ActiveInputCursor cursor={inputCursor} score={score} /> : null}
      {!dragState && displayHoverPosition ? (
        <>
          {placementMode === 'insert' ? (
            <InsertionCursor position={displayHoverPosition} score={score} />
          ) : null}
          <GhostEvent
            duration={duration}
            entryMode={entryMode}
            position={displayHoverPosition}
            score={score}
          />
        </>
      ) : null}
      {dragState?.previewPosition && draggedEvent ? (
        <GhostEvent
          duration={draggedEvent.duration}
          entryMode={draggedEvent.kind}
          position={dragState.previewPosition}
          score={score}
        />
      ) : null}
    </svg>
  );
}
