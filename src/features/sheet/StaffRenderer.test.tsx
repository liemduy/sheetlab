import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { placeScoreEvent } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import { trebleStudyFixture } from '../../domain/score/fixtures';
import type {
  ChordEvent,
  Clef,
  Pitch,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import type { MusicPosition } from './interaction';
import {
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getScoreStaffGap,
  getScoreSvgHeight,
  getStaffTop,
  SVG_WIDTH,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { StaffRenderer } from './StaffRenderer';

const trebleHover: MusicPosition = {
  staffId: 'treble',
  staffIndex: 0,
  measureIndex: 0,
  beat: 1,
  pitch: { step: 'C', octave: 4 },
  x: 154,
  y: 130,
};

function setVisibleSheetBounds(element: Element) {
  const bounds = {
    bottom: 244,
    height: 194,
    left: 40,
    right: 960,
    top: 50,
    width: 920,
    x: 40,
    y: 50,
    toJSON: () => ({}),
  } satisfies DOMRect;

  element.getBoundingClientRect = () => bounds;

  return bounds;
}

function svgToClientPoint(bounds: DOMRect, x: number, y: number) {
  return {
    clientX: bounds.left + (x / SVG_WIDTH) * bounds.width,
    clientY: bounds.top + (y / getScoreSvgHeight('treble')) * bounds.height,
  };
}

function getRenderedYValues(container: HTMLElement) {
  const values: number[] = [];

  container
    .querySelectorAll(
      '.score-event-notehead, .score-event-stem, .notation-ledger-line',
    )
    .forEach((element) => {
      ['cy', 'y1', 'y2'].forEach((attribute) => {
        const value = element.getAttribute(attribute);

        if (value !== null) {
          values.push(Number(value));
        }
      });
    });

  return values;
}

function expectRenderedYsInsideSvg(container: HTMLElement, svgHeight: number) {
  const yValues = getRenderedYValues(container);

  expect(yValues.length).toBeGreaterThan(0);
  expect(Math.min(...yValues)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...yValues)).toBeLessThanOrEqual(svgHeight);
}

describe('StaffRenderer', () => {
  it('renders an empty treble staff system', () => {
    const { container } = render(
      <StaffRenderer score={createEmptyScore('treble', { measureCount: 4 })} />,
    );

    expect(
      screen.getByRole('img', { name: 'Treble staff notation system' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('vexflow-renderer')).toBeInTheDocument();
    expect(container.querySelector('.vexflow-stage-spacer')).toHaveStyle({
      paddingBottom: `${(getScoreSvgHeight('treble') / SVG_WIDTH) * 100}%`,
    });
    expect(screen.getByTestId('staff-treble')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-bass')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(5);
  });

  it('renders visible rhythm slots from the active duration', () => {
    render(
      <StaffRenderer
        duration="quarter"
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(16);
  });

  it('renders fewer visible slots for longer durations', () => {
    render(
      <StaffRenderer
        duration="half"
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(8);
  });

  it('renders dense thirty-second slots for fine input', () => {
    render(
      <StaffRenderer
        duration="thirtySecond"
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(128);
  });

  it('renders shared timeline columns across grand-staff piano slots', () => {
    render(
      <StaffRenderer
        duration="quarter"
        inputCursor={{
          beat: 1,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'C', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={createEmptyScore('grand', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('timeline-column')).toHaveLength(16);
    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(32);
    expect(document.querySelectorAll('.timeline-column.is-active')).toHaveLength(1);
  });

  it('renders the active blue input cursor at the current slot', () => {
    render(
      <StaffRenderer
        duration="quarter"
        inputCursor={{
          beat: 2,
          duration: 'quarter',
          measureIndex: 1,
          mode: 'note-input',
          pitchPreview: { step: 'G', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-staff-id',
      'treble',
    );
    expect(
      Number(screen.getByTestId('active-input-cursor-line').getAttribute('x1')),
    ).toBeCloseTo(getBeatX(1, 2, 4), 2);
    expect(document.querySelectorAll('.rhythm-slot.is-active')).toHaveLength(1);
  });

  it('renders an empty grand staff system', () => {
    render(<StaffRenderer score={createEmptyScore('grand', { measureCount: 4 })} />);

    expect(
      screen.getByRole('img', { name: 'Grand staff notation system' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('vexflow-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('staff-treble')).toBeInTheDocument();
    expect(screen.getByTestId('staff-bass')).toBeInTheDocument();
    expect(screen.getByTestId('grand-staff-connector')).toBeInTheDocument();
    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(5);
    expect(screen.getAllByTestId('measure-barline-bass')).toHaveLength(5);
  });

  it('spans the active input cursor through both staves in grand staff mode', () => {
    render(
      <StaffRenderer
        inputCursor={{
          beat: 0,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'C', octave: 3 },
          staffId: 'bass',
          staffIndex: 1,
        }}
        score={createEmptyScore('grand', { measureCount: 4 })}
      />,
    );

    expect(
      Number(screen.getByTestId('active-input-cursor-line').getAttribute('y1')),
    ).toBe(getStaffTop(0) - 36);
    expect(
      Number(screen.getByTestId('active-input-cursor-line').getAttribute('y2')),
    ).toBe(getStaffTop(1) + STAFF_LINE_SPACING * 4 + 36);
  });

  it('highlights the hovered staff in a grand staff system', () => {
    render(
      <StaffRenderer
        hoverPosition={{
          staffId: 'bass',
          staffIndex: 1,
          measureIndex: 0,
          beat: 0,
          pitch: { step: 'C', octave: 3 },
          x: getBeatX(0, 0, 4),
          y: getPitchY({ step: 'C', octave: 3 }, 'bass', 1),
        }}
        score={createEmptyScore('grand', { measureCount: 4 })}
      />,
    );

    expect(screen.getByTestId('staff-hover-guide')).toHaveAttribute(
      'data-staff-id',
      'bass',
    );
    expect(screen.queryByText('Bass')).not.toBeInTheDocument();
  });

  it('renders a ghost note at the hover position', () => {
    render(
      <StaffRenderer
        duration="eighth"
        entryMode="note"
        hoverPosition={trebleHover}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-entry-mode',
      'note',
    );
  });

  it('snaps the visual ghost to the active duration slot', () => {
    render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={{
          ...trebleHover,
          beat: 1.5,
        }}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');

    expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeCloseTo(
      getBeatX(0, 2, 4),
      2,
    );
  });

  it('renders an insertion cursor and smaller note hit targets in insert mode', () => {
    render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={trebleHover}
        placementMode="insert"
        score={trebleStudyFixture}
      />,
    );

    expect(screen.getByTestId('insertion-cursor')).toBeInTheDocument();
    expect(screen.getAllByTestId('score-event-target')[0]).toHaveAttribute(
      'width',
      '16',
    );
  });

  it('snaps the insert preview to the nearest valid event boundary', () => {
    render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={{
          ...trebleHover,
          beat: 0.5,
        }}
        placementMode="insert"
        score={trebleStudyFixture}
      />,
    );

    expect(Number(screen.getByTestId('insertion-cursor').getAttribute('x1'))).toBeCloseTo(
      getBeatX(0, 1, trebleStudyFixture.timeSignature.beats),
      2,
    );
  });

  it('renders a ghost rest when rest mode is active', () => {
    render(
      <StaffRenderer
        duration="half"
        entryMode="rest"
        hoverPosition={trebleHover}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-entry-mode',
      'rest',
    );
  });

  it('renders score events as editor note glyphs', () => {
    const { container } = render(<StaffRenderer score={trebleStudyFixture} />);

    expect(container.querySelectorAll('[data-testid="score-event-visual"]')).toHaveLength(4);
    expect(container.querySelectorAll('.sheetlab-vf-event')).toHaveLength(0);
    expect(container.querySelector('[data-event-id="treble-m1-e1"]')).not.toBeNull();
  });

  it('renders chord events as one selectable column with multiple noteheads', () => {
    const score = createEmptyScore('grand', { measureCount: 1 });
    const chord: ChordEvent = {
      id: 'ui-c-major',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
        { step: 'G', octave: 4 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const { container } = render(<StaffRenderer score={score} />);
    const chordButton = screen.getByRole('button', {
      name: 'Chord C4 E4 G4 measure 1 beat 1',
    });

    expect(chordButton).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-event-id="ui-c-major"] .score-event-notehead'),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('[data-event-id="ui-c-major"] .score-event-stem'),
    ).toHaveLength(1);
  });

  it('offsets adjacent chord seconds instead of stacking noteheads directly', () => {
    const score = createEmptyScore('treble', { measureCount: 1 });
    const chord: ChordEvent = {
      id: 'ui-adjacent-second',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'B', octave: 3 },
        { step: 'C', octave: 4 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const { container } = render(<StaffRenderer score={score} />);
    const noteheadXs = [
      ...container.querySelectorAll(
        '[data-event-id="ui-adjacent-second"] .score-event-notehead',
      ),
    ].map((element) => element.getAttribute('cx'));

    expect(new Set(noteheadXs).size).toBe(2);
    expect(
      container.querySelectorAll('[data-event-id="ui-adjacent-second"] .score-event-stem'),
    ).toHaveLength(1);
  });

  it('renders a delete target for the selected event', () => {
    const onDeleteEvent = vi.fn();

    render(
      <StaffRenderer
        onDeleteEvent={onDeleteEvent}
        score={trebleStudyFixture}
        selectedEventId="treble-m1-e1"
      />,
    );

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note C4 measure 1 beat 1',
    );
    expect(
      screen
        .getByTestId('score-event-delete')
        .querySelector('.score-event-delete-target'),
    ).toHaveAttribute('r', '18');
    fireEvent.click(screen.getByTestId('score-event-delete'));

    expect(onDeleteEvent).toHaveBeenCalledWith('treble-m1-e1');
  });

  it('hides note-input preview while an event is selected for deletion', () => {
    render(
      <StaffRenderer
        hoverPosition={trebleHover}
        inputCursor={{
          beat: 1,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'C', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={trebleStudyFixture}
        selectedEventId="treble-m1-e1"
      />,
    );

    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-input-cursor')).not.toBeInTheDocument();
    expect(screen.getByTestId('score-event-delete')).toBeInTheDocument();
  });

  it('emits a move event when a placed note is dragged to a new grid point', () => {
    const onMoveEvent = vi.fn();

    render(
      <StaffRenderer
        onMoveEvent={onMoveEvent}
        score={trebleStudyFixture}
        selectedEventId="treble-m1-e1"
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, trebleStudyFixture.timeSignature.beats),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, trebleStudyFixture.timeSignature.beats),
      getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);

    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-duration',
      'quarter',
    );

    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveEvent).toHaveBeenCalledWith(
      'treble-m1-e1',
      expect.objectContaining({
        beat: 2,
        measureIndex: 0,
        pitch: { step: 'G', octave: 4 },
        staffId: 'treble',
      }),
    );
  });

  it('keeps event glyph centers on the same editor grid as ghost and hit targets', () => {
    const hoverPosition: MusicPosition = {
      staffId: 'treble',
      staffIndex: 0,
      measureIndex: 0,
      beat: 0,
      pitch: { step: 'C', octave: 4 },
      x: getBeatX(0, 0, trebleStudyFixture.timeSignature.beats),
      y: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    };
    render(<StaffRenderer hoverPosition={hoverPosition} score={trebleStudyFixture} />);

    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');
    const scoreEvent = screen.getByRole('button', {
      name: 'Note C4 measure 1 beat 1',
    });
    const hitTarget = scoreEvent.querySelector('.score-event-target');
    const eventNoteHead = scoreEvent.querySelector('.score-event-notehead');
    const expectedX = getBeatX(0, 0, trebleStudyFixture.timeSignature.beats);
    const expectedY = getPitchY({ step: 'C', octave: 4 }, 'treble', 0);

    expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeCloseTo(expectedX, 2);
    expect(Number(ghostNoteHead?.getAttribute('cy'))).toBeCloseTo(expectedY, 2);
    expect(Number(hitTarget?.getAttribute('x')) + 14).toBeCloseTo(expectedX, 2);
    expect(Number(hitTarget?.getAttribute('y')) + 20).toBeCloseTo(expectedY, 2);
    expect(Number(eventNoteHead?.getAttribute('cx'))).toBeCloseTo(expectedX, 2);
    expect(Number(eventNoteHead?.getAttribute('cy'))).toBeCloseTo(expectedY, 2);
  });

  it('centers the actual editor notehead glyph on the editor grid', () => {
    const { container } = render(<StaffRenderer score={trebleStudyFixture} />);
    const noteheadGlyph = container.querySelector(
      '[data-event-id="treble-m1-e1"] .score-event-notehead',
    );
    const expectedX = getBeatX(0, 0, trebleStudyFixture.timeSignature.beats);
    const expectedY = getPitchY({ step: 'C', octave: 4 }, 'treble', 0);

    expect(Number(noteheadGlyph?.getAttribute('cx'))).toBeCloseTo(expectedX, 2);
    expect(Number(noteheadGlyph?.getAttribute('cy'))).toBeCloseTo(expectedY, 2);
  });

  it('renders ledger lines for placed and ghost notes outside the staff', () => {
    const hoverPosition: MusicPosition = {
      staffId: 'treble',
      staffIndex: 0,
      measureIndex: 0,
      beat: 0,
      pitch: { step: 'C', octave: 4 },
      x: getBeatX(0, 0, trebleStudyFixture.timeSignature.beats),
      y: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    };
    const { container } = render(
      <StaffRenderer hoverPosition={hoverPosition} score={trebleStudyFixture} />,
    );

    expect(
      container.querySelectorAll(
        '[data-event-id="treble-m1-e1"] [data-testid="ledger-line"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByTestId('ghost-event')
        .querySelectorAll('[data-testid="ledger-line"]').length,
    ).toBeGreaterThan(0);
  });

  it('expands the grand staff gap when ledger lines from both staves need more room', () => {
    const trebleLowScore = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'treble-low-ledger',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'F', octave: 3 },
    });
    const score = placeScoreEvent(trebleLowScore, {
      eventId: 'bass-high-ledger',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const { container } = render(<StaffRenderer score={score} />);
    const connector = screen.getByTestId('grand-staff-connector');
    const dynamicGap = getScoreStaffGap(score);

    expect(dynamicGap).toBeGreaterThan(STAFF_GAP);
    expect(Number(connector.getAttribute('y2')) - Number(connector.getAttribute('y1'))).toBeCloseTo(
      dynamicGap + STAFF_LINE_SPACING * 4,
      2,
    );
    expectRenderedYsInsideSvg(container, getScoreSvgHeight(score));
  });

  it.each([
    {
      clef: 'treble',
      expectedLedgerLines: 3,
      pitch: { step: 'F', octave: 3 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'treble',
      expectedLedgerLines: 2,
      pitch: { step: 'A', octave: 3 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'treble',
      expectedLedgerLines: 1,
      pitch: { step: 'C', octave: 4 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'treble',
      expectedLedgerLines: 1,
      pitch: { step: 'A', octave: 5 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'treble',
      expectedLedgerLines: 3,
      pitch: { step: 'E', octave: 6 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'treble',
      expectedLedgerLines: 2,
      pitch: { step: 'C', octave: 6 },
      scoreType: 'treble',
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 5,
      pitch: { step: 'C', octave: 1 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 3,
      pitch: { step: 'A', octave: 1 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 2,
      pitch: { step: 'C', octave: 2 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 1,
      pitch: { step: 'C', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 3,
      pitch: { step: 'G', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      clef: 'bass',
      expectedLedgerLines: 2,
      pitch: { step: 'E', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
      staffIndex: 1,
    },
  ] satisfies Array<{
    clef: Clef;
    expectedLedgerLines: number;
    pitch: Pitch;
    scoreType: ScoreType;
    staffId: StaffId;
    staffIndex: number;
  }>)(
    'renders unclipped ledger stress note $pitch.step$pitch.octave on $staffId',
    ({ clef, expectedLedgerLines, pitch, scoreType, staffId, staffIndex }) => {
      const score = placeScoreEvent(createEmptyScore(scoreType), {
        eventId: 'ledger-stress-note',
        staffId,
        measureIndex: 0,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch,
      });
      const hoverPosition: MusicPosition = {
        staffId,
        staffIndex,
        measureIndex: 0,
        beat: 0,
        pitch,
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: getPitchY(pitch, clef, staffIndex),
      };
      const { container } = render(
        <StaffRenderer hoverPosition={hoverPosition} score={score} />,
      );
      const placedEvent = container.querySelector(
        '[data-event-id="ledger-stress-note"]',
      );
      const ghostEvent = screen.getByTestId('ghost-event');
      const svgHeight = getScoreSvgHeight(scoreType);

      expect(
        placedEvent?.querySelectorAll('[data-testid="ledger-line"]'),
      ).toHaveLength(expectedLedgerLines);
      expect(
        ghostEvent.querySelectorAll('[data-testid="ledger-line"]'),
      ).toHaveLength(expectedLedgerLines);
      expectRenderedYsInsideSvg(placedEvent as HTMLElement, svgHeight);
      expectRenderedYsInsideSvg(ghostEvent, svgHeight);
    },
  );

  it('keeps VexFlow staff lines aligned with overlay pitch geometry', () => {
    const { container } = render(
      <StaffRenderer score={createEmptyScore('treble', { measureCount: 4 })} />,
    );
    const firstStaffLine = container.querySelector(
      '.vexflow-output .vf-stave path',
    );
    const firstStaffLineY = Number(
      firstStaffLine?.getAttribute('d')?.match(/M[\d.]+ ([\d.]+)L/)?.[1],
    );

    expect(Number.isFinite(firstStaffLineY)).toBe(true);
    expect(Math.abs(firstStaffLineY - getStaffTop(0))).toBeLessThanOrEqual(0.75);
  });

  it('adds a viewBox to the VexFlow svg so the editor can scale without horizontal scroll', () => {
    const { container } = render(
      <StaffRenderer score={createEmptyScore('treble', { measureCount: 4 })} />,
    );
    const vexflowSvg = container.querySelector('.vexflow-output svg');

    expect(vexflowSvg).toHaveAttribute(
      'viewBox',
      `0 0 ${SVG_WIDTH} ${getScoreSvgHeight('treble')}`,
    );
    expect(vexflowSvg).toHaveAttribute('preserveAspectRatio', 'xMinYMin meet');
  });

  it('maps real pointer coordinates on the visible middle treble line to B4', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const onHoverPositionChange = vi.fn();
    const onPlaceAtPosition = vi.fn();

    render(
      <StaffRenderer
        score={score}
        onHoverPositionChange={onHoverPositionChange}
        onPlaceAtPosition={onPlaceAtPosition}
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = {
      bottom: 244,
      height: 194,
      left: 40,
      right: 960,
      top: 50,
      width: 920,
      x: 40,
      y: 50,
      toJSON: () => ({}),
    } satisfies DOMRect;
    overlay.getBoundingClientRect = () => bounds;

    const clientX = bounds.left + (getBeatX(0, 0, score.timeSignature.beats) / SVG_WIDTH) * bounds.width;
    const clientY =
      bounds.top +
      (getPitchY({ step: 'B', octave: 4 }, 'treble', 0) /
        getScoreSvgHeight('treble')) *
        bounds.height;

    fireEvent.mouseMove(overlay, { clientX, clientY });
    fireEvent.click(overlay, { clientX, clientY });

    expect(onHoverPositionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'B', octave: 4 },
        staffId: 'treble',
      }),
    );
    expect(onPlaceAtPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'B', octave: 4 },
        staffId: 'treble',
      }),
    );
  });

  it('places clicks on the active duration slot instead of freehand beats', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const onPlaceAtPosition = vi.fn();

    render(
      <StaffRenderer
        duration="quarter"
        score={score}
        onPlaceAtPosition={onPlaceAtPosition}
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const betweenQuarterSlots = svgToClientPoint(
      bounds,
      getBeatX(0, 1.5, 4),
      getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
    );

    fireEvent.click(overlay, betweenQuarterSlots);

    expect(onPlaceAtPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        beat: 2,
        measureIndex: 0,
        pitch: { step: 'B', octave: 4 },
        staffId: 'treble',
      }),
    );
  });
});
