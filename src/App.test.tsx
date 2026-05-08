import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./features/playback/audioEngine', () => ({
  playPitchPreview: vi.fn(() => Promise.resolve()),
  playTimelineAudio: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
}));

import App from './App';
import { playPitchPreview } from './features/playback/audioEngine';
import {
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  getScoreSvgHeight,
  getStaffTop,
} from './features/sheet/layout';
import { SHEETLAB_PROJECT_KEY } from './features/persistence/projectStorage';
import { getBeatX, getPitchY } from './features/sheet/notationGeometry';

beforeEach(() => {
  vi.clearAllMocks();
});

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
  svgHeight = getScoreSvgHeight('grand'),
) {
  return {
    clientX: bounds.left + (x / SVG_WIDTH) * bounds.width,
    clientY: bounds.top + (y / svgHeight) * bounds.height,
  };
}

function getOverlaySvgHeight(overlay: Element) {
  return Number(
    overlay.getAttribute('viewBox')?.split(/\s+/)[3] ?? getScoreSvgHeight('grand'),
  );
}

function startWriting(duration = 'Quarter') {
  fireEvent.click(screen.getByRole('button', { name: duration }));
}

describe('App editor state', () => {
  it('renders the editor shell with default tool state', () => {
    render(<App />);

    expect(
      screen.getByRole('main', { name: 'SheetLab music editor' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Duration tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Modifier tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Entry tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Placement tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Transport and history')).toBeInTheDocument();
    expect(screen.getByLabelText('Project tools')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select tool' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveTextContent(
      '♩',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).not.toHaveTextContent(
      'Quarter',
    );
    expect(screen.getByLabelText('Score title')).toHaveValue(
      'Untitled Piano Exercise',
    );
    expect(screen.getByText('Moderato ♩ = 96')).toBeInTheDocument();
    expect(screen.getByLabelText('Composer')).toHaveAttribute(
      'placeholder',
      'Composer',
    );
    expect(screen.getByLabelText('Page size')).toHaveValue('a4');
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('A4'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Grand staff piano',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Select'),
    ).toBeInTheDocument();
    expect(document.querySelector('.paper-a4')).not.toBeNull();
    expect(screen.queryByText(/notation surface/i)).not.toBeInTheDocument();
    expect(screen.getByText('96 BPM')).toBeInTheDocument();
  });

  it('keeps the cursor in select mode until a duration is chosen and clears write mode outside the staff', () => {
    render(<App />);

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-input-cursor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rhythm-slot')).not.toBeInTheDocument();

    startWriting();
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('ghost-event')).toBeInTheDocument();
    expect(screen.getByTestId('active-input-cursor')).toBeInTheDocument();
    expect(screen.getAllByTestId('rhythm-slot').length).toBeGreaterThan(0);

    fireEvent.click(overlay, {
      clientX: 0,
      clientY: 0,
    });

    expect(screen.getByRole('button', { name: 'Select tool' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-input-cursor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rhythm-slot')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Select'),
    ).toBeInTheDocument();
  });

  it('selects an empty measure in select mode without placing a note', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Measure 1 treble' }));

    expect(screen.getByTestId('selected-measure')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('treble M1'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Measure selected',
      ),
    ).toBeInTheDocument();
  });

  it('clears write mode when the user clicks a blank area on the sheet page', () => {
    render(<App />);

    const overlay = screen.getByTestId('staff-renderer');

    startWriting();
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('ghost-event')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Score title'));

    expect(screen.getByRole('button', { name: 'Select tool' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-input-cursor')).not.toBeInTheDocument();
  });

  it('updates duration, entry mode, and placement mode from the toolbar', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Eighth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thirty-second' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    expect(screen.getByRole('button', { name: 'Thirty-second' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Rest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Thirty-second',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Insert'),
    ).toBeInTheDocument();
  });

  it('does not recenter the notation viewport when changing write toolbar options', () => {
    const scrollIntoView = vi.fn();

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Eighth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('returns to place mode after reset so a new score starts safely', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Place'),
    ).toBeInTheDocument();
  });

  it('updates score type, page size, accidental, and tempo from controls', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Score type'), {
      target: { value: 'treble' },
    });
    fireEvent.change(screen.getByLabelText('Page size'), {
      target: { value: 'letter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));
    fireEvent.change(screen.getByLabelText('Tempo'), {
      target: { value: '120' },
    });

    expect(screen.getByText('Moderato ♩ = 120')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Sharp'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Letter'),
    ).toBeInTheDocument();
    expect(document.querySelector('.paper-letter')).not.toBeNull();
    expect(screen.getByText('120 BPM')).toBeInTheDocument();
  });

  it('edits score title and composer inline on the paper', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Score title'), {
      target: { value: 'My Piano Study' },
    });
    fireEvent.change(screen.getByLabelText('Composer'), {
      target: { value: 'Ada Composer' },
    });

    expect(screen.getByLabelText('Score title')).toHaveValue('My Piano Study');
    expect(screen.getByLabelText('Composer')).toHaveValue('Ada Composer');
  });

  it('places a score event when the user clicks the sheet', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('score-event')).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByTestId('score-event-delete')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('adds a second pitch at the same slot as a chord column', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(
      screen.getByLabelText('Chord C4 E4 measure 1 beat 1'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Note C4 measure 1 beat 1')).not.toBeInTheDocument();
  });

  it('selects and deletes one notehead inside a chord column', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Chord C4 E4 G4 measure 1 beat 1',
    }), {
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('selected-notehead')).toHaveAttribute(
      'data-pitch-index',
      '1',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'event-3 pitch 2',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note E4 from Chord C4 E4 G4 measure 1 beat 1',
    );

    fireEvent.click(screen.getByTestId('score-event-delete'));

    expect(
      screen.getByLabelText('Chord C4 G4 measure 1 beat 1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Chord C4 E4 G4 measure 1 beat 1'),
    ).not.toBeInTheDocument();
  });

  it('applies accidentals only to the selected notehead in a chord column', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Chord C4 E4 G4 measure 1 beat 1',
    }), {
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));

    expect(
      screen.getByLabelText('Chord C4 E#4 G4 measure 1 beat 1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Chord C#4 E4 G4 measure 1 beat 1'),
    ).not.toBeInTheDocument();
  });

  it('places notes on the first rhythm slot when the user clicks inside an empty measure', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: getBeatX(0, 1.5, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    expect(playPitchPreview).toHaveBeenCalledWith([
      expect.objectContaining({ octave: 4, step: 'E' }),
    ]);
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M1 B2 E4',
      ),
    ).toBeInTheDocument();
  });

  it('advances the input cursor after placing notes by the active duration', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M1 B2 E4',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Half' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M2 B1 G4',
      ),
    ).toBeInTheDocument();
  });

  it('keeps same-staff note entry on the advanced cursor even when the click x drifts', async () => {
    const { container } = render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'A', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 3.5, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note G4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Note A4 measure 1 beat 1.5')).toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 2')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll('.vexflow-output .vf-beam').length).toBeGreaterThan(0);
    });
  });

  it('snaps an empty measure to its first rhythm slot instead of free-clicking the middle', () => {
    render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');
    const middleOfEmptyMeasure = {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    };

    fireEvent.mouseMove(overlay, middleOfEmptyMeasure);

    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0',
    );

    fireEvent.click(overlay, middleOfEmptyMeasure);

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note E4 measure 1 beat 3')).not.toBeInTheDocument();
  });

  it('splits a rest slot when a shorter note is entered and moves to the next slot', () => {
    render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0.5',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M1 B1.5 E4',
      ),
    ).toBeInTheDocument();
  });

  it('lets the hover cursor return to an earlier rhythm slot after placement', () => {
    render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0.5',
    );

    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getAllByText(
        'treble M1 B1 G4',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('clears the advanced cursor when the pointer moves into the grand-staff dead zone', () => {
    render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0.5',
    );

    const deadZoneY =
      (getStaffTop(0) + STAFF_LINE_SPACING * 4 + getStaffTop(1)) / 2;

    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0.5, 4),
      clientY: deadZoneY,
    });

    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-input-cursor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rhythm-slot')).not.toBeInTheDocument();
    const cursorRow = [
      ...screen.getByLabelText('Current editor state').querySelectorAll('div'),
    ].find((row) => row.textContent?.startsWith('Cursor'));

    expect(cursorRow?.textContent).toBe('CursorNone');
  });

  it('previews and places the note the user points at on a real-sized sheet', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const middleLinePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseMove(overlay, middleLinePoint);

    expect(screen.getByTestId('ghost-event')).toHaveAttribute(
      'data-entry-mode',
      'note',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getAllByText(
        'treble M1 B1 B4',
      ).length,
    ).toBeGreaterThan(0);
    const ghostNoteHead = screen
      .getByTestId('ghost-event')
      .querySelector('ellipse');
    const ghostX = Number(ghostNoteHead?.getAttribute('cx'));
    const ghostY = Number(ghostNoteHead?.getAttribute('cy'));

    fireEvent.click(overlay, middleLinePoint);

    expect(screen.getByLabelText('Note B4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByTestId('ghost-event')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '1',
    );
    expect(screen.getByTestId('score-event')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        container.querySelector('.vexflow-output .vf-user-event[data-event-id="event-1"]'),
      ).not.toBeNull();
    });
    const hitTarget = screen.getByTestId('score-event-target');
    const scoreEvent = screen.getByTestId('score-event');
    const eventLayoutX = Number(scoreEvent.getAttribute('data-layout-x'));
    const eventLayoutY = Number(scoreEvent.getAttribute('data-layout-y'));
    const hitTargetCenterX =
      Number(hitTarget.getAttribute('x')) +
      Number(hitTarget.getAttribute('width')) / 2;
    const hitTargetCenterY =
      Number(hitTarget.getAttribute('y')) +
      Number(hitTarget.getAttribute('height')) / 2;

    expect(Number.isFinite(ghostX)).toBe(true);
    expect(Number.isFinite(ghostY)).toBe(true);
    expect(hitTargetCenterX).toBeCloseTo(eventLayoutX, 2);
    expect(hitTargetCenterY).toBeCloseTo(eventLayoutY, 2);
  });

  it('adds a measure from the toolbar', () => {
    render(<App />);

    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Add Measure' }));

    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(22);
    expect(within(screen.getByLabelText('Current editor state')).getByText('17')).toBeInTheDocument();
  });

  it('opens a right-click measure menu and clears that staff measure content', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Measure 1 treble' }), {
      clientX: 320,
      clientY: 180,
    });

    expect(screen.getByTestId('measure-context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('selected-measure')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear content' }));

    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Measure content cleared',
      ),
    ).toBeInTheDocument();
  });

  it('adds and deletes measure columns from the right-click measure menu with a warning', () => {
    render(<App />);

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Measure 2 treble' }), {
      clientX: 320,
      clientY: 180,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add measure before' }));

    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(22);
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('17'),
    ).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Measure 2 treble' }), {
      clientX: 320,
      clientY: 180,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete measure' }));

    expect(screen.getByRole('dialog', { name: 'Delete measure warning' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete measure' }));

    expect(screen.queryByRole('dialog', { name: 'Delete measure warning' }))
      .not.toBeInTheDocument();
    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(20);
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Measure deleted',
      ),
    ).toBeInTheDocument();
  });

  it('selects and deletes a placed score event', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }));

    expect(
      within(screen.getByLabelText('Current editor state')).getByText('event-1'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getAllByText('None').length,
    ).toBeGreaterThan(0);
  });

  it('marks a measure red when a duration update would break the measure rhythm', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    ([
      { beat: 0, pitch: { step: 'C', octave: 4 } },
      { beat: 1, pitch: { step: 'D', octave: 4 } },
      { beat: 2, pitch: { step: 'E', octave: 4 } },
      { beat: 3, pitch: { step: 'F', octave: 4 } },
    ] as const).forEach(({ beat, pitch }) => {
      fireEvent.click(overlay, {
        clientX: getBeatX(0, beat, 4),
        clientY: getPitchY(pitch, 'treble', 0),
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Whole' }));

    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Cannot update: event-overlap',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }))
      .toHaveAttribute('data-duration', 'quarter');
    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '.vexflow-output .vf-user-event.is-invalid-measure[data-staff-id="treble"][data-measure-index="0"]',
        ),
      ).toHaveLength(4);
    });
  });

  it('deletes a selected score event from the small x target', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }));

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note E4 measure 1 beat 1',
    );
    fireEvent.click(screen.getByTestId('score-event-delete'));

    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getAllByText('None').length,
    ).toBeGreaterThan(0);
  });

  it('deletes a selected score event with the Delete key', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }));

    expect(screen.getByTestId('score-event')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();
  });

  it('clears a selected measure with Delete only after a warning confirmation', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Measure 1 treble' }));

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(
      screen.getByRole('dialog', { name: 'Clear measure content warning' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear content' }));

    expect(
      screen.queryByRole('dialog', { name: 'Clear measure content warning' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();
  });

  it('supports Ctrl/Cmd undo and redo shortcuts', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'z' });

    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'y' });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
  });

  it('applies the selected key signature to new note preview audio', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Key signature'), {
      target: { value: 'G' },
    });
    startWriting();
    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'F', octave: 4 }, 'treble', 0),
    });

    expect(playPitchPreview).toHaveBeenLastCalledWith([
      {
        accidental: 'sharp',
        octave: 4,
        step: 'F',
      },
    ]);
    expect(screen.getByLabelText('Key signature')).toHaveValue('G');
  });

  it('updates the selected score event from toolbar controls', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Half' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));

    expect(screen.getByTestId('score-event')).toHaveAttribute(
      'data-duration',
      'half',
    );
    expect(screen.getByLabelText('Note E#4 measure 1 beat 1')).toBeInTheDocument();
  });

  it('combines duration, dotted, and accidental modifiers when writing notes', () => {
    const { container } = render(<App />);

    startWriting();
    fireEvent.click(screen.getByRole('button', { name: 'Dotted note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));
    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E#4 measure 1 beat 1')).toBeInTheDocument();
    expect(
      container.querySelector('.vexflow-output .vf-user-event[data-event-id="event-1"]'),
    ).not.toBeNull();
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '1.5',
    );
  });

  it('does not change the auto-selected previous note when choosing the next duration', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Half' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    expect(screen.getByLabelText('Note G4 measure 1 beat 3')).toHaveAttribute(
      'data-duration',
      'half',
    );
  });

  it('places independent treble and bass durations in a grand staff score', () => {
    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Score type' }), {
      target: { value: 'grand' },
    });
    startWriting();
    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Whole' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 3 }, 'bass', 1),
    });

    expect(screen.getByLabelText('Note B4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    expect(screen.getByLabelText('Note C3 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'whole',
    );
  });

  it('inserts a missing note and shifts later notes to the right', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note C4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Note D4 measure 1 beat 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 4')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Event inserted',
      ),
    ).toBeInTheDocument();
  });

  it('updates pitch in the same rhythm column when the user drags a notehead', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, 4),
      getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.click(overlay, startPoint);
    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note G4 measure 1 beat 3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invalid-measure-warning')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Pitch updated'),
    ).toBeInTheDocument();
  });

  it('updates one chord notehead pitch without moving the chord column', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));

    const bounds = setVisibleSheetBounds(overlay);
    const svgHeight = Number(
      overlay.getAttribute('viewBox')?.split(/\s+/)[3] ?? getScoreSvgHeight('grand'),
    );
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      svgHeight,
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, 4),
      getPitchY({ step: 'F', octave: 4 }, 'treble', 0),
      svgHeight,
    );

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Chord C4 E4 G4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(
      screen.getByLabelText('Chord C4 F4 G4 measure 1 beat 1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Chord C4 F4 G4 measure 1 beat 3'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('invalid-measure-warning')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Pitch updated'),
    ).toBeInTheDocument();
  });

  it('undoes and redoes a placed score event', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('score-event')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByTestId('score-event')).toBeInTheDocument();
  });

  it('toggles playback state when the score has events', async () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByTestId('score-event')).toHaveClass('is-playing');
    expect(screen.getByTestId('playhead')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByTestId('score-event')).not.toHaveClass('is-playing');
    expect(screen.queryByTestId('playhead')).not.toBeInTheDocument();
  });

  it('saves and loads the current score from JSON storage', () => {
    localStorage.clear();
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.queryByTestId('score-event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(screen.getByTestId('score-event')).toBeInTheDocument();
  });

  it('imports a downloaded JSON project file', async () => {
    localStorage.clear();
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const savedProject = localStorage.getItem(SHEETLAB_PROJECT_KEY) ?? '';

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.change(screen.getByLabelText('Import JSON file'), {
      target: {
        files: [
          new File([savedProject], 'sheetlab-project.json', {
            type: 'application/json',
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('score-event')).toBeInTheDocument();
    });
  });

  it('exports PDF through the backend endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      blob: vi
        .fn()
        .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' })),
      ok: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:sheetlab-pdf');
    const revokeObjectUrlSpy = vi.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;

    vi.stubGlobal('fetch', fetchSpy);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlSpy,
    });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/export-pdf',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:sheetlab-pdf');
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'PDF downloaded',
      ),
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
    clickSpy.mockRestore();
  });
});
