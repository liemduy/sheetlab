import type { MouseEvent } from 'react';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import {
  formatEventPitchList,
  getEventPitches,
  getPrimaryEventPitch,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import type { EntryMode } from '../editor/editorState';
import { formatPitch, mapPointToMusicPosition } from './interaction';
import type { MusicPosition } from './interaction';
import {
  MEASURE_WIDTH,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  STAFF_RIGHT,
  SVG_WIDTH,
  getScoreSvgHeight,
  getStaffTop,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { ChordGlyph, NoteGlyph, RestGlyph } from './notationGlyph';

interface StaffRendererProps {
  score: Score;
  hoverPosition?: MusicPosition | null;
  entryMode?: EntryMode;
  duration?: DurationValue;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string) => void;
  selectedEventId?: string | null;
  activeEventId?: string | null;
  playbackBeat?: number | null;
}

function getClefLabel(staff: Staff) {
  return staff.clef === 'treble'
    ? String.fromCodePoint(0x1d11e)
    : String.fromCodePoint(0x1d122);
}

function EventGlyph({
  beatsPerMeasure,
  event,
  measureIndex,
  onSelectEvent,
  activeEventId,
  selectedEventId,
  staff,
  staffIndex,
}: {
  beatsPerMeasure: number;
  event: ScoreEvent;
  measureIndex: number;
  onSelectEvent?: (eventId: string) => void;
  activeEventId?: string | null;
  selectedEventId?: string | null;
  staff: Staff;
  staffIndex: number;
}) {
  const x = getBeatX(measureIndex, event.beat, beatsPerMeasure);
  const eventPitches = getEventPitches(event);
  const primaryPitch = getPrimaryEventPitch(event);
  const y =
    primaryPitch
      ? getPitchY(primaryPitch, staff.clef, staffIndex)
      : getStaffTop(staffIndex) + STAFF_LINE_SPACING * 2;
  const label =
    event.kind === 'rest'
      ? `Rest measure ${measureIndex + 1} beat ${event.beat + 1}`
      : `${event.kind === 'chord' ? 'Chord' : 'Note'} ${formatEventPitchList(
          event,
          formatPitch,
        )} measure ${measureIndex + 1} beat ${
          event.beat + 1
        }`;
  const visual =
    eventPitches.length > 1 ? (
      <ChordGlyph
        duration={event.duration}
        notes={eventPitches.map((pitch) => ({
          pitch,
          y: getPitchY(pitch, staff.clef, staffIndex),
        }))}
        staffIndex={staffIndex}
        variant="placed"
        x={x}
      />
    ) : eventPitches.length === 1 ? (
      <NoteGlyph
        duration={event.duration}
        pitch={eventPitches[0]}
        staffIndex={staffIndex}
        variant="placed"
        x={x}
        y={getPitchY(eventPitches[0], staff.clef, staffIndex)}
      />
    ) : (
      <RestGlyph duration={event.duration} variant="placed" x={x} y={y} />
    );

  if (isGeneratedRestEvent(event)) {
    return (
      <g
        aria-label={label}
        className="score-filler-rest"
        data-duration={event.duration}
        data-event-id={event.id}
        data-testid="score-filler-rest"
      >
        {visual}
      </g>
    );
  }

  return (
    <g
      className={`score-event${selectedEventId === event.id ? ' is-selected' : ''}${
        activeEventId === event.id ? ' is-playing' : ''
      }`}
      data-duration={event.duration}
      data-event-id={event.id}
      data-testid="score-event"
      aria-label={label}
      role="button"
      tabIndex={0}
      onClick={(eventClick) => {
        eventClick.stopPropagation();
        onSelectEvent?.(event.id);
      }}
      onKeyDown={(eventKey) => {
        if (eventKey.key === 'Enter' || eventKey.key === ' ') {
          eventKey.preventDefault();
          onSelectEvent?.(event.id);
        }
      }}
    >
      {visual}
    </g>
  );
}

function StaffLines({
  beatsPerMeasure,
  onSelectEvent,
  activeEventId,
  selectedEventId,
  staff,
  staffIndex,
}: {
  beatsPerMeasure: number;
  onSelectEvent?: (eventId: string) => void;
  activeEventId?: string | null;
  selectedEventId?: string | null;
  staff: Staff;
  staffIndex: number;
}) {
  const staffTop = getStaffTop(staffIndex);
  const measureCount = staff.measures.length;

  return (
    <g data-testid={`staff-${staff.id}`}>
      <text
        className="staff-clef"
        x={66}
        y={staffTop + STAFF_LINE_SPACING * 3.6}
        aria-label={`${staff.clef} clef`}
      >
        {getClefLabel(staff)}
      </text>
      <text className="time-signature" x={91} y={staffTop + 16}>
        4
      </text>
      <text className="time-signature" x={91} y={staffTop + 34}>
        4
      </text>

      {Array.from({ length: 5 }, (_, lineIndex) => {
        const y = staffTop + lineIndex * STAFF_LINE_SPACING;

        return (
          <line
            key={lineIndex}
            className="staff-line"
            x1={STAFF_LEFT}
            x2={STAFF_RIGHT}
            y1={y}
            y2={y}
          />
        );
      })}

      {Array.from({ length: measureCount + 1 }, (_, barlineIndex) => {
        const x = STAFF_LEFT + barlineIndex * MEASURE_WIDTH;

        return (
          <line
            key={barlineIndex}
            className="barline"
            data-testid={`measure-barline-${staff.id}`}
            x1={x}
            x2={x}
            y1={staffTop}
            y2={staffTop + STAFF_LINE_SPACING * 4}
          />
        );
      })}

      {staff.measures.flatMap((measure) =>
        measure.voices[0]?.events.map((event) => (
          <EventGlyph
            key={event.id}
            beatsPerMeasure={beatsPerMeasure}
            event={event}
            measureIndex={measure.index}
            onSelectEvent={onSelectEvent}
            activeEventId={activeEventId}
            selectedEventId={selectedEventId}
            staff={staff}
            staffIndex={staffIndex}
          />
        )),
      )}
    </g>
  );
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
  const y = getPitchY(position.pitch, staff.clef, position.staffIndex);

  return (
    <g
      className="ghost-event"
      data-testid="ghost-event"
      data-duration={duration}
      data-entry-mode={entryMode}
      aria-label={`Ghost ${entryMode}`}
    >
      {entryMode === 'note' ? (
        <>
          <ellipse cx={x} cy={y} rx={8.5} ry={6} />
          {duration !== 'whole' ? (
            <line x1={x + 8} x2={x + 8} y1={y} y2={y - 38} />
          ) : null}
        </>
      ) : (
        <rect x={x - 8} y={y - 5} width={16} height={10} rx={2} />
      )}
    </g>
  );
}

export function SimpleStaffRenderer({
  duration = 'quarter',
  entryMode = 'note',
  hoverPosition,
  selectedEventId,
  activeEventId,
  playbackBeat,
  score,
  onHoverPositionChange,
  onPlaceAtPosition,
  onSelectEvent,
}: StaffRendererProps) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score.type);
  const ariaLabel =
    score.type === 'grand' ? 'Empty grand staff system' : 'Empty treble staff system';

  return (
    <svg
      className="staff-renderer"
      role="img"
      aria-label={ariaLabel}
      data-testid="staff-renderer"
      viewBox={`0 0 ${SVG_WIDTH} ${height}`}
      onMouseMove={(event) =>
        onHoverPositionChange?.(
          mapPointToMusicPosition(getSvgPoint(event, height), score),
        )
      }
      onMouseLeave={() => onHoverPositionChange?.(null)}
      onClick={(event) => {
        const position = mapPointToMusicPosition(getSvgPoint(event, height), score);

        if (position) {
          onPlaceAtPosition?.(position);
        }
      }}
    >
      <rect className="staff-page-bg" x={0} y={0} width={SVG_WIDTH} height={height} />
      {score.type === 'grand' ? (
        <g className="grand-connector" data-testid="grand-staff-connector">
          <path d="M 56 90 C 30 104 30 156 56 170 C 30 184 30 236 56 250" />
          <line
            x1={70}
            x2={70}
            y1={getStaffTop(0)}
            y2={getStaffTop(staves.length - 1) + STAFF_LINE_SPACING * 4}
          />
        </g>
      ) : null}
      {staves.map((staff, staffIndex) => (
        <StaffLines
          key={staff.id}
          activeEventId={activeEventId}
          beatsPerMeasure={score.timeSignature.beats}
          onSelectEvent={onSelectEvent}
          selectedEventId={selectedEventId}
          staff={staff}
          staffIndex={staffIndex}
        />
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
      {hoverPosition ? (
        <GhostEvent
          duration={duration}
          entryMode={entryMode}
          position={hoverPosition}
          score={score}
        />
      ) : null}
    </svg>
  );
}
