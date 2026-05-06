import type { DurationValue, Pitch } from '../../domain/score/types';
import { STAFF_LINE_SPACING, getStaffTop } from './layout';

type NotationGlyphVariant = 'ghost' | 'placed';

interface NoteGlyphProps {
  duration: DurationValue;
  pitch: Pitch;
  staffIndex: number;
  variant: NotationGlyphVariant;
  x: number;
  y: number;
}

interface RestGlyphProps {
  duration: DurationValue;
  variant: NotationGlyphVariant;
  x: number;
  y: number;
}

const NOTEHEAD_RX = 7.8;
const NOTEHEAD_RY = 5.2;
const STEM_LENGTH = 38;
const LEDGER_HALF_WIDTH = 14;
const LEDGER_EPSILON = 0.01;

export function getLedgerLineYs(y: number, staffIndex: number) {
  const staffTop = getStaffTop(staffIndex);
  const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
  const ledgerLineYs: number[] = [];

  for (
    let lineY = staffTop - STAFF_LINE_SPACING;
    lineY >= y - LEDGER_EPSILON;
    lineY -= STAFF_LINE_SPACING
  ) {
    ledgerLineYs.push(lineY);
  }

  for (
    let lineY = staffBottom + STAFF_LINE_SPACING;
    lineY <= y + LEDGER_EPSILON;
    lineY += STAFF_LINE_SPACING
  ) {
    ledgerLineYs.push(lineY);
  }

  return ledgerLineYs;
}

function getStemDirection(y: number, staffIndex: number) {
  const middleLineY = getStaffTop(staffIndex) + STAFF_LINE_SPACING * 2;

  return y <= middleLineY ? 'down' : 'up';
}

function getRestPath(duration: DurationValue, x: number, y: number) {
  if (duration === 'whole') {
    return `M ${x - 8} ${y - 3} h 16 v 5 h -16 z`;
  }

  if (duration === 'half') {
    return `M ${x - 8} ${y + 1} h 16 v 5 h -16 z`;
  }

  if (duration === 'eighth' || duration === 'sixteenth') {
    return [
      `M ${x - 2} ${y - 17}`,
      `c 9 6 7 16 -2 18`,
      `c 7 5 8 13 0 20`,
      `l -5 -3`,
      `c 6 -5 4 -10 -3 -14`,
      `c 8 -3 8 -9 0 -15`,
      'z',
    ].join(' ');
  }

  return [
    `M ${x + 4} ${y - 20}`,
    `c -12 5 -7 14 1 18`,
    `c -11 3 -10 12 0 17`,
    `c -9 1 -13 9 -4 16`,
  ].join(' ');
}

export function NoteGlyph({
  duration,
  pitch,
  staffIndex,
  variant,
  x,
  y,
}: NoteGlyphProps) {
  const isOpenNote = duration === 'whole' || duration === 'half';
  const stemDirection = getStemDirection(y, staffIndex);
  const stemX = stemDirection === 'up' ? x + NOTEHEAD_RX : x - NOTEHEAD_RX;
  const stemEndY = stemDirection === 'up' ? y - STEM_LENGTH : y + STEM_LENGTH;

  return (
    <g
      className={`notation-glyph notation-glyph-${variant}`}
      data-pitch={`${pitch.step}${pitch.octave}`}
      data-visual-x={x.toFixed(2)}
      data-visual-y={y.toFixed(2)}
    >
      {getLedgerLineYs(y, staffIndex).map((lineY) => (
        <line
          key={lineY}
          className="notation-ledger-line"
          data-testid="ledger-line"
          x1={x - LEDGER_HALF_WIDTH}
          x2={x + LEDGER_HALF_WIDTH}
          y1={lineY}
          y2={lineY}
        />
      ))}
      <ellipse
        className={`score-event-notehead${isOpenNote ? ' is-open' : ''}`}
        cx={x}
        cy={y}
        rx={NOTEHEAD_RX}
        ry={NOTEHEAD_RY}
      />
      {duration !== 'whole' ? (
        <line
          className="score-event-stem"
          x1={stemX}
          x2={stemX}
          y1={y}
          y2={stemEndY}
        />
      ) : null}
    </g>
  );
}

export function RestGlyph({ duration, variant, x, y }: RestGlyphProps) {
  return (
    <g
      className={`notation-glyph notation-glyph-${variant}`}
      data-visual-x={x.toFixed(2)}
      data-visual-y={y.toFixed(2)}
    >
      <path className="score-event-rest" d={getRestPath(duration, x, y)} />
    </g>
  );
}
