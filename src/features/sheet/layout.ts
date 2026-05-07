export const STAFF_LEFT = 76;
export const STAFF_RIGHT = 884;
export const STAFF_LINE_SPACING = 11;
export const STAFF_GAP = 132;
export const MEASURE_WIDTH = 202;
export const MEASURE_LEFT_PADDING = 20;
export const FIRST_MEASURE_LEFT_PADDING = 78;
export const MEASURE_RIGHT_PADDING = 20;
export const FIRST_STAFF_Y = 118;
export const SVG_WIDTH = 920;
export const VEXFLOW_STAVE_TOP_LINE_OFFSET = 44.5;

export function getStaffTop(staffIndex: number) {
  return FIRST_STAFF_Y + staffIndex * STAFF_GAP;
}

export function getMeasureX(measureIndex: number) {
  return STAFF_LEFT + measureIndex * MEASURE_WIDTH;
}

export function getMeasureRight(measureIndex: number) {
  return getMeasureX(measureIndex) + MEASURE_WIDTH;
}

export function getMeasureContentLeft(measureIndex: number) {
  return (
    getMeasureX(measureIndex) +
    (measureIndex === 0 ? FIRST_MEASURE_LEFT_PADDING : MEASURE_LEFT_PADDING)
  );
}

export function getMeasureContentRight(measureIndex: number) {
  return getMeasureRight(measureIndex) - MEASURE_RIGHT_PADDING;
}

export function getMeasureContentWidth(measureIndex: number) {
  return getMeasureContentRight(measureIndex) - getMeasureContentLeft(measureIndex);
}

export function getStaffRight(measureCount: number) {
  return STAFF_LEFT + measureCount * MEASURE_WIDTH;
}

export function getScoreSvgHeight(scoreType: 'treble' | 'grand') {
  return scoreType === 'grand' ? 420 : 280;
}
