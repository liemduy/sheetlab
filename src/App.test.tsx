import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  STAFF_LEFT,
  SVG_WIDTH,
  getScoreSvgHeight,
} from './features/sheet/layout';
import { SHEETLAB_PROJECT_KEY } from './features/persistence/projectStorage';
import { getBeatX, getPitchY } from './features/sheet/notationGeometry';

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
    clientY: bounds.top + (y / getScoreSvgHeight('grand')) * bounds.height,
  };
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
    expect(screen.getByText('Moderato ♩ = 96')).toBeInTheDocument();
    expect(screen.getByText('Composer')).toBeInTheDocument();
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

  it('clears write mode when the user clicks a blank area on the sheet page', () => {
    render(<App />);

    const overlay = screen.getByTestId('staff-renderer');

    startWriting();
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByTestId('ghost-event')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('heading', { name: 'Untitled Piano Exercise' }));

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

  it('places notes on the snapped visible slot when the user clicks between slots', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: getBeatX(0, 1.5, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 3')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M1 B4 E4',
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

  it('previews and places the note the user points at on a real-sized sheet', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const middleLinePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
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
        container.querySelector('[data-event-id="event-1"] .score-event-notehead'),
      ).not.toBeNull();
    });
    const placedNoteHead = container.querySelector(
      '[data-event-id="event-1"] .score-event-notehead',
    );

    expect(Number(placedNoteHead?.getAttribute('cx'))).toBeCloseTo(
      ghostX,
      2,
    );
    expect(Number(placedNoteHead?.getAttribute('cy'))).toBeCloseTo(
      ghostY,
      2,
    );
  });

  it('adds a measure from the toolbar', () => {
    render(<App />);

    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Add Measure' }));

    expect(screen.getAllByTestId('measure-barline-treble')).toHaveLength(6);
    expect(within(screen.getByLabelText('Current editor state')).getByText('5')).toBeInTheDocument();
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
    expect(container.querySelector('[data-event-id="event-1"] .notation-dot')).not.toBeNull();
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

  it('moves a placed note when the user drags it to another pitch and beat', () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const startPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    );
    const targetPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, 4),
      getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    );

    fireEvent.click(overlay, startPoint);
    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }),
      startPoint,
    );
    fireEvent.mouseMove(overlay, targetPoint);
    fireEvent.mouseUp(overlay, targetPoint);

    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 3')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Event moved'),
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
