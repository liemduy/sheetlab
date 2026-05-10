import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  placeScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setMeasureSectionMarker,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import {
  duChoTanTheExcerptFixture,
  trebleStudyFixture,
} from '../../domain/score/fixtures';
import type {
  ChordEvent,
  Clef,
  Pitch,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import type { MusicPosition } from './interaction';
import { getMeasureKey } from './measureKey';
import {
  MEASURES_PER_SYSTEM,
  STAFF_GAP,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  getMeasureX,
  getMeasureWidth,
  getScoreStaffGap,
  getScoreStaffTop,
  getScoreSystemGap,
  getScoreSvgHeight,
  getStaffTop,
  SVG_WIDTH,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { getLedgerLineYsForScore } from './notationGlyph';
import { StaffRenderer } from './StaffRenderer';
import { DEFAULT_INPUT_SLOT_WIDTH } from './inputSlotLayout';
import {
  ANNOTATION_METRICS,
  ABOVE_STAFF_INK_GAP,
  BELOW_STAFF_INK_GAP,
  NOTEHEAD_ANNOTATION_INK_PADDING,
} from './annotationLayoutPolicy';

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

function svgToClientPoint(
  bounds: DOMRect,
  x: number,
  y: number,
  svgHeight = getScoreSvgHeight('treble'),
) {
  return {
    clientX: bounds.left + (x / SVG_WIDTH) * bounds.width,
    clientY: bounds.top + (y / svgHeight) * bounds.height,
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
    expect(container.querySelectorAll('.vexflow-output .vf-generated-rest')).toHaveLength(4);
  });

  it('does not render the full rhythm grid before the cursor has a hover position', () => {
    render(
      <StaffRenderer
        duration="quarter"
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.queryByTestId('rhythm-slot')).not.toBeInTheDocument();
  });

  it('renders only the active rhythm slot instead of every possible beat', () => {
    render(
      <StaffRenderer
        duration="half"
        inputCursor={{
          beat: 2,
          duration: 'half',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'C', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(1);
    expect(screen.getByTestId('rhythm-slot')).toHaveAttribute('data-beat', '2');
  });

  it('does not flood the sheet with thirty-second slot guides', () => {
    render(
      <StaffRenderer
        duration="thirtySecond"
        inputCursor={{
          beat: 3.875,
          duration: 'thirtySecond',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'C', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(1);
  });

  it('renders one highlighted slot on the active piano staff', () => {
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

    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(1);
    expect(document.querySelectorAll('.timeline-slot.is-grand-slot')).toHaveLength(0);
    expect(screen.getByTestId('rhythm-slot')).toHaveAttribute('data-beat', '1');
  });

  it('centers the active highlighted input slot around the input column', () => {
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
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    const slot = screen.getByTestId('rhythm-slot');
    const slotX = Number(slot.getAttribute('x'));
    const slotWidth = Number(slot.getAttribute('width'));
    const centerX = Number(slot.getAttribute('data-slot-center-x'));

    expect(centerX).toBeCloseTo(getBeatX(1, 2, 4), 2);
    expect(slotX).toBeLessThan(centerX);
    expect(slotX + slotWidth).toBeGreaterThan(centerX);
    expect(slotWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
    expect(document.querySelectorAll('.rhythm-slot.is-active')).toHaveLength(1);
  });

  it('fits the active input slot around the rendered VexFlow event bounds', async () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'quarter-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    render(
      <StaffRenderer
        duration="quarter"
        inputCursor={{
          beat: 0,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'E', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={score}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rhythm-slot')).toHaveAttribute(
        'data-layout-source',
        'vexflow',
      );
    });

    const slot = screen.getByTestId('rhythm-slot');
    const note = screen.getByLabelText('Note E4 measure 1 beat 1');
    const slotX = Number(slot.getAttribute('x'));
    const slotWidth = Number(slot.getAttribute('width'));
    const noteX = Number(note.getAttribute('data-layout-x'));

    expect(slotX).toBeLessThan(noteX);
    expect(slotX + slotWidth).toBeGreaterThan(noteX);
    expect(slotWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
  });

  it('uses VexFlow columns for generated rest slots after a short placed note', async () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'eighth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    render(
      <StaffRenderer
        duration="eighth"
        inputCursor={{
          beat: 0.5,
          duration: 'eighth',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'F', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={score}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rhythm-slot')).toHaveAttribute(
        'data-layout-source',
        'vexflow',
      );
    });

    const slot = screen.getByTestId('rhythm-slot');

    expect(getMeasureWidth(0, score)).toBeGreaterThan(getMeasureWidth(1, score));
    const centerX = Number(slot.getAttribute('data-slot-center-x'));
    const slotX = Number(slot.getAttribute('x'));
    const slotWidth = Number(slot.getAttribute('width'));

    expect(slotX).toBeLessThan(centerX);
    expect(slotX + slotWidth).toBeGreaterThan(centerX);
    expect(slotWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
  });

  it('keeps ghost notes and slot boxes on the same generated-rest column', async () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'eighth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    render(
      <StaffRenderer
        duration="eighth"
        hoverPosition={{
          beat: 0.5,
          measureIndex: 0,
          pitch: { step: 'F', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
          x: getBeatX(0, 0.5, 4, score),
          y: getPitchY({ step: 'F', octave: 4 }, 'treble', 0),
        }}
        inputCursor={{
          beat: 0.5,
          duration: 'eighth',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'F', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={score}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rhythm-slot')).toHaveAttribute(
        'data-layout-source',
        'vexflow',
      );
    });

    const slotCenterX = Number(
      screen.getByTestId('rhythm-slot').getAttribute('data-slot-center-x'),
    );
    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');

    expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeCloseTo(slotCenterX, 2);
  });

  it('keeps the ghost note on the active cursor column when hover x is stale', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'quarter-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });

    render(
      <StaffRenderer
        duration="quarter"
        hoverPosition={{
          beat: 1,
          measureIndex: 0,
          pitch: { step: 'G', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
          x: getBeatX(0, 2, 4, score),
          y: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
        }}
        inputCursor={{
          beat: 1,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: { step: 'G', octave: 4 },
          staffId: 'treble',
          staffIndex: 0,
        }}
        score={score}
      />,
    );

    const slot = screen.getByTestId('rhythm-slot');
    const slotCenterX = Number(slot.getAttribute('data-slot-center-x'));
    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');
    const ghostCenterX = Number(ghostNoteHead?.getAttribute('cx'));

    expect(slot).toHaveAttribute('data-beat', '1');
    expect(ghostCenterX).toBeCloseTo(slotCenterX, 2);
    expect(ghostCenterX).not.toBeCloseTo(getBeatX(0, 2, 4, score), 2);
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

  it('renders default scores across four-measure systems instead of one short row', () => {
    render(<StaffRenderer score={createEmptyScore('treble')} />);

    const barlines = screen.getAllByTestId('measure-barline-treble');

    expect(barlines).toHaveLength(20);
    expect(Number(barlines[MEASURES_PER_SYSTEM + 1]?.getAttribute('x1'))).toBe(
      STAFF_LEFT,
    );
    expect(
      Number(barlines[MEASURES_PER_SYSTEM + 1]?.getAttribute('y1')),
    ).toBeGreaterThan(Number(barlines[0]?.getAttribute('y1')));
  });

  it('selects empty measures with a MuseScore-style measure box in select mode', () => {
    const onSelectMeasure = vi.fn();

    render(
      <StaffRenderer
        isInputArmed={false}
        onSelectMeasure={onSelectMeasure}
        score={createEmptyScore('treble', { measureCount: 4 })}
        selectedMeasure={{ staffId: 'treble', measureIndex: 1 }}
      />,
    );

    expect(screen.getByTestId('selected-measure')).toHaveAttribute(
      'data-measure-key',
      'treble:1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Measure 2 treble' }));

    expect(onSelectMeasure).toHaveBeenLastCalledWith('treble', 1);
  });

  it('disables measure hit targets while note input is armed', () => {
    render(
      <StaffRenderer
        isInputArmed
        score={createEmptyScore('treble', { measureCount: 4 })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Measure 1 treble' })).toHaveAttribute(
      'pointer-events',
      'none',
    );
  });

  it('keeps the active input slot inside the current grand-staff stave', () => {
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

    const slot = screen.getByTestId('rhythm-slot');

    expect(
      Number(slot.getAttribute('y')),
    ).toBe(getStaffTop(1) - 16);
    expect(
      Number(slot.getAttribute('height')),
    ).toBe(STAFF_LINE_SPACING * 4 + 32);
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
    expect(
      Number(
        screen
          .getByTestId('staff-hover-guide')
          .querySelector('rect')
          ?.getAttribute('width'),
      ),
    ).toBe(DEFAULT_INPUT_SLOT_WIDTH);
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

  it('snaps the visual ghost to the first rhythm slot in an empty measure', () => {
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

    expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeLessThan(
      getBeatX(0, 1, 4),
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

  it('snaps the insert preview to the active rhythm slot boundary', async () => {
    render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={{
          ...trebleHover,
          beat: 0.25,
          x: getBeatX(0, 0.25, trebleStudyFixture.timeSignature.beats),
        }}
        placementMode="insert"
        score={trebleStudyFixture}
      />,
    );

    expect(Number(screen.getByTestId('insertion-cursor').getAttribute('x1'))).toBeCloseTo(
      getBeatX(0, 0, trebleStudyFixture.timeSignature.beats),
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

  it('renders score events through VexFlow and keeps overlay hit targets selectable', () => {
    const { container } = render(<StaffRenderer score={trebleStudyFixture} />);

    expect(screen.getAllByTestId('score-event')).toHaveLength(4);
    expect(container.querySelectorAll('.vexflow-output .vf-user-event')).toHaveLength(4);
    expect(
      container.querySelector('.vexflow-output [data-event-id="treble-m1-e1"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('.score-event-notehead')).toHaveLength(0);
  });

  it('marks simultaneous active playback events on both staves', async () => {
    const scoreWithTreble = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'playing-treble',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const score = placeScoreEvent(scoreWithTreble, {
      eventId: 'playing-bass',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const { container } = render(
      <StaffRenderer
        activeEventIds={['playing-treble', 'playing-bass']}
        score={score}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Note C5 measure 1 beat 1' }),
    ).toHaveClass('is-playing');
    expect(
      screen.getByRole('button', { name: 'Note C3 measure 1 beat 1' }),
    ).toHaveClass('is-playing');
    await waitFor(() => {
      expect(
        container.querySelectorAll('.vexflow-output .vf-user-event.is-playing'),
      ).toHaveLength(2);
    });
  });

  it('aligns the playhead to the rendered VexFlow event column', async () => {
    render(<StaffRenderer playbackBeat={1} score={trebleStudyFixture} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Note D4 measure 1 beat 2' }),
      ).toHaveAttribute('data-layout-x');
    });

    const eventX = Number(
      screen
        .getByRole('button', { name: 'Note D4 measure 1 beat 2' })
        .getAttribute('data-layout-x'),
    );
    const playheadX = Number(screen.getByTestId('playhead').getAttribute('x1'));

    expect(playheadX).toBeCloseTo(eventX, 2);
    expect(playheadX).not.toBeCloseTo(getBeatX(0, 1, 4, trebleStudyFixture), 2);
  });

  it('marks every note and the staff lines in an invalid measure', () => {
    const { container } = render(
      <StaffRenderer
        invalidMeasureKeys={[getMeasureKey('treble', 0)]}
        score={trebleStudyFixture}
      />,
    );

    expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(
      container.querySelectorAll(
        '.vexflow-output .vf-user-event.is-invalid-measure[data-measure-index="0"][data-staff-id="treble"]',
      ),
    ).toHaveLength(4);
  });

  it('renders chord events as one selectable VexFlow chord column', () => {
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
      container.querySelectorAll('.vexflow-output .vf-user-event[data-event-id="ui-c-major"]'),
    ).toHaveLength(1);
    expect(
      Number(chordButton.querySelector('.score-event-target')?.getAttribute('height')),
    ).toBeGreaterThan(42);
    expect(container.querySelectorAll('.score-event-notehead')).toHaveLength(0);
  });

  it('selects the nearest notehead inside a chord column by pointer height', async () => {
    const score = createEmptyScore('treble', { measureCount: 1 });
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
    const onSelectEvent = vi.fn();

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const { container, rerender } = render(
      <StaffRenderer score={score} onSelectEvent={onSelectEvent} />,
    );
    const chordButton = screen.getByRole('button', {
      name: 'Chord C4 E4 G4 measure 1 beat 1',
    });

    fireEvent.click(chordButton, {
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(onSelectEvent).toHaveBeenLastCalledWith('ui-c-major', 1);

    rerender(
      <StaffRenderer
        score={score}
        selectedEventId="ui-c-major"
        selectedPitchIndex={1}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vexflow-output .vf-user-notehead[data-event-id="ui-c-major"][data-pitch-index="1"].is-selected-notehead',
        ),
      ).not.toBeNull();
    });
    expect(screen.queryByTestId('selected-notehead')).not.toBeInTheDocument();
    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="ui-c-major"].is-selected',
      ),
    ).toBeNull();
  });

  it('highlights the actual displaced VexFlow notehead inside a second interval chord', async () => {
    const score = createEmptyScore('treble', { measureCount: 1 });
    const chord: ChordEvent = {
      id: 'ui-second',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'D', octave: 4 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const { container } = render(
      <StaffRenderer
        score={score}
        selectedEventId="ui-second"
        selectedPitchIndex={1}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '.vexflow-output .vf-user-notehead[data-event-id="ui-second"]',
        ),
      ).toHaveLength(2);
    });

    const noteheads = [
      ...container.querySelectorAll(
        '.vexflow-output .vf-user-notehead[data-event-id="ui-second"]',
      ),
    ];
    const selectedNotehead = container.querySelector(
      '.vexflow-output .vf-user-notehead[data-event-id="ui-second"].is-selected-notehead',
    );
    const selectedX = Number(
      selectedNotehead?.getAttribute('data-notehead-x'),
    );
    const rightmostX = Math.max(
      ...noteheads.map((notehead) =>
        Number(notehead.getAttribute('data-notehead-x')),
      ),
    );

    expect(selectedNotehead).toHaveAttribute('data-pitch-index', '1');
    expect(selectedX).toBeCloseTo(rightmostX, 2);
    expect(screen.queryByTestId('selected-notehead')).not.toBeInTheDocument();
  });

  it('deletes only the selected pitch from a chord delete target', () => {
    const score = createEmptyScore('treble', { measureCount: 1 });
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
    const onDeleteEvent = vi.fn();

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    render(
      <StaffRenderer
        onDeleteEvent={onDeleteEvent}
        score={score}
        selectedEventId="ui-c-major"
        selectedPitchIndex={1}
      />,
    );

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note E4 from Chord C4 E4 G4 measure 1 beat 1',
    );
    expect(
      Number(
        screen
          .getByTestId('score-event-delete')
          .querySelector('.score-event-delete-bg')
          ?.getAttribute('cy'),
      ),
    ).toBeCloseTo(
      getPitchY(
        { step: 'E', octave: 4 },
        'treble',
        0,
        getScoreStaffGap(score),
        0,
        getScoreSystemGap(score),
      ) - 24,
    );

    fireEvent.click(screen.getByTestId('score-event-delete'));

    expect(onDeleteEvent).toHaveBeenLastCalledWith('ui-c-major', 1);
  });

  it('delegates adjacent chord-second displacement to VexFlow engraving', () => {
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

    expect(
      container.querySelectorAll(
        '.vexflow-output .vf-user-event[data-event-id="ui-adjacent-second"]',
      ),
    ).toHaveLength(1);
    expect(container.querySelectorAll('.score-event-notehead')).toHaveLength(0);
  });

  it('renders a delete target for the selected event', () => {
    const onDeleteEvent = vi.fn();

    const { container } = render(
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
    expect(container.querySelector('.score-event-ring')).toBeNull();
    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="treble-m1-e1"].is-selected',
      ),
    ).not.toBeNull();
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

  it('lets users drag an individual key-signature symbol vertically', () => {
    const score = setMeasureKeySignature(
      createEmptyScore('grand', { measureCount: 4 }),
      0,
      'G',
    );
    const onMoveKeySignatureSymbol = vi.fn();

    render(
      <StaffRenderer
        onMoveKeySignatureSymbol={onMoveKeySignatureSymbol}
        score={score}
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getMeasureX(0, score) + 55,
      getPitchY(
        { step: 'F', octave: 5 },
        'treble',
        0,
        getScoreStaffGap(score),
        0,
        getScoreSystemGap(score),
      ),
      getScoreSvgHeight(score),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getMeasureX(0, score) + 55,
      getPitchY(
        { step: 'E', octave: 5 },
        'treble',
        0,
        getScoreStaffGap(score),
        0,
        getScoreSystemGap(score),
      ),
      getScoreSvgHeight(score),
    );

    fireEvent.mouseDown(
      screen.getByRole('button', {
        name: 'Key signature sharp F measure 1 treble',
      }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);

    expect(screen.getByTestId('key-signature-symbol-preview')).toBeInTheDocument();

    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveKeySignatureSymbol).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({
        measureIndex: 0,
        pitch: { step: 'E', octave: 5 },
        staffId: 'treble',
      }),
    );
  });

  it('marks invalid key-signature symbol drag targets in red', () => {
    const score = setMeasureKeySignature(
      createEmptyScore('grand', { measureCount: 4 }),
      0,
      'D',
    );

    render(<StaffRenderer score={score} />);

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getMeasureX(0, score) + 55,
      getPitchY(
        { step: 'F', octave: 5 },
        'treble',
        0,
        getScoreStaffGap(score),
        0,
        getScoreSystemGap(score),
      ),
      getScoreSvgHeight(score),
    );
    const duplicateTargetPoint = svgToClientPoint(
      bounds,
      getMeasureX(0, score) + 55,
      getPitchY(
        { step: 'C', octave: 5 },
        'treble',
        0,
        getScoreStaffGap(score),
        0,
        getScoreSystemGap(score),
      ),
      getScoreSvgHeight(score),
    );

    fireEvent.mouseDown(
      screen.getByRole('button', {
        name: 'Key signature sharp F measure 1 treble',
      }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, duplicateTargetPoint);

    expect(screen.getByTestId('key-signature-symbol-preview')).toHaveClass(
      'is-invalid',
    );
    expect(screen.getByTestId('key-signature-symbol-preview')).toHaveAttribute(
      'data-invalid-reason',
      'duplicate-step',
    );
  });

  it('renders repeat and jump markings from measure state', () => {
    const score = setMeasureRepeatJump(
      createEmptyScore('grand', { measureCount: 4 }),
      0,
      'fine',
    );
    const { container } = render(<StaffRenderer score={score} />);

    expect(container.querySelector('.vexflow-output')?.textContent).toContain(
      'Fine',
    );
  });

  it('locks notehead drag to the original rhythm column while changing pitch', () => {
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

    const eventLayoutX = Number(
      screen
        .getByRole('button', { name: 'Note C4 measure 1 beat 1' })
        .getAttribute('data-layout-x'),
    );
    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');

    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeCloseTo(
      eventLayoutX,
      2,
    );

    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveEvent).toHaveBeenCalledWith(
      'treble-m1-e1',
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'G', octave: 4 },
        staffId: 'treble',
      }),
      0,
    );
  });

  it('clamps extreme notehead drags to the readable ledger range', () => {
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
      getBeatX(0, 3, trebleStudyFixture.timeSignature.beats),
      getStaffTop(0) + 1000,
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveEvent).toHaveBeenCalledWith(
      'treble-m1-e1',
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'C', octave: 3 },
        staffId: 'treble',
      }),
      0,
    );
  });

  it('keeps drag column fixed but switches staff when a piano note crosses staves', () => {
    const score = placeScoreEvent(createEmptyScore('grand', { measureCount: 1 }), {
      eventId: 'cross-staff-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const onMoveEvent = vi.fn();

    render(
      <StaffRenderer
        onMoveEvent={onMoveEvent}
        score={score}
        selectedEventId="cross-staff-note"
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, score.timeSignature.beats),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0, getScoreStaffGap(score)),
      getScoreSvgHeight(score),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 3, score.timeSignature.beats),
      getPitchY({ step: 'C', octave: 2 }, 'bass', 1, getScoreStaffGap(score)),
      getScoreSvgHeight(score),
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveEvent).toHaveBeenCalledWith(
      'cross-staff-note',
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'C', octave: 2 },
        staffId: 'bass',
      }),
      0,
    );
  });

  it('locks chord notehead drag to the original column and preserves pitch index', () => {
    const score = createEmptyScore('treble', { measureCount: 1 });
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
    const onMoveEvent = vi.fn();

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    render(
      <StaffRenderer
        onMoveEvent={onMoveEvent}
        score={score}
        selectedEventId="ui-c-major"
        selectedPitchIndex={1}
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, score.timeSignature.beats),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, score.timeSignature.beats),
      getPitchY({ step: 'F', octave: 4 }, 'treble', 0),
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Chord C4 E4 G4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(onMoveEvent).toHaveBeenCalledWith(
      'ui-c-major',
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'F', octave: 4 },
        staffId: 'treble',
      }),
      1,
    );
  });

  it('snaps chord-entry ghost and hit targets to the VexFlow-rendered column', () => {
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
    const eventLayoutX = Number(scoreEvent.getAttribute('data-layout-x'));
    const expectedY = getPitchY({ step: 'C', octave: 4 }, 'treble', 0);
    const hitTargetCenterX =
      Number(hitTarget?.getAttribute('x')) +
      Number(hitTarget?.getAttribute('width')) / 2;
    const hitTargetCenterY =
      Number(hitTarget?.getAttribute('y')) +
      Number(hitTarget?.getAttribute('height')) / 2;

    expect(Number.isFinite(Number(ghostNoteHead?.getAttribute('cx')))).toBe(true);
    expect(Number(ghostNoteHead?.getAttribute('cy'))).toBeCloseTo(expectedY, 2);
    expect(hitTargetCenterX).toBeCloseTo(eventLayoutX, 2);
    expect(hitTargetCenterY).toBeCloseTo(expectedY, 2);
    expect(Number(hitTarget?.getAttribute('height'))).toBeLessThanOrEqual(40);
  });

  it('keeps far-interval chord entry on the same rendered column', async () => {
    const { rerender } = render(<StaffRenderer score={trebleStudyFixture} />);
    const scoreEvent = screen.getByRole('button', {
      name: 'Note C4 measure 1 beat 1',
    });
    const eventLayoutX = Number(scoreEvent.getAttribute('data-layout-x'));
    const highPitch: Pitch = { step: 'A', octave: 5 };

    rerender(
      <StaffRenderer
        hoverPosition={{
          staffId: 'treble',
          staffIndex: 0,
          measureIndex: 0,
          beat: 0,
          pitch: highPitch,
          x: eventLayoutX,
          y: getPitchY(highPitch, 'treble', 0),
        }}
        score={trebleStudyFixture}
      />,
    );

    await waitFor(() => {
      const ghostNoteHead = screen
        .getByTestId('ghost-event')
        .querySelector('ellipse');

      expect(Number(ghostNoteHead?.getAttribute('cx'))).toBeCloseTo(
        eventLayoutX,
        2,
      );
      expect(Number(ghostNoteHead?.getAttribute('cy'))).toBeCloseTo(
        getPitchY(highPitch, 'treble', 0),
        2,
      );
    });
  });

  it('keeps rendered-column snapping inside the active duration slot', () => {
    const onPlaceAtPosition = vi.fn();

    render(
      <StaffRenderer
        duration="whole"
        onPlaceAtPosition={onPlaceAtPosition}
        score={trebleStudyFixture}
      />,
    );

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: getBeatX(0, 0, trebleStudyFixture.timeSignature.beats),
      clientY: getPitchY({ step: 'A', octave: 5 }, 'treble', 0),
    });

    expect(onPlaceAtPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'A', octave: 5 },
        staffId: 'treble',
      }),
    );
  });

  it('renders the actual placed notation in the VexFlow layer only', () => {
    const { container } = render(<StaffRenderer score={trebleStudyFixture} />);

    expect(
      container.querySelector('.vexflow-output .vf-user-event[data-event-id="treble-m1-e1"]'),
    ).not.toBeNull();
    expect(container.querySelector('.score-event-notehead')).toBeNull();
  });

  it('uses VexFlow for placed ledger lines while keeping ghost ledger previews', () => {
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
      container.querySelector('.vexflow-output .vf-user-event[data-event-id="treble-m1-e1"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByTestId('ghost-event')
        .querySelectorAll('[data-testid="ledger-line"]').length,
    ).toBeGreaterThan(0);
  });

  it('renders ghost ledger lines against the hovered system instead of system one', () => {
    const score = createEmptyScore('treble', { measureCount: 8 });
    const staffGap = getScoreStaffGap(score);
    const systemGap = getScoreSystemGap(score);
    const pitch: Pitch = { step: 'C', octave: 4 };
    const measureIndex = MEASURES_PER_SYSTEM;
    const hoverPosition: MusicPosition = {
      staffId: 'treble',
      staffIndex: 0,
      measureIndex,
      beat: 0,
      pitch,
      x: getBeatX(measureIndex, 0, score.timeSignature.beats, score),
      y: getPitchY(pitch, 'treble', 0, staffGap, measureIndex, systemGap),
    };

    render(<StaffRenderer hoverPosition={hoverPosition} score={score} />);

    const ledgerLine = screen
      .getByTestId('ghost-event')
      .querySelector('[data-testid="ledger-line"]');

    expect(Number(ledgerLine?.getAttribute('y1'))).toBeCloseTo(
      getStaffTop(0, staffGap, measureIndex, systemGap) +
        STAFF_LINE_SPACING * 5,
      2,
    );
  });

  it('keeps ghost ledger lines attached to dynamically spaced later systems', () => {
    const firstSystemStressScore = placeScoreEvent(
      createEmptyScore('grand', { measureCount: 8 }),
      {
        eventId: 'first-system-low-note',
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch: { step: 'C', octave: 3 },
      },
    );
    const score = tryUpdateScoreEvent(firstSystemStressScore, 'first-system-low-note', {
      lyric: 'low',
    }).score;
    const measureIndex = MEASURES_PER_SYSTEM;
    const pitch: Pitch = { step: 'C', octave: 4 };
    const hoverPosition: MusicPosition = {
      staffId: 'treble',
      staffIndex: 0,
      measureIndex,
      beat: 0,
      pitch,
      x: getBeatX(measureIndex, 0, score.timeSignature.beats, score),
      y: getScoreStaffTop(score, 0, measureIndex) + STAFF_LINE_SPACING * 5,
    };

    render(<StaffRenderer hoverPosition={hoverPosition} score={score} />);

    const ledgerLines = screen
      .getByTestId('ghost-event')
      .querySelectorAll('[data-testid="ledger-line"]');

    expect(ledgerLines).toHaveLength(1);
    expect(Number(ledgerLines[0]?.getAttribute('y1'))).toBeCloseTo(
      getScoreStaffTop(score, 0, measureIndex) + STAFF_LINE_SPACING * 5,
      2,
    );
  });

  it('keeps the grand staff gap stable when ledger ink still has clearance', () => {
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'treble-low-ledger',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'F', octave: 3 },
    });

    render(<StaffRenderer score={score} />);

    const connector = screen.getAllByTestId('grand-staff-connector')[0];
    const dynamicGap = getScoreStaffGap(score);

    expect(dynamicGap).toBe(STAFF_GAP);
    expect(Number(connector.getAttribute('y2')) - Number(connector.getAttribute('y1'))).toBeCloseTo(
      dynamicGap + STAFF_LINE_SPACING * 4,
      2,
    );
    expect(screen.getAllByTestId('score-event')).toHaveLength(1);
  });

  it('widens the grand staff gap when ledger ink from both staves would get too close', () => {
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
    render(<StaffRenderer score={score} />);
    const connector = screen.getAllByTestId('grand-staff-connector')[0];
    const dynamicGap = getScoreStaffGap(score);

    expect(dynamicGap).toBeGreaterThan(STAFF_GAP);
    expect(Number(connector.getAttribute('y2')) - Number(connector.getAttribute('y1'))).toBeCloseTo(
      dynamicGap + STAFF_LINE_SPACING * 4,
      2,
    );
    expect(screen.getAllByTestId('score-event')).toHaveLength(2);
  });

  it('keeps a low treble ledger stable when it still has enough bass clearance', () => {
    const pitch: Pitch = { step: 'C', octave: 3 };
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'treble-colliding-ledger',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch,
    });

    render(<StaffRenderer score={score} />);

    const dynamicGap = getScoreStaffGap(score);
    const bassTop = getStaffTop(1, dynamicGap, 0, getScoreSystemGap(score));
    const noteY = getPitchY(
      pitch,
      'treble',
      0,
      dynamicGap,
      0,
      getScoreSystemGap(score),
    );

    expect(dynamicGap).toBe(STAFF_GAP);
    expect(bassTop - noteY).toBeGreaterThan(22);
    expect(screen.getAllByTestId('score-event')).toHaveLength(1);
  });

  it('keeps pitched hit targets on noteheads instead of full stem bounds across grand staves', () => {
    const trebleScore = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'upper-click-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = placeScoreEvent(trebleScore, {
      eventId: 'lower-stem-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const { container } = render(<StaffRenderer score={score} />);
    const lowerTarget = container.querySelector(
      '[data-testid="score-event"][data-event-id="lower-stem-note"] .score-event-target',
    );
    const lowerTargetY = Number(lowerTarget?.getAttribute('y'));
    const lowerTargetHeight = Number(lowerTarget?.getAttribute('height'));
    const lowerTargetCenterY = lowerTargetY + lowerTargetHeight / 2;
    const bassNoteY = getPitchY(
      { step: 'C', octave: 3 },
      'bass',
      1,
      getScoreStaffGap(score),
      0,
      getScoreSystemGap(score),
    );
    const trebleNoteY = getPitchY(
      { step: 'G', octave: 4 },
      'treble',
      0,
      getScoreStaffGap(score),
      0,
      getScoreSystemGap(score),
    );

    expect(lowerTargetHeight).toBeLessThanOrEqual(40);
    expect(lowerTargetCenterY).toBeCloseTo(bassNoteY, 2);
    expect(lowerTargetY).toBeGreaterThan(trebleNoteY + 20);
  });

  it('keeps legacy pitches within safety rails before spacing the grand staff', () => {
    const score = createEmptyScore('grand');

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push({
      id: 'legacy-underflow',
      kind: 'note',
      beat: 0,
      duration: 'quarter',
      pitch: { step: 'C', octave: 0 },
    });

    render(<StaffRenderer score={score} />);
    const connector = screen.getAllByTestId('grand-staff-connector')[0];
    const dynamicGap = getScoreStaffGap(score);

    expect(dynamicGap).toBe(STAFF_GAP);
    expect(
      Number(connector.getAttribute('y2')) - Number(connector.getAttribute('y1')),
    ).toBeCloseTo(STAFF_GAP + STAFF_LINE_SPACING * 4, 2);
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
      expectedLedgerLines: 4,
      pitch: { step: 'C', octave: 3 },
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
        '.vexflow-output .vf-user-event[data-event-id="ledger-stress-note"]',
      );
      const ghostEvent = screen.getByTestId('ghost-event');
      const svgHeight = getScoreSvgHeight(scoreType);

      expect(placedEvent).not.toBeNull();
      expect(
        ghostEvent.querySelectorAll('[data-testid="ledger-line"]'),
      ).toHaveLength(expectedLedgerLines);
      expectRenderedYsInsideSvg(ghostEvent, svgHeight);
    },
  );

  it('renders eighth-note flags with VexFlow instead of the custom SVG notehead', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'eighth-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'B', octave: 4 },
    });
    const { container } = render(<StaffRenderer score={score} />);

    expect(
      container.querySelector('.vexflow-output .vf-user-event[data-event-id="eighth-note"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('.vexflow-output .vf-flag').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.score-event-notehead')).toHaveLength(0);
  });

  it('beams consecutive short notes through VexFlow instead of leaving separate flags', () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'eighth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'B', octave: 4 },
    });
    const score = placeScoreEvent(firstNoteScore, {
      eventId: 'eighth-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const { container } = render(<StaffRenderer score={score} />);

    expect(container.querySelectorAll('.vexflow-output .vf-beam').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.vexflow-output .vf-flag')).toHaveLength(0);
  });

  it('renders same-beat notes in separate voices as independent targets', () => {
    const voiceOneScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'voice-one-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
      voiceIndex: 0,
    });
    const score = placeScoreEvent(voiceOneScore, {
      eventId: 'voice-two-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
      voiceIndex: 1,
    });
    const { container } = render(<StaffRenderer score={score} />);

    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="voice-one-note"][data-voice-index="0"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="voice-two-note"][data-voice-index="1"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="score-event"][data-event-id="voice-one-note"][data-voice-index="0"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="score-event"][data-event-id="voice-two-note"][data-voice-index="1"]',
      ),
    ).not.toBeNull();
  });

  it('renders chord symbols, lyrics, and section markers from score annotations', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'annotated-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const annotatedScore = tryUpdateScoreEvent(noteScore, 'annotated-note', {
      chordSymbol: 'E7/D',
      lyric: 'cho',
    }).score;
    const score = setMeasureSectionMarker(annotatedScore, 0, 'A1');

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-chord-symbol')).toHaveTextContent('E7/D');
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('cho');
      expect(screen.getByTestId('rendered-section-marker')).toHaveTextContent('A1');
    });
  });

  it('renders lyric-note map connectors only when the annotation map is enabled', async () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'lyric-map-start',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'lyric-map-follow',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryUpdateScoreEvent(secondNoteScore, 'lyric-map-start', {
      lyric: 'sing',
      lyricMap: { eventIds: ['lyric-map-start', 'lyric-map-follow'] },
    }).score;
    const { rerender } = render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('sing');
    });
    expect(screen.queryByTestId('lyric-map-connector')).not.toBeInTheDocument();

    rerender(<StaffRenderer score={score} showLyricMap />);

    await waitFor(() => {
      expect(screen.getByTestId('lyric-map-connector')).toHaveAttribute(
        'data-target-event-ids',
        'lyric-map-start lyric-map-follow',
      );
    });
    expect(screen.getByTestId('lyric-map-connector')).toHaveAttribute(
      'data-map-cardinality',
      'range',
    );
    const targetDotXs = screen
      .getAllByTestId('lyric-map-target-dot')
      .map((dot) => Number(dot.getAttribute('cx')));
    const lyricX = Number(screen.getByTestId('rendered-lyric').getAttribute('x'));

    expect(targetDotXs).toHaveLength(2);
    expect(lyricX).toBeCloseTo(
      (Math.min(...targetDotXs) + Math.max(...targetDotXs)) / 2,
      1,
    );
  });

  it('overlays voice, above, and below zones for annotation debugging', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'zone-debug-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'zone-debug-note', {
      dynamic: 'mf',
      lyric: 'zone',
    }).score;

    render(<StaffRenderer score={score} showLayoutZones />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('zone');
    });

    const zoneKinds = screen
      .getAllByTestId('voice-zone-debug')
      .map((node) => node.getAttribute('data-zone-kind'));
    const zones = screen.getAllByTestId('voice-zone-debug');
    const aboveZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'above' &&
        node.getAttribute('data-staff-id') === 'treble',
    );
    const belowZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'below' &&
        node.getAttribute('data-staff-id') === 'treble',
    );
    const voiceZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'voice' &&
        node.getAttribute('data-staff-id') === 'treble',
    );

    expect(zoneKinds).toEqual(expect.arrayContaining(['above', 'voice', 'below']));
    expect(aboveZone?.tagName.toLowerCase()).toBe('line');
    expect(aboveZone).toHaveAttribute('data-zone-empty', 'true');
    expect(belowZone?.tagName.toLowerCase()).toBe('rect');
    expect(belowZone).toHaveAttribute('data-zone-empty', 'false');
    expect(voiceZone?.tagName.toLowerCase()).toBe('rect');

    const voiceTop = Number(voiceZone?.getAttribute('y'));
    const voiceBottom = voiceTop + Number(voiceZone?.getAttribute('height'));

    expect(Number(aboveZone?.getAttribute('y1'))).toBeCloseTo(voiceTop, 1);
    expect(Number(belowZone?.getAttribute('y'))).toBeCloseTo(voiceBottom, 1);
  });

  it('includes clef ink in empty voice zone debugging', () => {
    const score = createEmptyScore('grand');
    const trebleStaffTop = getScoreStaffTop(score, 0, 0);
    const bassStaffTop = getScoreStaffTop(score, 1, 0);

    render(<StaffRenderer score={score} showLayoutZones />);

    const zones = screen.getAllByTestId('voice-zone-debug');
    const trebleVoiceZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'voice' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-system-index') === '0' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const trebleAboveZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'above' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-system-index') === '0' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const trebleBelowZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'below' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-system-index') === '0' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const voiceTop = Number(trebleVoiceZone?.getAttribute('y'));
    const voiceBottom =
      voiceTop + Number(trebleVoiceZone?.getAttribute('height'));
    const bassVoiceZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'voice' &&
        node.getAttribute('data-staff-id') === 'bass' &&
        node.getAttribute('data-system-index') === '0' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const bassVoiceTop = Number(bassVoiceZone?.getAttribute('y'));
    const bassVoiceBottom =
      bassVoiceTop + Number(bassVoiceZone?.getAttribute('height'));

    expect(trebleVoiceZone?.tagName.toLowerCase()).toBe('rect');
    expect(voiceTop).toBeLessThan(trebleStaffTop);
    expect(voiceBottom).toBeGreaterThanOrEqual(
      trebleStaffTop + STAFF_LINE_SPACING * 4,
    );
    expect(bassVoiceBottom).toBeGreaterThanOrEqual(
      bassStaffTop + STAFF_LINE_SPACING * 4,
    );
    expect(Number(trebleAboveZone?.getAttribute('y1'))).toBeCloseTo(
      voiceTop,
      1,
    );
    expect(Number(trebleBelowZone?.getAttribute('y1'))).toBeCloseTo(
      voiceBottom,
      1,
    );
  });

  it('expands a single voice zone through low ledger-line ink', () => {
    const lowPitch: Pitch = { step: 'A', octave: 3 };
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'low-ledger-zone-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: lowPitch,
    });

    render(<StaffRenderer score={score} showLayoutZones />);

    const voiceZone = screen.getAllByTestId('voice-zone-debug').find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'voice' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-system-index') === '0' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const voiceTop = Number(voiceZone?.getAttribute('y'));
    const voiceBottom = voiceTop + Number(voiceZone?.getAttribute('height'));
    const pitchY = getPitchY(lowPitch, 'treble', 0);
    const lowestLedgerY = Math.max(
      ...getLedgerLineYsForScore(pitchY, score, 0, 0),
    );

    expect(voiceBottom).toBeGreaterThanOrEqual(lowestLedgerY + 15);
    expect(voiceBottom).toBeGreaterThanOrEqual(pitchY + 15);
  });

  it('keeps annotation zones out of the fixed gap between voice lanes', async () => {
    const upperVoiceScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'upper-lane-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 5 },
      voiceIndex: 0,
    });
    const lowerVoiceScore = placeScoreEvent(upperVoiceScore, {
      eventId: 'lower-lane-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
      voiceIndex: 1,
    });
    const annotatedUpperScore = tryUpdateScoreEvent(
      lowerVoiceScore,
      'upper-lane-note',
      {
        lyric: 'up',
      },
    ).score;
    const score = tryUpdateScoreEvent(annotatedUpperScore, 'lower-lane-note', {
      chordSymbol: 'Lo',
    }).score;

    render(<StaffRenderer score={score} showLayoutZones />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('up');
      expect(screen.getByTestId('rendered-chord-symbol')).toHaveTextContent('Lo');
    });

    const getZoneBounds = (zone: Element | undefined) => {
      if (!zone) {
        return null;
      }

      if (zone.tagName.toLowerCase() === 'line') {
        const y = Number(zone.getAttribute('y1'));

        return { maxY: y, minY: y };
      }

      const minY = Number(zone.getAttribute('y'));

      return {
        maxY: minY + Number(zone.getAttribute('height')),
        minY,
      };
    };
    const zones = screen.getAllByTestId('voice-zone-debug');
    const upperBelowZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'below' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-voice-index') === '0',
    );
    const lowerAboveZone = zones.find(
      (node) =>
        node.getAttribute('data-zone-kind') === 'above' &&
        node.getAttribute('data-staff-id') === 'treble' &&
        node.getAttribute('data-voice-index') === '1',
    );
    const upperBelowBounds = getZoneBounds(upperBelowZone);
    const lowerAboveBounds = getZoneBounds(lowerAboveZone);

    expect(upperBelowBounds).not.toBeNull();
    expect(lowerAboveBounds).not.toBeNull();
    expect(
      (lowerAboveBounds?.minY ?? 0) - (upperBelowBounds?.maxY ?? 0),
    ).toBeGreaterThanOrEqual(17);
  });

  it('keeps lyric map connectors local when a target is on another system', async () => {
    const firstNoteScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: 8 }),
      {
        eventId: 'cross-system-lyric',
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch: { step: 'E', octave: 4 },
      },
    );
    const secondSystemNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'cross-system-target',
      staffId: 'treble',
      measureIndex: MEASURES_PER_SYSTEM,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = tryUpdateScoreEvent(secondSystemNoteScore, 'cross-system-lyric', {
      lyric: 'hold',
      lyricMap: { eventIds: ['cross-system-target'] },
    }).score;

    render(<StaffRenderer score={score} showLyricMap />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('hold');
      expect(screen.getByTestId('lyric-map-connector')).toHaveAttribute(
        'data-target-event-ids',
        'cross-system-target',
      );
    });

    const connector = screen.getByTestId('lyric-map-connector');
    const y1 = Number(connector.getAttribute('y1'));
    const y2 = Number(connector.getAttribute('y2'));

    expect(Math.abs(y2 - y1)).toBeLessThanOrEqual(STAFF_LINE_SPACING * 3);
  });

  it('renders dynamic, fermata, pedal, and glissando event markings', async () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'marked-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'marked-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = tryUpdateScoreEvent(secondNoteScore, 'marked-note-1', {
      dynamic: 'mf',
      fermata: true,
      glissando: true,
      pedal: 'start',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-dynamic')).toHaveTextContent('mf');
      expect(screen.getByTestId('rendered-fermata')).toBeInTheDocument();
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
      expect(screen.getByTestId('rendered-glissando')).toBeInTheDocument();
    });
  });

  it('keeps two compact below-staff annotation rows before moving the next marking above', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'dense-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'dense-annotation-note', {
      dynamic: 'mf',
      lyric: 'sing',
      pedal: 'start',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('sing');
      expect(screen.getByTestId('rendered-dynamic')).toHaveTextContent('mf');
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const dynamicY = Number(screen.getByTestId('rendered-dynamic').getAttribute('y'));
    const pedalY = Number(screen.getByTestId('rendered-pedal').getAttribute('y'));

    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-row',
      '0',
    );
    expect(screen.getByTestId('rendered-dynamic')).toHaveAttribute(
      'data-annotation-row',
      '1',
    );
    expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
      'data-annotation-row',
      '0',
    );
    expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
      'data-annotation-side',
      'above',
    );
    expect(dynamicY - lyricY).toBeGreaterThanOrEqual(24);
    expect(pedalY).toBeLessThan(lyricY);
  });

  it('places below-staff annotations under low note ink instead of the fixed staff bottom', async () => {
    const lowPitch: Pitch = { step: 'A', octave: 3 };
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'low-annotated-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: lowPitch,
    });
    const score = tryUpdateScoreEvent(noteScore, 'low-annotated-note', {
      dynamic: 'mf',
      lyric: 'cc',
      pedal: 'start',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('cc');
      expect(screen.getByTestId('rendered-dynamic')).toHaveTextContent('mf');
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const dynamicY = Number(screen.getByTestId('rendered-dynamic').getAttribute('y'));
    const pedalY = Number(screen.getByTestId('rendered-pedal').getAttribute('y'));
    const lowPitchY = getPitchY(lowPitch, 'treble', 0);

    expect(lyricY).toBeGreaterThan(lowPitchY + 24);
    expect(dynamicY - lyricY).toBeGreaterThanOrEqual(24);
    expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
      'data-annotation-side',
      'above',
    );
    expect(pedalY).toBeLessThan(lyricY);
  });

  it('keeps below-staff annotations clear of lower parallel voice ink', async () => {
    const annotatedVoiceScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'annotated-upper-voice',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
      voiceIndex: 0,
    });
    const lowParallelVoiceScore = placeScoreEvent(annotatedVoiceScore, {
      eventId: 'low-parallel-voice',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
      voiceIndex: 1,
    });
    const score = tryUpdateScoreEvent(
      lowParallelVoiceScore,
      'annotated-upper-voice',
      {
        lyric: 'km',
      },
    ).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('km');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const lowerVoiceY = getPitchY({ step: 'C', octave: 3 }, 'treble', 0);

    expect(lyricY).toBeGreaterThan(lowerVoiceY + 24);
  });

  it('aligns below-staff lyrics to the owning voice bottom within the system', async () => {
    const lowNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'distant-low-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const annotatedNoteScore = placeScoreEvent(lowNoteScore, {
      eventId: 'local-annotated-note',
      staffId: 'treble',
      measureIndex: 2,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryUpdateScoreEvent(annotatedNoteScore, 'local-annotated-note', {
      lyric: 'em',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('em');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const lyric = screen.getByTestId('rendered-lyric');
    const lyricTop = lyricY - ANNOTATION_METRICS.lyric.height;
    const lowPitchY = getPitchY({ step: 'C', octave: 3 }, 'treble', 0);
    const expectedVoiceBottom =
      lowPitchY + NOTEHEAD_ANNOTATION_INK_PADDING + BELOW_STAFF_INK_GAP;

    expect(lyric).toHaveAttribute('data-voice-index', '0');
    expect(lyricTop).toBeGreaterThanOrEqual(expectedVoiceBottom);
    expect(lyricTop).toBeLessThanOrEqual(expectedVoiceBottom + 5);
  });

  it('keeps manual above annotation overrides close to the owning staff', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'manual-above-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'A', octave: 5 },
    });
    const annotatedScore = tryUpdateScoreEvent(
      noteScore,
      'manual-above-annotation-note',
      {
        lyric: 'km',
      },
    ).score;
    const score = tryUpdateScoreEvent(
      annotatedScore,
      'manual-above-annotation-note',
      {
        annotationPlacement: {
          kind: 'lyric',
          side: 'above',
        },
      },
    ).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('km');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));

    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-side',
      'above',
    );
    expect(lyricY).toBeGreaterThanOrEqual(getStaffTop(0) - 42);
    expect(lyricY).toBeLessThan(getStaffTop(0));
  });

  it('keeps manual above lyrics clear of the owning voice ink', async () => {
    const lowNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'manual-above-low-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'F', octave: 4 },
    });
    const highNoteScore = placeScoreEvent(lowNoteScore, {
      eventId: 'same-voice-high-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 6 },
    });
    const annotatedScore = tryUpdateScoreEvent(highNoteScore, 'manual-above-low-note', {
      lyric: 'toi',
    }).score;
    const score = tryUpdateScoreEvent(annotatedScore, 'manual-above-low-note', {
      annotationPlacement: {
        kind: 'lyric',
        side: 'above',
      },
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('toi');
    });

    const lyricY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const lyricBottom = lyricY + ANNOTATION_METRICS.lyric.descent;
    const highNoteInkTop =
      getPitchY({ step: 'C', octave: 6 }, 'treble', 0) -
      NOTEHEAD_ANNOTATION_INK_PADDING;

    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-side',
      'above',
    );
    expect(lyricBottom).toBeLessThanOrEqual(
      highNoteInkTop - ABOVE_STAFF_INK_GAP,
    );
  });

  it('honors a manual annotation placement override', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'manual-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const annotatedScore = tryUpdateScoreEvent(noteScore, 'manual-annotation-note', {
      dynamic: 'mf',
      lyric: 'sing',
      pedal: 'start',
    }).score;
    const score = tryUpdateScoreEvent(annotatedScore, 'manual-annotation-note', {
      annotationPlacement: {
        kind: 'pedal',
        side: 'below',
      },
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
    });

    expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
      'data-annotation-side',
      'below',
    );
    expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
      'data-annotation-row',
      '2',
    );
  });

  it('widens the grand staff gap so treble annotations do not overlap the bass staff', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'grand-low-annotated-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'A', octave: 3 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'grand-low-annotated-note', {
      dynamic: 'mf',
      lyric: 'cc',
      pedal: 'start',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
    });

    const staffGap = getScoreStaffGap(score);
    const bassTop = getStaffTop(1, staffGap, 0, getScoreSystemGap(score));
    const pedalBaselineY = Number(
      screen.getByTestId('rendered-pedal').getAttribute('y'),
    );

    expect(staffGap).toBeGreaterThan(STAFF_GAP);
    expect(pedalBaselineY + 6).toBeLessThan(bassTop - 8);
  });

  it('widens only the grand-staff system that needs annotation space', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('grand', { measureCount: 8 }), {
      eventId: 'first-system-low-annotation',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'A', octave: 3 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'first-system-low-annotation', {
      dynamic: 'mf',
      lyric: 'cc',
      pedal: 'start',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
    });

    const firstSystemGap = getScoreStaffGap(score, 0);
    const secondSystemGap = getScoreStaffGap(score, MEASURES_PER_SYSTEM);
    const secondSystemTrebleTop = getScoreStaffTop(score, 0, MEASURES_PER_SYSTEM);

    expect(firstSystemGap).toBeGreaterThan(secondSystemGap);
    expect(secondSystemGap).toBe(STAFF_GAP);
    expect(secondSystemTrebleTop).toBe(
      getScoreSystemGap(score, 0) + getStaffTop(0),
    );
  });

  it('moves nearby long lyrics to another row when they would overlap', async () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'lyric-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'lyric-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const firstLyricScore = tryUpdateScoreEvent(secondNoteScore, 'lyric-note-1', {
      lyric: 'overlapping',
    }).score;
    const score = tryUpdateScoreEvent(firstLyricScore, 'lyric-note-2', {
      lyric: 'syllables',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-lyric')).toHaveLength(2);
    });

    const lyricRows = screen
      .getAllByTestId('rendered-lyric')
      .map((node) => node.getAttribute('data-annotation-row'));

    expect(new Set(lyricRows).size).toBeGreaterThan(1);
  });

  it('renders the real-world piano excerpt fixture annotations', async () => {
    render(<StaffRenderer score={duChoTanTheExcerptFixture} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-chord-symbol').map((node) => node.textContent))
        .toEqual(['D', 'E7/D']);
      expect(screen.getAllByTestId('rendered-lyric').map((node) => node.textContent))
        .toEqual(['du', 'cho']);
      expect(screen.getByTestId('rendered-section-marker')).toHaveTextContent('Intro');
      expect(screen.getByTestId('rendered-dynamic')).toHaveTextContent('mf');
      expect(screen.getByTestId('rendered-glissando')).toBeInTheDocument();
    });
  });

  it('beams consecutive short notes independently per voice', () => {
    const eventRequests = [
      ['voice-one-eighth-1', 0, 0, 'B', 4],
      ['voice-one-eighth-2', 0, 0.5, 'C', 5],
      ['voice-two-eighth-1', 1, 0, 'E', 4],
      ['voice-two-eighth-2', 1, 0.5, 'F', 4],
    ] as const;
    const score = eventRequests.reduce(
      (currentScore, [eventId, voiceIndex, beat, step, octave]) =>
        placeScoreEvent(currentScore, {
          eventId,
          staffId: 'treble',
          measureIndex: 0,
          beat,
          duration: 'eighth',
          entryMode: 'note',
          pitch: { step, octave },
          voiceIndex,
        }),
      createEmptyScore('treble'),
    );
    const { container } = render(<StaffRenderer score={score} />);

    expect(container.querySelectorAll('.vexflow-output .vf-beam').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.vexflow-output .vf-flag')).toHaveLength(0);
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

  it('places clicks on the current rhythm slot instead of freehand beats', () => {
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
        beat: 0,
        measureIndex: 0,
        pitch: { step: 'B', octave: 4 },
        staffId: 'treble',
      }),
    );
  });
});
