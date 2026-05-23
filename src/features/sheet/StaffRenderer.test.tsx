import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  placeScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setMeasureSectionMarker,
  tryFlipScoreEventStemDirection,
  tryPlaceTupletGroup,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import { trySetClefChange } from '../../domain/score/clefChanges';
import {
  tryToggleSlurToNext,
  tryToggleTieToNext,
} from '../../domain/score/noteConnections';
import { tryToggleOttavaToNext } from '../../domain/score/ottava';
import { createEmptyScore } from '../../domain/score/factories';
import {
  annotationDragLabFixture,
  duChoTanTheExcerptFixture,
  extremeClefOttavaChromaticFixture,
  pianoPolyphonyStudyFixture,
  trebleStudyFixture,
} from '../../domain/score/fixtures';
import { extremeScoreFixtureCatalog } from '../../domain/score/fixtureCatalog';
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
import { buildFingeringHints } from '../fingering/fingeringHints';
import { DEFAULT_INPUT_SLOT_WIDTH } from './inputSlotLayout';
import {
  ANNOTATION_METRICS,
  ABOVE_STAFF_INK_GAP,
  BELOW_STAFF_INK_GAP,
  NOTEHEAD_ANNOTATION_INK_PADDING,
  STAFF_OUTSIDE_ANNOTATION_GAP,
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

function createThreeQuarterNoteScore() {
  const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 1 }), {
    beat: 0,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'event-c',
    measureIndex: 0,
    pitch: { step: 'C', octave: 4 },
    staffId: 'treble',
  });
  const secondScore = placeScoreEvent(firstScore, {
    beat: 1,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'event-e',
    measureIndex: 0,
    pitch: { step: 'E', octave: 4 },
    staffId: 'treble',
  });

  return placeScoreEvent(secondScore, {
    beat: 2,
    duration: 'quarter',
    entryMode: 'note',
    eventId: 'event-g',
    measureIndex: 0,
    pitch: { step: 'G', octave: 4 },
    staffId: 'treble',
  });
}

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
  it('renders fingering hint annotations when enabled', async () => {
    render(
      <StaffRenderer
        score={trebleStudyFixture}
        showFingeringHints
        fingeringHints={buildFingeringHints(trebleStudyFixture)}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-fingering-hint').length).toBeGreaterThan(
        0,
      );
    });
    expect(screen.getAllByTestId('rendered-fingering-hint')[0]).toHaveAttribute(
      'data-hand',
      'right',
    );
    expect(
      screen.getAllByTestId('rendered-fingering-leader').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId('rendered-fingering-leader')[0]?.tagName.toLowerCase(),
    ).toBe('line');
  });

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
    expect(screen.getByTestId('rendered-tempo-mark')).toHaveTextContent(
      'Moderato',
    );
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

  it('renders a triplet bracket for tuplet events', () => {
    const result = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'render-triplet',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const { container } = render(<StaffRenderer score={result.score} />);

    expect(result.placed).toBe(true);
    expect(container.querySelector('[data-tuplet-id="tuplet-render-triplet"]'))
      .toBeInTheDocument();
    expect(screen.getAllByTestId('rendered-tuplet')).toHaveLength(1);
  });

  it('renders tie and slur connection marks from score data', () => {
    const firstScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: 1 }),
      {
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        eventId: 'connection-source',
        measureIndex: 0,
        pitch: { step: 'C', octave: 4 },
        staffId: 'treble',
      },
    );
    const secondScore = placeScoreEvent(firstScore, {
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'connection-target',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const tiedScore = tryToggleTieToNext(secondScore, 'connection-source').score;
    const score = tryToggleSlurToNext(tiedScore, 'connection-source').score;

    render(<StaffRenderer score={score} />);

    expect(screen.getByTestId('rendered-tie')).toHaveAttribute(
      'data-target-id',
      'connection-target',
    );
    expect(screen.getByTestId('rendered-slur')).toHaveAttribute(
      'data-source-id',
      'connection-source',
    );
  });

  it('places tie and slur above notes whose rendered stems point down', () => {
    const firstScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: 1 }),
      {
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        eventId: 'high-connection-source',
        measureIndex: 0,
        pitch: { step: 'A', octave: 5 },
        staffId: 'treble',
      },
    );
    const secondScore = placeScoreEvent(firstScore, {
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'high-connection-target',
      measureIndex: 0,
      pitch: { step: 'A', octave: 5 },
      staffId: 'treble',
    });
    const tiedScore = tryToggleTieToNext(
      secondScore,
      'high-connection-source',
    ).score;
    const score = tryToggleSlurToNext(
      tiedScore,
      'high-connection-source',
    ).score;
    const { container } = render(<StaffRenderer score={score} />);

    expect(
      container.querySelector(
        '.vf-user-event[data-event-id="high-connection-source"]',
      ),
    ).toHaveAttribute('data-stem-direction', 'down');
    expect(screen.getByTestId('rendered-tie')).toHaveAttribute(
      'data-connection-side',
      'above',
    );
    expect(screen.getByTestId('rendered-slur')).toHaveAttribute(
      'data-connection-side',
      'above',
    );
  });

  it('splits VexFlow tie and slur marks across a system break', async () => {
    const sourceMeasureIndex = MEASURES_PER_SYSTEM - 1;
    const targetMeasureIndex = MEASURES_PER_SYSTEM;
    const firstScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: MEASURES_PER_SYSTEM * 2 }),
      {
        beat: 3,
        duration: 'quarter',
        entryMode: 'note',
        eventId: 'cross-system-connection-source',
        measureIndex: sourceMeasureIndex,
        pitch: { step: 'C', octave: 4 },
        staffId: 'treble',
      },
    );
    const secondScore = placeScoreEvent(firstScore, {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'cross-system-connection-target',
      measureIndex: targetMeasureIndex,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const tiedScore = tryToggleTieToNext(
      secondScore,
      'cross-system-connection-source',
    ).score;
    const score = tryToggleSlurToNext(
      tiedScore,
      'cross-system-connection-source',
    ).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-tie')).toHaveLength(2);
      expect(screen.getAllByTestId('rendered-slur')).toHaveLength(2);
    });
    screen.getAllByTestId('rendered-tie').forEach((tie) => {
      expect(tie).toHaveAttribute(
        'data-source-id',
        'cross-system-connection-source',
      );
      expect(tie).toHaveAttribute(
        'data-target-id',
        'cross-system-connection-target',
      );
    });
    screen.getAllByTestId('rendered-slur').forEach((slur) => {
      expect(slur).toHaveAttribute(
        'data-source-id',
        'cross-system-connection-source',
      );
      expect(slur).toHaveAttribute(
        'data-target-id',
        'cross-system-connection-target',
      );
    });
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
      Number(
        screen
          .getByRole('button', { name: 'Note C4 measure 1 beat 1' })
          .getAttribute('data-layout-x'),
      ),
      2,
    );
  });

  it('nudges the existing note at the insert point without drawing fake noteheads', async () => {
    const score = createThreeQuarterNoteScore();

    const { container } = render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={{
          ...trebleHover,
          beat: 1,
          pitch: { step: 'D', octave: 4 },
          x: getBeatX(0, 1, score.timeSignature.beats, score),
        }}
        placementMode="insert"
        score={score}
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector(
          '.vf-score-event[data-event-id="event-e"].vf-insert-preview-nudge',
        ),
      ).not.toBeNull(),
    );

    const shiftedE = container.querySelector(
      '.vf-score-event[data-event-id="event-e"].vf-insert-preview-nudge',
    ) as SVGElement;
    const unchangedC = container.querySelector(
      '.vf-score-event[data-event-id="event-c"].vf-insert-preview-nudge',
    );
    const unchangedG = container.querySelector(
      '.vf-score-event[data-event-id="event-g"].vf-insert-preview-nudge',
    );
    const shiftMatch = /translateX\(([-\d.]+)px\)/.exec(
      shiftedE.getAttribute('style') ?? '',
    );

    expect(shiftMatch).not.toBeNull();
    expect(Number(shiftMatch?.[1])).toBeGreaterThan(0);
    expect(unchangedC).toBeNull();
    expect(unchangedG).toBeNull();
    expect(screen.queryByTestId('insert-preview-layer')).not.toBeInTheDocument();
  });

  it('aligns insert cursor, ghost note, and rhythm box to the same rendered anchor', async () => {
    const score = createThreeQuarterNoteScore();
    const pitch = { step: 'D', octave: 4 } as const;

    render(
      <StaffRenderer
        duration="quarter"
        entryMode="note"
        hoverPosition={{
          ...trebleHover,
          beat: 1,
          pitch,
          x: getBeatX(0, 1, score.timeSignature.beats, score),
        }}
        inputCursor={{
          beat: 1,
          duration: 'quarter',
          measureIndex: 0,
          mode: 'note-input',
          pitchPreview: pitch,
          staffId: 'treble',
          staffIndex: 0,
        }}
        placementMode="insert"
        score={score}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('rhythm-slot')).toHaveAttribute(
        'data-layout-source',
        'vexflow',
      ),
    );

    const cursorX = Number(screen.getByTestId('insertion-cursor').getAttribute('x1'));
    const slotCenterX = Number(
      screen.getByTestId('rhythm-slot').getAttribute('data-slot-center-x'),
    );
    const ghostNotehead = screen
      .getByTestId('ghost-event')
      .querySelector('.score-event-notehead');
    const ghostX = Number(ghostNotehead?.getAttribute('cx'));

    expect(cursorX).toBeCloseTo(slotCenterX, 2);
    expect(ghostX).toBeCloseTo(slotCenterX, 2);
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

  it('renders the piano polyphony study with independent voice stems and beams', () => {
    const { container } = render(
      <StaffRenderer score={pianoPolyphonyStudyFixture} />,
    );

    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="poly-rh-v1-e5"][data-voice-index="0"][data-stem-direction="up"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="poly-rh-v2-c5-held"][data-voice-index="1"][data-stem-direction="down"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('.vexflow-output .vf-beam').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll(
        '[data-testid="score-event"][data-event-id^="poly-rh-v"]',
      ).length,
    ).toBeGreaterThanOrEqual(8);
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
    const thirdNoteScore = placeScoreEvent(secondNoteScore, {
      eventId: 'lyric-map-end',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = tryUpdateScoreEvent(thirdNoteScore, 'lyric-map-start', {
      lyric: 'sing',
      lyricMap: {
        eventIds: ['lyric-map-start', 'lyric-map-follow', 'lyric-map-end'],
      },
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
        'lyric-map-start lyric-map-follow lyric-map-end',
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

    expect(targetDotXs).toHaveLength(3);
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

  it('renders an inline clef change and places following notes in the active clef', async () => {
    const scoreWithClef = trySetClefChange(
      createEmptyScore('grand'),
      'bass',
      0,
      1,
      'treble',
    ).score;
    const score = placeScoreEvent(scoreWithClef, {
      eventId: 'bass-staff-treble-clef-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'A', octave: 5 },
    });
    const { container } = render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-clef-change')).toHaveAttribute(
        'data-clef',
        'treble',
      );
      expect(
        container.querySelector(
          '.vf-user-event[data-event-id="bass-staff-treble-clef-note"]',
        ),
      ).toBeInTheDocument();
    });

    const noteheadY = Number(
      container
        .querySelector(
          '.vf-user-notehead[data-event-id="bass-staff-treble-clef-note"]',
        )
        ?.getAttribute('data-notehead-y'),
    );

    expect(noteheadY).toBeCloseTo(
      getPitchY(
        { step: 'A', octave: 5 },
        'treble',
        1,
        getScoreStaffGap(score, 0),
      ),
    );
  });

  it('exposes inline clef changes as selectable overlay targets', async () => {
    const scoreWithClef = trySetClefChange(
      createEmptyScore('grand'),
      'bass',
      0,
      1,
      'treble',
    ).score;
    const clefChangeId =
      scoreWithClef.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const score = placeScoreEvent(scoreWithClef, {
      eventId: 'bass-staff-target-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'A', octave: 5 },
    });
    const { container } = render(
      <StaffRenderer
        isInputArmed={false}
        score={score}
        selectedClefChangeId={clefChangeId}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('clef-change-target')).toHaveAttribute(
        'data-clef-change-id',
        clefChangeId,
      );
      expect(
        container.querySelector(
          `.sheetlab-clef-change.is-selected[data-clef-change-id="${clefChangeId}"]`,
        ),
      ).toBeInTheDocument();
    });
  });

  it('exposes system-start clef changes without drawing a duplicate inline clef', async () => {
    const score = trySetClefChange(
      createEmptyScore('grand'),
      'bass',
      0,
      0,
      'treble',
    ).score;
    const clefChangeId =
      score.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const { container } = render(
      <StaffRenderer
        isInputArmed={false}
        score={score}
        selectedClefChangeId={clefChangeId}
      />,
    );

    await waitFor(() => {
      const target = screen.getByTestId('clef-change-target');
      const marker = container.querySelector(
        `.sheetlab-system-start-clef-change-marker[data-clef-change-id="${clefChangeId}"]`,
      );

      expect(target).toHaveAttribute('data-clef-change-id', clefChangeId);
      expect(target).toHaveAttribute('data-system-start', 'true');
      expect(target).toHaveAttribute('data-beat', '0');
      expect(marker).toHaveAttribute('data-testid', 'rendered-clef-change');
      expect(marker).toHaveAttribute('data-system-start', 'true');
      expect(marker).toHaveClass('is-selected');
      expect(
        container.querySelectorAll(
          `.sheetlab-clef-change[data-clef-change-id="${clefChangeId}"]`,
        ),
      ).toHaveLength(1);
    });
  });

  it('drags a selected clef change to another note boundary', async () => {
    const scoreWithClef = trySetClefChange(
      createEmptyScore('grand'),
      'bass',
      0,
      1,
      'treble',
    ).score;
    const firstNoteScore = placeScoreEvent(scoreWithClef, {
      eventId: 'bass-staff-source-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'A', octave: 5 },
    });
    const score = placeScoreEvent(firstNoteScore, {
      eventId: 'bass-staff-drop-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'B', octave: 5 },
    });
    const clefChangeId =
      score.parts[0]?.staves
        .find((staff) => staff.id === 'bass')
        ?.measures[0]?.clefChanges?.[0]?.id ?? '';
    const onMoveClefChange = vi.fn();
    const onSelectClefChange = vi.fn();

    render(
      <StaffRenderer
        isInputArmed={false}
        onMoveClefChange={onMoveClefChange}
        onSelectClefChange={onSelectClefChange}
        score={score}
        selectedClefChangeId={clefChangeId}
      />,
    );

    const overlay = screen.getByTestId('staff-renderer');

    await waitFor(() =>
      expect(screen.getByTestId('clef-change-target')).toBeInTheDocument(),
    );

    const target = screen.getByTestId('clef-change-target');
    fireEvent.mouseDown(target, {
      clientX: getBeatX(0, 1, score.timeSignature.beats, score),
      clientY: getPitchY({ step: 'A', octave: 5 }, 'treble', 1),
    });
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 2, score.timeSignature.beats, score),
      clientY: getPitchY({ step: 'B', octave: 5 }, 'treble', 1),
    });

    expect(screen.getByTestId('clef-change-preview')).toHaveAttribute(
      'data-clef',
      'treble',
    );

    fireEvent.mouseUp(overlay, {
      clientX: getBeatX(0, 2, score.timeSignature.beats, score),
      clientY: getPitchY({ step: 'B', octave: 5 }, 'treble', 1),
    });

    expect(onSelectClefChange).toHaveBeenCalledWith({
      clefChangeId,
      measureIndex: 0,
      staffId: 'bass',
    });
    expect(onMoveClefChange).toHaveBeenCalledWith(
      {
        clefChangeId,
        measureIndex: 0,
        staffId: 'bass',
      },
      expect.objectContaining({
        beat: 2,
        measureIndex: 0,
        staffId: 'bass',
      }),
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
      beat: 3,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const markedStartScore = tryUpdateScoreEvent(secondNoteScore, 'marked-note-1', {
      dynamic: 'mf',
      fermata: true,
      glissando: true,
      hairpin: 'crescendo',
      pedal: 'start',
    }).score;
    const score = tryUpdateScoreEvent(markedStartScore, 'marked-note-2', {
      pedal: 'release',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-dynamic')).toHaveTextContent('mf');
      expect(screen.getByTestId('rendered-fermata')).toBeInTheDocument();
      expect(screen.getAllByTestId('rendered-pedal')[0]).toHaveTextContent('Ped.');
      expect(screen.getByTestId('rendered-pedal-line')).toHaveAttribute(
        'data-source-id',
        'marked-note-1',
      );
      expect(screen.getByTestId('rendered-glissando')).toBeInTheDocument();
      expect(screen.getByTestId('rendered-hairpin')).toHaveAttribute(
        'data-hairpin',
        'crescendo',
      );
    });
  });

  it('continues a VexFlow hairpin across a system break', async () => {
    const sourceMeasureIndex = MEASURES_PER_SYSTEM - 1;
    const targetMeasureIndex = MEASURES_PER_SYSTEM;
    const firstNoteScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: MEASURES_PER_SYSTEM * 2 }),
      {
        eventId: 'cross-system-hairpin-source',
        staffId: 'treble',
        measureIndex: sourceMeasureIndex,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch: { step: 'C', octave: 4 },
      },
    );
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'cross-system-hairpin-target',
      staffId: 'treble',
      measureIndex: targetMeasureIndex,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = tryUpdateScoreEvent(
      secondNoteScore,
      'cross-system-hairpin-source',
      {
        hairpin: 'crescendo',
      },
    ).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-hairpin')).toHaveLength(2);
    });

    const continuations = screen
      .getAllByTestId('rendered-hairpin')
      .map((hairpin) => hairpin.getAttribute('data-continuation'));

    expect(continuations).toEqual(['start', 'end']);
    screen.getAllByTestId('rendered-hairpin').forEach((hairpin) => {
      expect(hairpin).toHaveAttribute(
        'data-source-id',
        'cross-system-hairpin-source',
      );
      expect(hairpin).toHaveAttribute(
        'data-target-id',
        'cross-system-hairpin-target',
      );
    });
  });

  it('continues a sustain pedal bracket across a system break', async () => {
    const sourceMeasureIndex = MEASURES_PER_SYSTEM - 1;
    const targetMeasureIndex = MEASURES_PER_SYSTEM;
    const firstNoteScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: MEASURES_PER_SYSTEM * 2 }),
      {
        eventId: 'cross-system-pedal-source',
        staffId: 'treble',
        measureIndex: sourceMeasureIndex,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch: { step: 'C', octave: 4 },
      },
    );
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'cross-system-pedal-target',
      staffId: 'treble',
      measureIndex: targetMeasureIndex,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const pedalStartScore = tryUpdateScoreEvent(
      secondNoteScore,
      'cross-system-pedal-source',
      {
        pedal: 'start',
      },
    ).score;
    const score = tryUpdateScoreEvent(pedalStartScore, 'cross-system-pedal-target', {
      pedal: 'release',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-pedal-line')).toHaveLength(2);
    });

    const continuations = screen
      .getAllByTestId('rendered-pedal-line')
      .map((pedalLine) => pedalLine.getAttribute('data-continuation'));

    expect(continuations).toEqual(['start', 'end']);
    screen.getAllByTestId('rendered-pedal-line').forEach((pedalLine) => {
      expect(pedalLine).toHaveAttribute(
        'data-source-id',
        'cross-system-pedal-source',
      );
      expect(pedalLine).toHaveAttribute(
        'data-target-id',
        'cross-system-pedal-target',
      );
    });
  });

  it('renders ottava range brackets from explicit score marks', async () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'ottava-render-source',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'ottava-render-target',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 5 },
    });
    const score = tryToggleOttavaToNext(
      secondNoteScore,
      'ottava-render-source',
      '8va',
    ).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-ottava')).toHaveAttribute(
        'data-ottava',
        '8va',
      );
      expect(screen.getByTestId('rendered-ottava')).toHaveAttribute(
        'data-source-id',
        'ottava-render-source',
      );
      expect(screen.getByTestId('rendered-ottava')).toHaveAttribute(
        'data-target-id',
        'ottava-render-target',
      );
    });
  });

  it('does not draw glissando across a system break until cross-system semantics are supported', async () => {
    const sourceMeasureIndex = MEASURES_PER_SYSTEM - 1;
    const targetMeasureIndex = MEASURES_PER_SYSTEM;
    const firstNoteScore = placeScoreEvent(
      createEmptyScore('treble', { measureCount: MEASURES_PER_SYSTEM * 2 }),
      {
        eventId: 'cross-system-glissando-source',
        staffId: 'treble',
        measureIndex: sourceMeasureIndex,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch: { step: 'C', octave: 4 },
      },
    );
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'cross-system-glissando-target',
      staffId: 'treble',
      measureIndex: targetMeasureIndex,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const score = tryUpdateScoreEvent(
      secondNoteScore,
      'cross-system-glissando-source',
      {
        glissando: true,
      },
    ).score;
    const { container } = render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vexflow-output .vf-user-event[data-event-id="cross-system-glissando-target"]',
        ),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId('rendered-glissando')).not.toBeInTheDocument();
  });

  it('keeps notation marks in the VexFlow layer and interaction maps in the overlay layer', async () => {
    const firstNoteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'boundary-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondNoteScore = placeScoreEvent(firstNoteScore, {
      eventId: 'boundary-note-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const thirdNoteScore = placeScoreEvent(secondNoteScore, {
      eventId: 'boundary-note-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: 3,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const tiedScore = tryToggleTieToNext(thirdNoteScore, 'boundary-note-1').score;
    const slurredScore = tryToggleSlurToNext(tiedScore, 'boundary-note-1').score;
    const annotatedFirstScore = tryUpdateScoreEvent(
      slurredScore,
      'boundary-note-1',
      {
        chordSymbol: 'C',
        dynamic: 'mf',
        fermata: true,
        lyric: 'map',
        lyricMap: { eventIds: ['boundary-note-1', 'boundary-note-2'] },
        pedal: 'start',
      },
    ).score;
    const annotatedSecondScore = tryUpdateScoreEvent(
      annotatedFirstScore,
      'boundary-note-2',
      {
        glissando: true,
        hairpin: 'crescendo',
      },
    ).score;
    const score = tryUpdateScoreEvent(annotatedSecondScore, 'boundary-note-3', {
      pedal: 'release',
    }).score;
    const { container } = render(<StaffRenderer score={score} showLyricMap />);

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vexflow-output [data-testid="rendered-hairpin"]',
        ),
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          '.notation-overlay [data-testid="lyric-map-connector"]',
        ),
      ).toBeInTheDocument();
    });

    [
      'rendered-chord-symbol',
      'rendered-dynamic',
      'rendered-fermata',
      'rendered-glissando',
      'rendered-hairpin',
      'rendered-lyric',
      'rendered-pedal',
      'rendered-pedal-line',
      'rendered-slur',
      'rendered-tie',
    ].forEach((testId) => {
      expect(
        container.querySelector(`.vexflow-output [data-testid="${testId}"]`),
      ).toBeInTheDocument();
      expect(
        container.querySelector(`.notation-overlay [data-testid="${testId}"]`),
      ).not.toBeInTheDocument();
    });
    expect(
      container.querySelector('.vexflow-output [data-testid="lyric-map-connector"]'),
    ).not.toBeInTheDocument();
  });

  it('renders multiple articulations on the same pitched event', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'articulated-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'articulated-note', {
      articulations: ['accent', 'staccato'],
    }).score;
    const { container } = render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vexflow-output .vf-user-event[data-event-id="articulated-note"]',
        ),
      ).toHaveAttribute('data-articulations', 'accent staccato');
    });
  });

  it.each(extremeScoreFixtureCatalog)(
    'renders the extreme fixture $label without leaking notation marks into the overlay',
    async (fixture) => {
      const score = fixture.score;
      const hasTuplet = fixture.capabilities.includes('tuplets');
      const hasLyricMap = fixture.capabilities.includes('lyric-map');
      const expectedOttavaCount = (score.marks ?? []).filter(
        (mark) => mark.scope === 'range' && mark.kind === 'ottava',
      ).length;
      const expectedRangeLyricMaps = score.parts.reduce(
        (total, part) =>
          total +
          part.staves.reduce(
            (staffTotal, staff) =>
              staffTotal +
              staff.measures.reduce(
                (measureTotal, measure) =>
                  measureTotal +
                  measure.voices.reduce(
                    (voiceTotal, voice) =>
                      voiceTotal +
                      voice.events.filter(
                        (event) =>
                          event.lyricMap && event.lyricMap.eventIds.length > 1,
                      ).length,
                    0,
                  ),
                0,
              ),
            0,
          ),
        0,
      );
      const hasVoiceTwo = score.parts.some((part) =>
        part.staves.some((staff) =>
          staff.measures.some((measure) =>
            measure.voices.some((voice, voiceIndex) => voiceIndex > 0 && voice.events.length > 0),
          ),
        ),
      );
      const { container } = render(
        <StaffRenderer score={score} showLayoutZones showLyricMap />,
      );

      await waitFor(() => {
        expect(
          container.querySelectorAll('.vexflow-output .vf-user-event').length,
        ).toBe(fixture.expectedEventCount);
      });

      expect(
        container.querySelectorAll('.notation-overlay [data-testid^="rendered-"]'),
      ).toHaveLength(0);
      if (hasTuplet) {
        expect(
          container.querySelectorAll('.vexflow-output [data-testid="rendered-tuplet"]').length,
        ).toBeGreaterThan(0);
      }
      expect(
        container.querySelectorAll('.vexflow-output [data-testid="rendered-ottava"]').length,
      ).toBeGreaterThanOrEqual(expectedOttavaCount);
      if (hasLyricMap) {
        expect(
          container.querySelectorAll('[data-testid="lyric-map-connector"]').length,
        ).toBeGreaterThanOrEqual(expectedRangeLyricMaps);
      }
      if (hasVoiceTwo) {
        expect(
          container.querySelectorAll('.vexflow-output .vf-user-event[data-voice-index="1"]').length,
        ).toBeGreaterThan(0);
      }
      expect(container.querySelectorAll('[data-testid="voice-zone-debug"]').length)
        .toBeGreaterThan(0);
    },
  );

  it('renders dense chromatic key signatures with real glyphs and separated header marks', async () => {
    render(<StaffRenderer score={extremeClefOttavaChromaticFixture} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('rendered-key-signature-symbol').length)
        .toBeGreaterThan(0);
    });

    screen.getAllByTestId('rendered-key-signature-symbol').forEach((symbol) => {
      expect(['♯', '♭']).toContain(symbol.textContent);
      expect(symbol.textContent).not.toMatch(/[Ãâ]/);
    });

    const tempoY = Number(
      screen.getByTestId('rendered-tempo-mark').getAttribute('y'),
    );
    const firstSectionText = screen
      .getAllByTestId('rendered-section-marker')[0]
      ?.querySelector('text');
    const sectionY = Number(firstSectionText?.getAttribute('y'));

    expect(Number.isFinite(tempoY)).toBe(true);
    expect(Number.isFinite(sectionY)).toBe(true);
    expect(sectionY - tempoY).toBeGreaterThanOrEqual(22);
  });

  it('renders manual stem direction overrides on the attached beam group only', async () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'flipped-beam-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const secondScore = placeScoreEvent(firstScore, {
      eventId: 'flipped-beam-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const thirdScore = placeScoreEvent(secondScore, {
      eventId: 'flipped-beam-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryFlipScoreEventStemDirection(
      thirdScore,
      'flipped-beam-2',
    ).score;
    const { container } = render(<StaffRenderer score={score} />);

    await waitFor(() => {
      const flippedEvents = [
        'flipped-beam-1',
        'flipped-beam-2',
      ].map((eventId) =>
        container.querySelector(
          `.vexflow-output .vf-user-event[data-event-id="${eventId}"]`,
        ),
      );
      const nextBeatEvent = container.querySelector(
        '.vexflow-output .vf-user-event[data-event-id="flipped-beam-3"]',
      );

      flippedEvents.forEach((element) => {
        expect(element).toHaveAttribute('data-stem-direction', 'down');
        expect(element).toHaveAttribute(
          'data-stem-direction-source',
          'manual',
        );
      });
      expect(nextBeatEvent).toHaveAttribute(
        'data-stem-direction-source',
        'auto',
      );
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
      'data-annotation-side',
      'above',
    );
    expect(
      Number(screen.getByTestId('rendered-pedal').getAttribute('data-annotation-row')),
    ).toBeLessThanOrEqual(3);
    expect(dynamicY - lyricY).toBeGreaterThanOrEqual(24);
    expect(pedalY).toBeLessThan(lyricY);
  });

  it('keeps automatic text annotations outside the staff lines', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'outside-staff-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'outside-staff-annotation-note', {
      chordSymbol: 'Cmaj7',
      lyric: 'sing',
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-chord-symbol')).toHaveTextContent(
        'Cmaj7',
      );
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('sing');
    });

    const staffTop = getStaffTop(0);
    const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
    const chordBaseline = Number(
      screen.getByTestId('rendered-chord-symbol').getAttribute('y'),
    );
    const lyricBaseline = Number(
      screen.getByTestId('rendered-lyric').getAttribute('y'),
    );
    const chordBottom =
      chordBaseline + ANNOTATION_METRICS.chordSymbol.descent;
    const lyricTop = lyricBaseline - ANNOTATION_METRICS.lyric.height;

    expect(chordBottom).toBeLessThanOrEqual(
      staffTop - STAFF_OUTSIDE_ANNOTATION_GAP,
    );
    expect(lyricTop).toBeGreaterThanOrEqual(
      staffBottom + STAFF_OUTSIDE_ANNOTATION_GAP,
    );
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

  it('keeps below-staff lyrics close to the owning note within the system', async () => {
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
    const distantLowPitchY = getPitchY({ step: 'C', octave: 3 }, 'treble', 0);
    const owningPitchY = getPitchY({ step: 'E', octave: 4 }, 'treble', 0);
    const expectedOwningNoteBottom =
      owningPitchY + NOTEHEAD_ANNOTATION_INK_PADDING + BELOW_STAFF_INK_GAP;

    expect(lyric).toHaveAttribute('data-voice-index', '0');
    expect(lyricTop).toBeGreaterThanOrEqual(expectedOwningNoteBottom);
    expect(lyricTop).toBeLessThanOrEqual(expectedOwningNoteBottom + 5);
    expect(lyricTop).toBeLessThan(distantLowPitchY);
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

  it('keeps manual above lyrics outside the owning staff', async () => {
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
    const staffTop = getStaffTop(0);

    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-side',
      'above',
    );
    expect(lyricBottom).toBeLessThanOrEqual(
      staffTop - STAFF_OUTSIDE_ANNOTATION_GAP,
    );
    expect(lyricBottom).toBeGreaterThanOrEqual(
      staffTop - STAFF_OUTSIDE_ANNOTATION_GAP - 1,
    );
  });

  it('honors a manual annotation placement override without auto-rowing it', async () => {
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
      '0',
    );
  });

  it('renders manual annotation offsets on the text and its drag handle', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'offset-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const annotatedScore = tryUpdateScoreEvent(noteScore, 'offset-annotation-note', {
      lyric: 'la',
    }).score;
    const { rerender } = render(<StaffRenderer score={annotatedScore} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('la');
    });

    const baseX = Number(screen.getByTestId('rendered-lyric').getAttribute('x'));
    const baseY = Number(screen.getByTestId('rendered-lyric').getAttribute('y'));
    const offsetScore = tryUpdateScoreEvent(
      annotatedScore,
      'offset-annotation-note',
      {
        annotationOffset: {
          kind: 'lyric',
          offset: { x: 24, y: -12 },
        },
      },
    ).score;

    rerender(<StaffRenderer score={offsetScore} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
        'data-annotation-offset-x',
        '24',
      );
    });

    const lyric = screen.getByTestId('rendered-lyric');
    const hitTarget = screen.getByTestId('annotation-hit-target');

    expect(Number(lyric.getAttribute('x'))).toBeCloseTo(baseX + 24, 2);
    expect(Number(lyric.getAttribute('y'))).toBeCloseTo(baseY - 12, 2);
    expect(hitTarget).toHaveAttribute('data-annotation-offset-x', '24');
    expect(hitTarget).toHaveAttribute('data-annotation-offset-y', '-12');
  });

  it('renders fermata as a draggable note annotation', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'fermata-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const fermataScore = tryUpdateScoreEvent(noteScore, 'fermata-annotation-note', {
      fermata: true,
    }).score;
    const score = tryUpdateScoreEvent(fermataScore, 'fermata-annotation-note', {
      annotationOffset: {
        kind: 'fermata',
        offset: { x: -10, y: 8 },
      },
    }).score;

    render(<StaffRenderer score={score} />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-fermata')).toHaveAttribute(
        'data-annotation-kind',
        'fermata',
      );
    });

    const hitTarget = screen.getByTestId('annotation-hit-target');

    expect(hitTarget).toHaveAttribute('data-annotation-kind', 'fermata');
    expect(hitTarget).toHaveAttribute('data-annotation-offset-x', '-10');
    expect(hitTarget).toHaveAttribute('data-annotation-offset-y', '8');
  });

  it('drags an annotation hit target within its bounded local offset range', async () => {
    const noteScore = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'drag-annotation-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const score = tryUpdateScoreEvent(noteScore, 'drag-annotation-note', {
      lyric: 'move',
    }).score;
    const onAnnotationOffsetChange = vi.fn();

    render(
      <StaffRenderer
        score={score}
        onAnnotationOffsetChange={onAnnotationOffsetChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('annotation-hit-target')).toBeInTheDocument();
    });

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const hitTarget = screen.getByTestId('annotation-hit-target');
    const hitX =
      Number(hitTarget.getAttribute('x')) +
      Number(hitTarget.getAttribute('width')) / 2;
    const hitY =
      Number(hitTarget.getAttribute('y')) +
      Number(hitTarget.getAttribute('height')) / 2;
    const startPoint = svgToClientPoint(bounds, hitX, hitY);
    const endPoint = svgToClientPoint(bounds, hitX + 70, hitY - 60);

    fireEvent.mouseDown(hitTarget, { button: 0, ...startPoint });
    fireEvent.mouseMove(overlay, endPoint);

    await waitFor(() => {
      expect(screen.getByTestId('annotation-drag-preview')).toBeInTheDocument();
    });

    const guide = screen.getByTestId('annotation-drag-guide');

    expect(Number.isFinite(Number(guide.getAttribute('x1')))).toBe(true);
    expect(Number.isFinite(Number(guide.getAttribute('y1')))).toBe(true);
    expect(Number.isFinite(Number(guide.getAttribute('x2')))).toBe(true);
    expect(Number.isFinite(Number(guide.getAttribute('y2')))).toBe(true);

    fireEvent.mouseUp(overlay, endPoint);

    expect(onAnnotationOffsetChange).toHaveBeenCalledWith(
      'drag-annotation-note',
      'lyric',
      { x: 70, y: -80 },
    );
  });

  it('keeps sibling annotations stationary when one annotation receives a manual offset', async () => {
    const { container, rerender } = render(
      <StaffRenderer score={annotationDragLabFixture} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="annotation-hit-target"][data-event-id="annotation-lab-anchor"][data-annotation-kind="chordSymbol"]',
        ),
      ).toBeInTheDocument();
    });

    const getTargetFrame = (eventId: string, kind: string) => {
      const target = container.querySelector(
        `[data-testid="annotation-hit-target"][data-event-id="${eventId}"][data-annotation-kind="${kind}"]`,
      );

      expect(target).not.toBeNull();

      return {
        height: target?.getAttribute('height'),
        width: target?.getAttribute('width'),
        x: target?.getAttribute('x'),
        y: target?.getAttribute('y'),
      };
    };
    const getNoteheadX = (eventId: string) => {
      const notehead = container.querySelector(
        `.vf-user-notehead[data-event-id="${eventId}"]`,
      );

      expect(notehead).not.toBeNull();

      return notehead?.getAttribute('data-notehead-x');
    };
    const stableLyricFrame = getTargetFrame('annotation-lab-anchor', 'lyric');
    const stablePedalFrame = getTargetFrame('annotation-lab-anchor', 'pedal');
    const stableNearbyNoteX = getNoteheadX('annotation-lab-nearby');
    const stableNearbyDynamicFrame = getTargetFrame(
      'annotation-lab-nearby',
      'dynamic',
    );
    const stableNearbyLyricFrame = getTargetFrame('annotation-lab-nearby', 'lyric');
    const movedScore = tryUpdateScoreEvent(
      annotationDragLabFixture,
      'annotation-lab-anchor',
      {
        annotationOffset: {
          kind: 'chordSymbol',
          offset: { x: -22, y: 42 },
        },
      },
    ).score;

    rerender(<StaffRenderer score={movedScore} />);

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="annotation-hit-target"][data-event-id="annotation-lab-anchor"][data-annotation-kind="chordSymbol"]',
        ),
      ).toHaveAttribute('data-annotation-offset-y', '42');
    });

    expect(getTargetFrame('annotation-lab-anchor', 'lyric')).toEqual(
      stableLyricFrame,
    );
    expect(getTargetFrame('annotation-lab-anchor', 'pedal')).toEqual(
      stablePedalFrame,
    );
    expect(getNoteheadX('annotation-lab-nearby')).toBe(stableNearbyNoteX);
    expect(getTargetFrame('annotation-lab-nearby', 'dynamic')).toEqual(
      stableNearbyDynamicFrame,
    );
    expect(getTargetFrame('annotation-lab-nearby', 'lyric')).toEqual(
      stableNearbyLyricFrame,
    );
  });

  it('keeps a moved-above demo annotation visible near the owning staff', async () => {
    const placedAboveScore = tryUpdateScoreEvent(
      annotationDragLabFixture,
      'annotation-lab-anchor',
      {
        annotationOffset: {
          kind: 'pedal',
          offset: { x: -24, y: 0 },
        },
        annotationPlacement: {
          kind: 'pedal',
          side: 'above',
        },
      },
    ).score;

    const { container } = render(<StaffRenderer score={placedAboveScore} />);

    await waitFor(() => {
      const pedal = container.querySelector(
        '[data-testid="rendered-pedal"][data-event-id="annotation-lab-anchor"]',
      );

      expect(pedal).not.toBeNull();
      expect(
        pedal,
      ).toHaveAttribute('data-annotation-side', 'above');
    });

    const pedal = container.querySelector(
      '[data-testid="rendered-pedal"][data-event-id="annotation-lab-anchor"]',
    );
    if (!pedal) {
      throw new Error('Expected annotation lab pedal to render');
    }
    const pedalY = Number(pedal.getAttribute('y'));

    expect(pedal).toHaveAttribute('data-annotation-row', '0');
    expect(pedal).toHaveAttribute('data-annotation-offset-y', '0');
    expect(pedalY).toBeGreaterThan(getStaffTop(0) - 80);
    expect(pedalY).toBeLessThan(getStaffTop(0) + 50);
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
