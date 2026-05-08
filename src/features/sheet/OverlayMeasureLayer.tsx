import type { Score, Staff, StaffId } from '../../domain/score/types';
import { getMeasureKey } from './measureKey';
import {
  STAFF_LINE_SPACING,
  getMeasureRight,
  getMeasureWidth,
  getMeasureX,
  getStaffTop,
} from './layout';

export function InvalidMeasureWarning({
  measureIndex,
  score,
  staffId,
  staffIndex,
  staffGap,
  systemGap,
}: {
  measureIndex: number;
  score: Score;
  staffId: Staff['id'];
  staffIndex: number;
  staffGap: number;
  systemGap: number;
}) {
  const x1 = getMeasureX(measureIndex, score);
  const x2 = getMeasureRight(measureIndex, score);
  const staffTop = getStaffTop(staffIndex, staffGap, measureIndex, systemGap);

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

export function MeasureHitTarget({
  isInputArmed,
  isSelected,
  measureIndex,
  onMeasureContextMenu,
  onSelectMeasure,
  score,
  staff,
  staffGap,
  staffIndex,
  systemGap,
}: {
  isInputArmed?: boolean;
  isSelected: boolean;
  measureIndex: number;
  onMeasureContextMenu?: (
    staffId: StaffId,
    measureIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  onSelectMeasure?: (staffId: StaffId, measureIndex: number) => void;
  score: Score;
  staff: Staff;
  staffGap: number;
  staffIndex: number;
  systemGap: number;
}) {
  const x = getMeasureX(measureIndex, score);
  const y = getStaffTop(staffIndex, staffGap, measureIndex, systemGap) - 7;
  const height = STAFF_LINE_SPACING * 4 + 14;
  const width = getMeasureWidth(measureIndex, score);
  const label = `Measure ${measureIndex + 1} ${staff.id}`;

  function selectMeasure() {
    onSelectMeasure?.(staff.id, measureIndex);
  }

  return (
    <g
      aria-label={label}
      className={`measure-hit${isSelected ? ' is-selected' : ''}${
        isInputArmed ? ' is-input-armed' : ''
      }`}
      data-measure-index={measureIndex}
      data-staff-id={staff.id}
      data-testid="measure-hit-target"
      pointerEvents={isInputArmed ? 'none' : undefined}
      role="button"
      tabIndex={0}
      onClick={(eventClick) => {
        eventClick.stopPropagation();
        selectMeasure();
      }}
      onContextMenu={(contextMenuEvent) => {
        contextMenuEvent.preventDefault();
        contextMenuEvent.stopPropagation();
        onMeasureContextMenu?.(
          staff.id,
          measureIndex,
          contextMenuEvent.clientX,
          contextMenuEvent.clientY,
        );
      }}
      onKeyDown={(eventKey) => {
        if (eventKey.key === 'Enter' || eventKey.key === ' ') {
          eventKey.preventDefault();
          eventKey.stopPropagation();
          selectMeasure();
        }
      }}
    >
      {isSelected ? (
        <rect
          className="measure-selection"
          data-measure-key={getMeasureKey(staff.id, measureIndex)}
          data-testid="selected-measure"
          height={height}
          rx={4}
          width={width}
          x={x}
          y={y}
        />
      ) : null}
      <rect
        className="measure-hit-target"
        height={height}
        rx={4}
        width={width}
        x={x}
        y={y}
      />
    </g>
  );
}
