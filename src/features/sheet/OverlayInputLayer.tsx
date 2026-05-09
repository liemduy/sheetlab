import type { Score } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { EntryMode } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import type { MusicPosition } from './interaction';
import {
  DEFAULT_INPUT_SLOT_WIDTH,
  getInputSlotLayout,
} from './inputSlotLayout';
import {
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  getScoreSystemGap,
  getStaffRight,
  getStaffTop,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { NoteGlyph, RestGlyph } from './notationGlyph';
import type { RenderedEventLayout } from './renderedEventLayout';

export function GhostEvent({
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

  const systemGap = getScoreSystemGap(score);
  const x = position.x;
  const noteY = getPitchY(
    position.pitch,
    staff.clef,
    position.staffIndex,
    staffGap,
    position.measureIndex,
    systemGap,
  );
  const restY =
    getStaffTop(position.staffIndex, staffGap, position.measureIndex, systemGap) +
    STAFF_LINE_SPACING * 2;

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
          measureIndex={position.measureIndex}
          pitch={position.pitch}
          staffGap={staffGap}
          staffIndex={position.staffIndex}
          systemGap={systemGap}
          variant="ghost"
          x={x}
          y={noteY}
        />
      ) : (
        <RestGlyph
          duration={duration}
          dots={dots}
          measureIndex={position.measureIndex}
          staffGap={staffGap}
          staffIndex={position.staffIndex}
          systemGap={systemGap}
          variant="ghost"
          x={x}
          y={restY}
        />
      )}
    </g>
  );
}

export function InsertionCursor({
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
    getMeasureBeats(score.timeSignature),
    score,
  );
  const yRange = getTimelineYRange(
    score,
    position.staffIndex,
    staffGap,
    position.measureIndex,
  );

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

function getTimelineYRange(
  score: Score,
  staffIndex: number,
  staffGap: number,
  measureIndex: number,
) {
  const staves = score.parts[0]?.staves ?? [];
  const systemGap = getScoreSystemGap(score);

  if (score.type === 'grand' && staves.length > 1) {
    return {
      y1: getStaffTop(0, staffGap, measureIndex, systemGap) - 36,
      y2:
        getStaffTop(staves.length - 1, staffGap, measureIndex, systemGap) +
        STAFF_LINE_SPACING * 4 +
        36,
    };
  }

  return {
    y1: getStaffTop(staffIndex, staffGap, measureIndex, systemGap) - 36,
    y2:
      getStaffTop(staffIndex, staffGap, measureIndex, systemGap) +
      STAFF_LINE_SPACING * 4 +
      36,
  };
}

export function StaffHoverGuide({
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

  const systemGap = getScoreSystemGap(score);
  const staffTop = getStaffTop(
    position.staffIndex,
    staffGap,
    position.measureIndex,
    systemGap,
  );
  const measureCount = staff.measures.length;
  const staffRight = getStaffRight(measureCount, position.measureIndex, score);
  const guideWidth = DEFAULT_INPUT_SLOT_WIDTH;
  const guideX = Math.min(
    Math.max(STAFF_LEFT, position.x - guideWidth / 2),
    Math.max(STAFF_LEFT, staffRight - guideWidth),
  );

  return (
    <g
      className="staff-hover-guide"
      data-staff-id={staff.id}
      data-testid="staff-hover-guide"
    >
      <rect
        height={STAFF_LINE_SPACING * 4 + 34}
        rx={8}
        width={guideWidth}
        x={guideX}
        y={staffTop - 17}
      />
    </g>
  );
}

export function RhythmSlots({
  entryMode,
  eventLayouts,
  inputCursor,
  isInputArmed,
  score,
  voiceIndex = 0,
}: {
  entryMode: EntryMode;
  eventLayouts?: Record<string, RenderedEventLayout>;
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  score: Score;
  voiceIndex?: number;
}) {
  if (!isInputArmed || !inputCursor) {
    return null;
  }

  const slotLayout = getInputSlotLayout({
    cursor: inputCursor,
    eventLayouts,
    includePitchPreview: entryMode === 'note',
    score,
    voiceIndex,
  });

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
          data-layout-source={slotLayout.layoutSource}
          data-measure-index={inputCursor.measureIndex}
          data-slot-center-x={slotLayout.centerX}
          data-slot-end-beat={slotLayout.slotEndBeat}
          data-staff-id={inputCursor.staffId}
          data-voice-index={voiceIndex}
          data-testid="rhythm-slot"
          height={slotLayout.height}
          rx={7}
          width={slotLayout.boxWidth}
          x={slotLayout.boxX}
          y={slotLayout.y}
        />
      </g>
    </g>
  );
}
