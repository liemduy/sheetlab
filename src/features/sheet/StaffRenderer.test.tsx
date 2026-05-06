import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { trebleStudyFixture } from '../../domain/score/fixtures';
import type { MusicPosition } from './interaction';
import { getScoreSvgHeight, getStaffTop, SVG_WIDTH } from './layout';
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

describe('StaffRenderer', () => {
  it('renders an empty treble staff system', () => {
    render(<StaffRenderer score={createEmptyScore('treble', { measureCount: 4 })} />);

    expect(
      screen.getByRole('img', { name: 'Treble staff notation system' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('vexflow-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('staff-treble')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-bass')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(5);
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
    fireEvent.mouseDown(screen.getByTestId('score-event-delete'));

    expect(onDeleteEvent).toHaveBeenCalledWith('treble-m1-e1');
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
});
