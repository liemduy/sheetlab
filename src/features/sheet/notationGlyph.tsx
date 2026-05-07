import type { DurationValue, Pitch } from '../../domain/score/types';
import { STAFF_LEDGER_LINE_LIMIT } from '../../domain/score/pitchRange';
import { STAFF_GAP, STAFF_LINE_SPACING, getStaffTop } from './layout';

type NotationGlyphVariant = 'ghost' | 'placed';

interface NoteGlyphProps {
  dots?: number;
  duration: DurationValue;
  pitch: Pitch;
  staffIndex: number;
  staffGap?: number;
  variant: NotationGlyphVariant;
  x: number;
  y: number;
}

interface ChordGlyphProps {
  dots?: number;
  duration: DurationValue;
  notes: Array<{
    pitch: Pitch;
    y: number;
  }>;
  staffIndex: number;
  staffGap?: number;
  variant: NotationGlyphVariant;
  x: number;
}

interface RestGlyphProps {
  dots?: number;
  duration: DurationValue;
  staffGap?: number;
  staffIndex?: number;
  variant: NotationGlyphVariant;
  x: number;
  y: number;
}

const NOTEHEAD_RX = 7.8;
const NOTEHEAD_RY = 5.2;
const STEM_LENGTH = 38;
const LEDGER_HALF_WIDTH = 14;
const LEDGER_EPSILON = 0.01;
const ADJACENT_NOTE_OFFSET_X = NOTEHEAD_RX * 1.45;
const DOT_RADIUS = 2.2;

const ACCIDENTAL_SYMBOL = {
  flat: '\u266d',
  natural: '\u266e',
  sharp: '\u266f',
} satisfies Record<NonNullable<Pitch['accidental']>, string>;

export function getLedgerLineYs(
  y: number,
  staffIndex: number,
  staffGap = STAFF_GAP,
) {
  const staffTop = getStaffTop(staffIndex, staffGap);
  const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
  const ledgerLineYs: number[] = [];

  for (
    let lineY = staffTop - STAFF_LINE_SPACING;
    lineY >= y - LEDGER_EPSILON &&
    ledgerLineYs.length < STAFF_LEDGER_LINE_LIMIT;
    lineY -= STAFF_LINE_SPACING
  ) {
    ledgerLineYs.push(lineY);
  }

  for (
    let lineY = staffBottom + STAFF_LINE_SPACING;
    lineY <= y + LEDGER_EPSILON &&
    ledgerLineYs.length < STAFF_LEDGER_LINE_LIMIT;
    lineY += STAFF_LINE_SPACING
  ) {
    ledgerLineYs.push(lineY);
  }

  return ledgerLineYs;
}

function getStemDirection(y: number, staffIndex: number, staffGap = STAFF_GAP) {
  const middleLineY = getStaffTop(staffIndex, staffGap) + STAFF_LINE_SPACING * 2;

  return y <= middleLineY ? 'down' : 'up';
}

function getChordStemDirection(
  notes: ChordGlyphProps['notes'],
  staffIndex: number,
  staffGap = STAFF_GAP,
) {
  const averageY =
    notes.reduce((total, note) => total + note.y, 0) / Math.max(1, notes.length);

  return getStemDirection(averageY, staffIndex, staffGap);
}

function getChordHeadOffsetX(
  noteIndex: number,
  sortedNotes: ChordGlyphProps['notes'],
  stemDirection: 'up' | 'down',
) {
  const previousNote = sortedNotes[noteIndex - 1];
  const note = sortedNotes[noteIndex];

  if (!note || !previousNote) {
    return 0;
  }

  const isAdjacentSecond =
    Math.abs(note.y - previousNote.y) <= STAFF_LINE_SPACING / 2 + 0.01;

  if (!isAdjacentSecond) {
    return 0;
  }

  return stemDirection === 'up' ? -ADJACENT_NOTE_OFFSET_X : ADJACENT_NOTE_OFFSET_X;
}

function getRestPath(duration: DurationValue, x: number, y: number) {
  if (duration === 'whole') {
    return `M ${x - 8} ${y - 3} h 16 v 5 h -16 z`;
  }

  if (duration === 'half') {
    return `M ${x - 8} ${y + 1} h 16 v 5 h -16 z`;
  }

  if (
    duration === 'eighth' ||
    duration === 'sixteenth' ||
    duration === 'thirtySecond'
  ) {
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

function getDotY(y: number, staffIndex: number, staffGap = STAFF_GAP) {
  const staffTop = getStaffTop(staffIndex, staffGap);
  const relativeHalfSteps = Math.round(
    ((y - staffTop) / STAFF_LINE_SPACING) * 2,
  );
  const isOnLine = relativeHalfSteps % 2 === 0;

  return isOnLine ? y - STAFF_LINE_SPACING / 2 : y;
}

function DotMarks({
  dots = 0,
  staffGap = STAFF_GAP,
  staffIndex,
  x,
  y,
}: {
  dots?: number;
  staffGap?: number;
  staffIndex: number;
  x: number;
  y: number;
}) {
  if (dots <= 0) {
    return null;
  }

  const dotY = getDotY(y, staffIndex, staffGap);

  return (
    <>
      {Array.from({ length: dots }, (_, dotIndex) => (
        <circle
          key={dotIndex}
          className="notation-dot"
          cx={x + NOTEHEAD_RX + 7 + dotIndex * 6}
          cy={dotY}
          r={DOT_RADIUS}
        />
      ))}
    </>
  );
}

function AccidentalGlyph({ pitch, x, y }: { pitch: Pitch; x: number; y: number }) {
  if (!pitch.accidental) {
    return null;
  }

  return (
    <text
      aria-hidden="true"
      className="notation-accidental"
      x={x - 22}
      y={y + 5}
    >
      {ACCIDENTAL_SYMBOL[pitch.accidental]}
    </text>
  );
}

export function NoteGlyph({
  dots = 0,
  duration,
  pitch,
  staffIndex,
  staffGap = STAFF_GAP,
  variant,
  x,
  y,
}: NoteGlyphProps) {
  const isOpenNote = duration === 'whole' || duration === 'half';
  const stemDirection = getStemDirection(y, staffIndex, staffGap);
  const stemX = stemDirection === 'up' ? x + NOTEHEAD_RX : x - NOTEHEAD_RX;
  const stemEndY = stemDirection === 'up' ? y - STEM_LENGTH : y + STEM_LENGTH;

  return (
    <g
      className={`notation-glyph notation-glyph-${variant}`}
      data-pitch={`${pitch.step}${pitch.octave}`}
      data-visual-x={x.toFixed(2)}
      data-visual-y={y.toFixed(2)}
    >
      {getLedgerLineYs(y, staffIndex, staffGap).map((lineY) => (
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
      <AccidentalGlyph pitch={pitch} x={x} y={y} />
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
      <DotMarks dots={dots} staffGap={staffGap} staffIndex={staffIndex} x={x} y={y} />
    </g>
  );
}

export function ChordGlyph({
  dots = 0,
  duration,
  notes,
  staffIndex,
  staffGap = STAFF_GAP,
  variant,
  x,
}: ChordGlyphProps) {
  const isOpenNote = duration === 'whole' || duration === 'half';
  const sortedNotes = [...notes].sort((a, b) => a.y - b.y);
  const stemDirection = getChordStemDirection(sortedNotes, staffIndex, staffGap);
  const noteYs = sortedNotes.map((note) => note.y);
  const stemX = stemDirection === 'up' ? x + NOTEHEAD_RX : x - NOTEHEAD_RX;
  const stemStartY =
    stemDirection === 'up' ? Math.max(...noteYs) : Math.min(...noteYs);
  const stemEndY =
    stemDirection === 'up'
      ? Math.min(...noteYs) - STEM_LENGTH
      : Math.max(...noteYs) + STEM_LENGTH;

  return (
    <g
      className={`notation-glyph notation-glyph-${variant} notation-glyph-chord`}
      data-visual-x={x.toFixed(2)}
      data-visual-y={stemStartY.toFixed(2)}
    >
      {sortedNotes.map((note, noteIndex) => {
        const headX =
          x + getChordHeadOffsetX(noteIndex, sortedNotes, stemDirection);

        return (
          <g
            key={`${note.pitch.step}${note.pitch.octave}${
              note.pitch.accidental ?? ''
            }`}
            data-pitch={`${note.pitch.step}${note.pitch.octave}`}
          >
            {getLedgerLineYs(note.y, staffIndex, staffGap).map((lineY) => (
              <line
                key={lineY}
                className="notation-ledger-line"
                data-testid="ledger-line"
                x1={headX - LEDGER_HALF_WIDTH}
                x2={headX + LEDGER_HALF_WIDTH}
                y1={lineY}
                y2={lineY}
              />
            ))}
            <AccidentalGlyph pitch={note.pitch} x={headX} y={note.y} />
            <ellipse
              className={`score-event-notehead${isOpenNote ? ' is-open' : ''}`}
              cx={headX}
              cy={note.y}
              rx={NOTEHEAD_RX}
              ry={NOTEHEAD_RY}
            />
            <DotMarks
              dots={dots}
              staffGap={staffGap}
              staffIndex={staffIndex}
              x={headX}
              y={note.y}
            />
          </g>
        );
      })}
      {duration !== 'whole' ? (
        <line
          className="score-event-stem"
          data-testid="chord-stem"
          x1={stemX}
          x2={stemX}
          y1={stemStartY}
          y2={stemEndY}
        />
      ) : null}
    </g>
  );
}

export function RestGlyph({
  dots = 0,
  duration,
  staffGap = STAFF_GAP,
  staffIndex = 0,
  variant,
  x,
  y,
}: RestGlyphProps) {
  return (
    <g
      className={`notation-glyph notation-glyph-${variant}`}
      data-visual-x={x.toFixed(2)}
      data-visual-y={y.toFixed(2)}
    >
      <path className="score-event-rest" d={getRestPath(duration, x, y)} />
      <DotMarks dots={dots} staffGap={staffGap} staffIndex={staffIndex} x={x} y={y} />
    </g>
  );
}
