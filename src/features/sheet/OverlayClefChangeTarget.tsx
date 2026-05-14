import type { MouseEvent } from 'react';
import type { Clef, Score, StaffId } from '../../domain/score/types';
import { getMeasureClefChanges } from '../../domain/score/clefChanges';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  STAFF_LINE_SPACING,
  getLocalMeasureIndex,
  getMeasureX,
  getScoreStaffTop,
} from './layout';
import { getBeatX } from './notationGeometry';
import type { RenderedEventLayout } from './renderedEventLayout';
import { findRenderedEventLayoutAtBeat } from './renderedEventTargets';

export interface ClefChangeTargetLayout {
  beat: number;
  clef: Clef;
  id: string;
  isSystemStart: boolean;
  measureIndex: number;
  staffId: StaffId;
  staffIndex: number;
  x: number;
  y: number;
}

const BEAT_EPSILON = 0.0001;
const SYSTEM_START_CLEF_TARGET_X_OFFSET = 24;

function isSystemStartClefChange(score: Score, measureIndex: number, beat: number) {
  return (
    getLocalMeasureIndex(measureIndex, score) === 0 &&
    Math.abs(beat) <= BEAT_EPSILON
  );
}

export function getClefChangeTargetLayouts({
  eventLayouts,
  score,
}: {
  eventLayouts: Record<string, RenderedEventLayout>;
  score: Score;
}): ClefChangeTargetLayout[] {
  const staves = score.parts[0]?.staves ?? [];
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  return staves.flatMap((staff, staffIndex) =>
    staff.measures.flatMap((measure) =>
      getMeasureClefChanges(score, staff.id, measure.index).map((change) => {
        const isSystemStart = isSystemStartClefChange(
          score,
          measure.index,
          change.beat,
        );
        const fallbackX = getBeatX(
          measure.index,
          change.beat,
          beatsPerMeasure,
          score,
        );
        const x = isSystemStart
          ? getMeasureX(measure.index, score) + SYSTEM_START_CLEF_TARGET_X_OFFSET
          : (findRenderedEventLayoutAtBeat({
              beat: change.beat,
              eventLayouts,
              measureIndex: measure.index,
              staffId: staff.id,
            })?.x ?? fallbackX);

        return {
          beat: change.beat,
          clef: change.clef,
          id: change.id,
          isSystemStart,
          measureIndex: measure.index,
          staffId: staff.id,
          staffIndex,
          x,
          y:
            getScoreStaffTop(score, staffIndex, measure.index) +
            STAFF_LINE_SPACING * 2,
        };
      }),
    ),
  );
}

export function ClefChangeTarget({
  isInputArmed = false,
  isSelected = false,
  layout,
  onSelect,
  onStartDrag,
}: {
  isInputArmed?: boolean;
  isSelected?: boolean;
  layout: ClefChangeTargetLayout;
  onSelect?: (layout: ClefChangeTargetLayout) => void;
  onStartDrag?: (
    layout: ClefChangeTargetLayout,
    event: MouseEvent<SVGGElement>,
  ) => void;
}) {
  const label = `${layout.clef} clef change measure ${
    layout.measureIndex + 1
  } beat ${layout.beat + 1} ${layout.staffId}`;
  const targetHeight = layout.isSystemStart ? 68 : 54;
  const targetWidth = layout.isSystemStart ? 44 : 34;

  return (
    <g
      aria-label={label}
      className={`clef-change-hit${isSelected ? ' is-selected' : ''}${
        isInputArmed ? ' is-input-armed' : ''
      }`}
      data-beat={layout.beat}
      data-clef={layout.clef}
      data-clef-change-id={layout.id}
      data-measure-index={layout.measureIndex}
      data-staff-id={layout.staffId}
      data-system-start={layout.isSystemStart ? 'true' : undefined}
      data-testid="clef-change-target"
      pointerEvents={isInputArmed ? 'none' : undefined}
      role="button"
      tabIndex={0}
      onClick={(eventClick) => {
        eventClick.preventDefault();
        eventClick.stopPropagation();
        onSelect?.(layout);
      }}
      onMouseDown={(eventMouseDown) => {
        eventMouseDown.preventDefault();
        eventMouseDown.stopPropagation();
        onSelect?.(layout);
        onStartDrag?.(layout, eventMouseDown);
      }}
      onKeyDown={(eventKey) => {
        if (eventKey.key === 'Enter' || eventKey.key === ' ') {
          eventKey.preventDefault();
          eventKey.stopPropagation();
          onSelect?.(layout);
        }
      }}
    >
      <rect
        className="clef-change-target"
        height={targetHeight}
        rx={5}
        width={targetWidth}
        x={layout.x - targetWidth / 2}
        y={layout.y - targetHeight / 2}
      />
    </g>
  );
}
