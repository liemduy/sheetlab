import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./features/playback/audioEngine', () => ({
  playPitchPreview: vi.fn(() => Promise.resolve()),
  playTimelineAudio: vi.fn(() =>
    Promise.resolve({ startedAtMs: performance.now(), stop: vi.fn() }),
  ),
  warmUpPlaybackAudio: vi.fn(() => Promise.resolve(true)),
}));

import App from './App';
import {
  playPitchPreview,
  playTimelineAudio,
} from './features/playback/audioEngine';
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

function chooseTuplet(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Tuplet menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

function getTupletMenuButton() {
  return screen.getByRole('button', { name: 'Tuplet menu' });
}

function getRenderedSlotX(label: string) {
  return Number(screen.getByLabelText(label).getAttribute('data-layout-x'));
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
    expect(screen.getByLabelText('Key signature tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Time signature tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat and jump tools')).toBeInTheDocument();
    expect(screen.getByTestId('editor-fingering-hints-toggle')).toBeChecked();
    expect(screen.getByLabelText('Canvas zoom tools')).toBeInTheDocument();
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
    expect(screen.getAllByText('Moderato ♩ = 96')).toHaveLength(1);
    expect(screen.getByTestId('rendered-tempo-mark')).toHaveTextContent('96');
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
    expect(
      within(screen.getByLabelText('Composer flow')).getByText('Score is empty'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Empty score composer state'),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.paper-a4')).not.toBeNull();
    expect(screen.queryByText(/notation surface/i)).not.toBeInTheDocument();
    expect(screen.getByText('96 BPM')).toBeInTheDocument();
  });

  it('loads a current annotation demo score and reports validation status in the panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Load demo score'), {
      target: { value: 'annotation-drag-lab' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Score title')).toHaveValue(
        'Annotation Drag Lab',
      );
    });

    const stateSummary = within(screen.getByLabelText('Current editor state'));

    expect(stateSummary.getByText('88 BPM')).toBeInTheDocument();
    expect(stateSummary.getAllByText('4').length).toBeGreaterThanOrEqual(1);
    expect(stateSummary.getAllByText('OK').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText('Demo loaded: Annotation Drag Lab'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        document.querySelector(
          '.vexflow-output .vf-user-event[data-event-id="annotation-lab-anchor"]',
        ),
      ).not.toBeNull();
    });
    expect(
      screen.queryByRole('button', { name: 'Review first music issue' }),
    ).not.toBeInTheDocument();
  });

  it('moves an offset demo annotation above without carrying the old vertical drag offset', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Load demo score'), {
      target: { value: 'annotation-drag-lab' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Score title')).toHaveValue(
        'Annotation Drag Lab',
      );
    });

    const pedalTarget = container.querySelector(
      '[data-testid="annotation-hit-target"][data-event-id="annotation-lab-anchor"][data-annotation-kind="pedal"]',
    );

    expect(pedalTarget).not.toBeNull();
    expect(pedalTarget).toHaveAttribute('data-annotation-side', 'below');
    expect(pedalTarget).toHaveAttribute('data-annotation-offset-x', '-58');
    expect(pedalTarget).toHaveAttribute('data-annotation-offset-y', '0');

    fireEvent.contextMenu(pedalTarget as Element, {
      clientX: 420,
      clientY: 220,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move above' }));

    await waitFor(() => {
      const movedTarget = container.querySelector(
        '[data-testid="annotation-hit-target"][data-event-id="annotation-lab-anchor"][data-annotation-kind="pedal"]',
      );

      expect(movedTarget).not.toBeNull();
      expect(movedTarget).toHaveAttribute('data-annotation-side', 'above');
      expect(movedTarget).toHaveAttribute('data-annotation-offset-x', '-58');
      expect(movedTarget).toHaveAttribute('data-annotation-offset-y', '0');
    });

    const movedPedal = container.querySelector(
      '[data-testid="rendered-pedal"][data-event-id="annotation-lab-anchor"]',
    );

    expect(movedPedal).not.toBeNull();
    expect(movedPedal).toHaveTextContent('Ped.');
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
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble measure 1',
      ),
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

  it('enables triplet entry by switching to the matching slot duration', () => {
    render(<App />);

    chooseTuplet('Triplet');

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Eighth'),
    ).toBeInTheDocument();
  });

  it('enables quintuplet entry by switching to the matching slot duration', () => {
    render(<App />);

    chooseTuplet('Tuplet 5');

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Sixteenth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText('Sixteenth'),
    ).toBeInTheDocument();
  });

  it('uses modifier-number shortcuts to arm and clear tuplet entry', () => {
    render(<App />);

    fireEvent.keyDown(window, { ctrlKey: true, key: '5' });

    expect(getTupletMenuButton()).toHaveTextContent('T5');
    expect(getTupletMenuButton()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sixteenth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Tuplet 5 entry enabled',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { metaKey: true, key: '0' });

    expect(getTupletMenuButton()).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Tuplet entry cleared',
      ),
    ).toBeInTheDocument();
  });

  it('supports MuseScore-style keyboard note entry from the active cursor', () => {
    render(<App />);

    fireEvent.keyDown(window, { code: 'Digit4', key: '4' });

    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Eighth entry: treble M1 B1 C4',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'E' });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '0.5',
    );

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'G' });

    expect(screen.getByLabelText('Note G4 measure 1 beat 1.5')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
  });

  it('places rests from the keyboard cursor without a mouse hover target', () => {
    render(<App />);

    fireEvent.keyDown(window, { code: 'Digit5', key: '5' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(screen.getByLabelText('Rest measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
      'data-beat',
      '1',
    );
  });

  it('navigates score event selection with ArrowLeft and ArrowRight in select mode', () => {
    render(<App />);

    fireEvent.keyDown(window, { code: 'Digit5', key: '5' });
    fireEvent.keyDown(window, { key: 'C' });
    fireEvent.keyDown(window, { key: 'D' });
    fireEvent.keyDown(window, { key: 'E' });
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note C4 measure 1 beat 1',
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note D4 measure 1 beat 2',
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note C4 measure 1 beat 1',
    );
  });

  it('runs editor commands from the command palette shortcut', async () => {
    render(<App />);

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument();

    const commandSearch = screen.getByRole('textbox', {
      name: 'Command search',
    });

    fireEvent.change(commandSearch, { target: { value: 'rest entry' } });
    fireEvent.keyDown(commandSearch, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Command palette' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Rest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens the command palette from the toolbar and can arm tuplets', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    const commandSearch = screen.getByRole('textbox', {
      name: 'Command search',
    });

    fireEvent.change(commandSearch, { target: { value: 'tuplet 5' } });
    fireEvent.keyDown(commandSearch, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Command palette' }),
      ).not.toBeInTheDocument();
    });
    expect(getTupletMenuButton()).toHaveTextContent('T5');
    expect(screen.getByRole('button', { name: 'Sixteenth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uses piano hand commands to move keyboard entry to the bass staff', async () => {
    render(<App />);

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    const commandSearch = screen.getByRole('textbox', {
      name: 'Command search',
    });

    fireEvent.change(commandSearch, { target: { value: 'left hand input' } });
    fireEvent.keyDown(commandSearch, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('active-input-cursor')).toHaveAttribute(
        'data-staff-id',
        'bass',
      );
    });

    fireEvent.keyDown(window, { key: 'C' });

    expect(
      within(screen.getByTestId('staff-bass')).getByLabelText(
        'Note C3 measure 1 beat 1',
      ),
    ).toBeInTheDocument();
  });

  it('moves a selected event to the left hand staff from the command palette', async () => {
    render(<App />);

    fireEvent.keyDown(window, { code: 'Digit5', key: '5' });
    fireEvent.keyDown(window, { key: 'C' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    const commandSearch = screen.getByRole('textbox', {
      name: 'Command search',
    });

    fireEvent.change(commandSearch, {
      target: { value: 'move selected event to left hand staff' },
    });
    fireEvent.keyDown(commandSearch, { key: 'Enter' });

    await waitFor(() => {
      expect(
        within(screen.getByTestId('staff-bass')).getByLabelText(
          'Note C4 measure 1 beat 1',
        ),
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('staff-treble')).queryByLabelText(
        'Note C4 measure 1 beat 1',
      ),
    ).not.toBeInTheDocument();
  });

  it('rejects triplet entry while the dotted modifier is active', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dotted note' }));
    chooseTuplet('Triplet');

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Dotted note' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Cannot create triplet from dotted duration',
      ),
    ).toBeInTheDocument();
  });

  it('clears triplet entry when the user changes duration, then enables it again cleanly', () => {
    render(<App />);

    chooseTuplet('Triplet');
    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    chooseTuplet('Triplet');

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    expect(screen.getAllByText('Moderato ♩ = 120')).toHaveLength(1);
    expect(screen.getByTestId('rendered-tempo-mark')).toHaveTextContent('120');
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
    expect(
      screen.queryByLabelText('Empty score composer state'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Composer flow')).getByText('Quarter note ready'),
    ).toBeInTheDocument();
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

  it('selects and deletes one notehead inside a chord column', async () => {
    const { container } = render(<App />);
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

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vexflow-output .vf-user-notehead[data-event-id="event-3"][data-pitch-index="1"].is-selected-notehead',
        ),
      ).not.toBeNull();
    });
    expect(screen.queryByTestId('selected-notehead')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Quarter chord E4 M1 B1',
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

  it('deletes only the selected chord notehead with the Delete key', () => {
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
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Chord C4 E4 G4 measure 1 beat 1',
      }),
      {
        clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      },
    );

    fireEvent.keyDown(window, { key: 'Delete' });

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
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note G4 measure 1 beat 2')).toHaveAttribute(
      'data-duration',
      'half',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble M1 B4 G4',
      ),
    ).toBeInTheDocument();
  });

  it('snaps gap-creating place clicks to the next sequential slot', () => {
    render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 3.5, 4),
      clientY: getPitchY({ step: 'A', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note G4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note A4 measure 1 beat 3.5')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note A4 measure 1 beat 1.5')).toBeInTheDocument();
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

  it('shows the hovered occupied slot and clicks that same slot', () => {
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
    expect(screen.getAllByTestId('rhythm-slot')).toHaveLength(1);
    expect(screen.queryByTestId('staff-hover-guide')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getAllByText(
        'treble M1 B1 G4',
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Chord E4 G4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note G4 measure 1 beat 1.5')).not.toBeInTheDocument();
  });

  it('places a smaller-duration note inside an occupied event as a parallel voice', () => {
    render(<App />);
    startWriting('Half');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'A', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eighth' }));
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(
      screen.getByText('Parallel voice placed in V2'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'half',
    );
    expect(screen.getByLabelText('Note A4 measure 1 beat 3')).toHaveAttribute(
      'data-duration',
      'half',
    );
    expect(screen.getByLabelText('Note G4 measure 1 beat 2')).toHaveAttribute(
      'data-voice-index',
      '1',
    );
    expect(screen.getByRole('button', { name: 'Voice 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    const noteheadY = getPitchY({ step: 'B', octave: 4 }, 'treble', 0);
    const hitTargetCenterX =
      Number(hitTarget.getAttribute('x')) +
      Number(hitTarget.getAttribute('width')) / 2;
    const hitTargetCenterY =
      Number(hitTarget.getAttribute('y')) +
      Number(hitTarget.getAttribute('height')) / 2;

    expect(Number.isFinite(ghostX)).toBe(true);
    expect(Number.isFinite(ghostY)).toBe(true);
    expect(hitTargetCenterX).toBeCloseTo(eventLayoutX, 2);
    expect(hitTargetCenterY).toBeCloseTo(noteheadY, 2);
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

  it('opens a right-click annotation menu and overrides its placement', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const notePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseMove(overlay, notePoint);
    fireEvent.click(overlay, notePoint);
    await waitFor(() => {
      expect(screen.getByTestId('score-event')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByTestId('score-event'));
    fireEvent.change(screen.getByLabelText('Lyric'), {
      target: { value: 'sing' },
    });
    fireEvent.blur(screen.getByLabelText('Lyric'));
    fireEvent.change(screen.getByLabelText('Dynamic'), {
      target: { value: 'mf' },
    });
    fireEvent.blur(screen.getByLabelText('Dynamic'));
    fireEvent.change(screen.getByLabelText('Pedal'), {
      target: { value: 'start' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
        'data-annotation-side',
        'above',
      );
    });

    const pedalTarget = container.querySelector(
      '[data-testid="annotation-hit-target"][data-annotation-kind="pedal"]',
    );

    expect(pedalTarget).not.toBeNull();
    fireEvent.contextMenu(pedalTarget as Element, {
      clientX: 420,
      clientY: 220,
    });

    expect(screen.getByTestId('annotation-context-menu')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-testid="annotation-hit-target"][data-annotation-kind="pedal"]',
        ),
      ).toHaveAttribute('data-annotation-selected', 'true');
    });
    expect(
      screen.getByRole('menuitem', { name: 'Reset position' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move below' }));

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
        'data-annotation-side',
        'below',
      );
    });

    const movedPedalTarget = container.querySelector(
      '[data-testid="annotation-hit-target"][data-annotation-kind="pedal"]',
    );

    expect(movedPedalTarget).not.toBeNull();
    fireEvent.contextMenu(movedPedalTarget as Element, {
      clientX: 420,
      clientY: 220,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move above' }));

    await waitFor(() => {
      expect(screen.getByTestId('rendered-pedal')).toHaveAttribute(
        'data-annotation-side',
        'above',
      );
    });
    expect(screen.getByTestId('rendered-pedal')).toHaveTextContent('Ped.');
  });

  it('drags a rendered annotation around its attached note', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const notePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseMove(overlay, notePoint);
    fireEvent.click(overlay, notePoint);
    await waitFor(() => {
      expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByLabelText('Note E4 measure 1 beat 1'));
    fireEvent.change(screen.getByLabelText('Lyric'), {
      target: { value: 'sing' },
    });
    fireEvent.blur(screen.getByLabelText('Lyric'));

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveTextContent('sing');
    });

    const lyricTarget = container.querySelector(
      '[data-testid="annotation-hit-target"][data-annotation-kind="lyric"]',
    );

    expect(lyricTarget).not.toBeNull();

    const hitX =
      Number(lyricTarget?.getAttribute('x')) +
      Number(lyricTarget?.getAttribute('width')) / 2;
    const hitY =
      Number(lyricTarget?.getAttribute('y')) +
      Number(lyricTarget?.getAttribute('height')) / 2;
    const startPoint = svgToClientPoint(
      bounds,
      hitX,
      hitY,
      getOverlaySvgHeight(overlay),
    );
    const endPoint = svgToClientPoint(
      bounds,
      hitX + 22,
      hitY - 16,
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseDown(lyricTarget as Element, { button: 0, ...startPoint });
    fireEvent.mouseMove(overlay, endPoint);

    await waitFor(() => {
      expect(screen.getByTestId('annotation-drag-preview')).toBeInTheDocument();
    });

    fireEvent.mouseUp(overlay, endPoint);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
        'data-annotation-offset-x',
        '22',
      );
    });
    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-offset-y',
      '-16',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Annotation position adjusted',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
        'data-annotation-offset-x',
        '23',
      );
    });

    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
        'data-annotation-offset-y',
        '-11',
      );
    });

    fireEvent.keyDown(window, { key: '0' });

    await waitFor(() => {
      expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
        'data-annotation-offset-x',
        '0',
      );
    });
    expect(screen.getByTestId('rendered-lyric')).toHaveAttribute(
      'data-annotation-offset-y',
      '0',
    );
  });

  it('toggles combinable articulations on the selected note', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const notePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseMove(overlay, notePoint);
    fireEvent.click(overlay, notePoint);
    await waitFor(() => {
      expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByLabelText('Note E4 measure 1 beat 1'));

    const accentToggle = screen.getByRole('button', {
      name: 'Toggle Accent articulation',
    });
    const staccatoToggle = screen.getByRole('button', {
      name: 'Toggle Staccato articulation',
    });

    fireEvent.click(accentToggle);
    fireEvent.click(staccatoToggle);

    await waitFor(() => {
      expect(accentToggle).toHaveAttribute('aria-pressed', 'true');
      expect(staccatoToggle).toHaveAttribute('aria-pressed', 'true');
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).toHaveAttribute('data-articulations', 'accent staccato');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear articulations' }));

    await waitFor(() => {
      expect(accentToggle).toHaveAttribute('aria-pressed', 'false');
      expect(staccatoToggle).toHaveAttribute('aria-pressed', 'false');
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).not.toHaveAttribute('data-articulations');
    });
  });

  it('toggles tie and slur connection marks on the selected note', async () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const svgHeight = getOverlaySvgHeight(overlay);
    const firstPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
      svgHeight,
    );
    const secondPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 1, 4),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
      svgHeight,
    );

    fireEvent.mouseMove(overlay, firstPoint);
    fireEvent.click(overlay, firstPoint);
    fireEvent.mouseMove(overlay, secondPoint);
    fireEvent.click(overlay, secondPoint);

    await waitFor(() => {
      expect(screen.getByLabelText('Note C4 measure 1 beat 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Note C4 measure 1 beat 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByLabelText('Note C4 measure 1 beat 1'));

    const tieButton = screen.getByRole('button', {
      name: 'Toggle tie to next note',
    });
    const slurButton = screen.getByRole('button', {
      name: 'Toggle slur to next note',
    });

    fireEvent.click(tieButton);
    fireEvent.click(slurButton);
    fireEvent.change(screen.getByLabelText('Hairpin'), {
      target: { value: 'crescendo' },
    });

    await waitFor(() => {
      expect(tieButton).toHaveAttribute('aria-pressed', 'true');
      expect(slurButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('rendered-tie')).toHaveAttribute(
        'data-target-id',
        'event-2',
      );
      expect(screen.getByTestId('rendered-slur')).toHaveAttribute(
        'data-source-id',
        'event-1',
      );
      expect(screen.getByTestId('rendered-hairpin')).toHaveAttribute(
        'data-hairpin',
        'crescendo',
      );
    });
  });

  it('flips the selected note direction from toolbar and X shortcut', async () => {
    const { container } = render(<App />);
    startWriting('Eighth');

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const notePoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
      getOverlaySvgHeight(overlay),
    );

    fireEvent.mouseMove(overlay, notePoint);
    fireEvent.click(overlay, notePoint);
    await waitFor(() => {
      expect(screen.getByLabelText('Note C4 measure 1 beat 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByLabelText('Note C4 measure 1 beat 1'));

    const flipButton = screen.getByRole('button', { name: 'Flip direction' });
    expect(flipButton).toBeEnabled();
    fireEvent.click(flipButton);

    await waitFor(() => {
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).toHaveAttribute('data-stem-direction', 'down');
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).toHaveAttribute('data-stem-direction-source', 'manual');
    });

    fireEvent.keyDown(flipButton, { key: 'x' });

    await waitFor(() => {
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).toHaveAttribute('data-stem-direction', 'up');
      expect(
        container.querySelector('.vf-user-event[data-event-id="event-1"]'),
      ).toHaveAttribute('data-stem-direction-source', 'manual');
    });
  });

  it('selects the lyric source when clicking a note inside a multi-note lyric map', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');
    const bounds = setVisibleSheetBounds(overlay);
    const svgHeight = getOverlaySvgHeight(overlay);
    const firstPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 0, 4),
      getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
      svgHeight,
    );
    const secondPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 1, 4),
      getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
      svgHeight,
    );
    const thirdPoint = svgToClientPoint(
      bounds,
      getBeatX(0, 2, 4),
      getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      svgHeight,
    );

    fireEvent.click(overlay, firstPoint);
    fireEvent.click(overlay, secondPoint);
    fireEvent.click(overlay, thirdPoint);
    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }));
    fireEvent.change(screen.getByLabelText('Lyric'), {
      target: { value: 'hold' },
    });
    fireEvent.blur(screen.getByLabelText('Lyric'));
    fireEvent.click(screen.getByRole('button', { name: 'Show lyric map' }));

    await waitFor(() => {
      expect(screen.getByTestId('lyric-map-connector')).toBeInTheDocument();
    });

    const lyricMapHitTarget = screen.getByTestId('lyric-map-hit-target');

    expect(lyricMapHitTarget).not.toBeNull();
    fireEvent.mouseDown(lyricMapHitTarget, firstPoint);
    fireEvent.mouseMove(overlay, thirdPoint);
    fireEvent.mouseUp(overlay, thirdPoint);

    await waitFor(() => {
      expect(screen.getByTestId('lyric-map-connector')).toHaveAttribute(
        'data-target-event-ids',
        'event-1 event-2 event-3',
      );
    });

    const mappedTargetNote = container.querySelector(
      '[data-testid="score-event"][data-event-id="event-3"]',
    );

    expect(mappedTargetNote).not.toBeNull();
    fireEvent.click(mappedTargetNote as Element);

    expect(screen.getByLabelText('Lyric')).toHaveValue('hold');
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Mapped lyric selected',
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
      within(screen.getByLabelText('Current editor state')).getByText(
        'Quarter note E4 M1 B1',
      ),
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
        'Event duration updated; measure rhythm needs fixing',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(screen.getByRole('button', { name: 'Note C4 measure 1 beat 1' }))
      .toHaveAttribute('data-duration', 'whole');
    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '.vexflow-output .vf-user-event.is-invalid-measure[data-staff-id="treble"][data-measure-index="0"]',
        ),
      ).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review first rhythm issue' }));

    expect(screen.getByTestId('selected-measure')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Review rhythm issue: treble measure 1 overlap',
      ),
    ).toBeInTheDocument();
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

  it('transposes a selected note with ArrowUp and ArrowDown', () => {
    render(<App />);
    startWriting();

    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }));

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(screen.getByRole('button', { name: 'Note F4 measure 1 beat 1' }))
      .toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Pitch moved up',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(screen.getByRole('button', { name: 'Note E4 measure 1 beat 1' }))
      .toBeInTheDocument();
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

    fireEvent.keyDown(window, { metaKey: true, key: 'z' });

    expect(screen.queryByLabelText('Note E4 measure 1 beat 1')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { metaKey: true, key: 'y' });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
  });

  it('applies the selected key signature to new note preview audio', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Key signature menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'G' }));
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
    expect(screen.getByRole('button', { name: 'Key signature menu' })).toHaveTextContent(
      'G (1 sharp)',
    );
  });

  it('updates time signature from the toolbar', () => {
    render(<App />);

    fireEvent.change(screen.getAllByLabelText('Time signature')[0], {
      target: { value: '3/4' },
    });

    expect(screen.getAllByText('3/4').length).toBeGreaterThan(0);
    startWriting('Whole');
    fireEvent.click(screen.getByTestId('staff-renderer'), {
      clientX: STAFF_LEFT,
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(
      screen.getByText('Cannot place: the event would exceed this measure'),
    ).toBeInTheDocument();
  });

  it('marks the resolved append measure when an overflowed note is clicked from the next measure', () => {
    render(<App />);
    startWriting('Quarter');

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Half' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(1, 0, 4),
      clientY: getPitchY({ step: 'F', octave: 4 }, 'treble', 0),
    });

    expect(
      screen.getByText('Cannot place: the event would exceed this measure'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(screen.queryByLabelText('Note F4 measure 2 beat 1')).not.toBeInTheDocument();
  });

  it('flashes and clears measure red when a rejected triplet would overlap an existing note', () => {
    vi.useFakeTimers();

    try {
      render(<App />);
      startWriting();
      const overlay = screen.getByTestId('staff-renderer');

      fireEvent.click(overlay, {
        clientX: getBeatX(0, 0, 4),
        clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      });
      chooseTuplet('Triplet');
      fireEvent.click(overlay, {
        clientX: getBeatX(0, 0, 4),
        clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
      });

      expect(
        screen.getByText('Cannot place triplet: this beat is already occupied'),
      )
        .toBeInTheDocument();
      expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
        'data-measure-key',
        'treble:0',
      );
      expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
      expect(screen.queryByLabelText('Note G4 measure 1 beat 1')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Rest measure 1 beat 1.3333')).not.toBeInTheDocument();
      expect(getTupletMenuButton()).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: 'Select tool' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      chooseTuplet('Triplet');
      expect(getTupletMenuButton()).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      act(() => {
        vi.advanceTimersByTime(701);
      });

      expect(screen.queryByTestId('invalid-measure-warning')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses existing tuplet-slot context when the selected toolbar duration differs', () => {
    render(<App />);
    chooseTuplet('Triplet');
    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    const secondTripletSlotX = getRenderedSlotX('Rest measure 1 beat 1.3333');

    fireEvent.mouseMove(overlay, {
      clientX: secondTripletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Quarter' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(overlay, {
      clientX: secondTripletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.queryByTestId('invalid-measure-warning')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 1.3333')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
  });

  it('places and fills a quintuplet slot using rendered tuplet context', () => {
    render(<App />);
    chooseTuplet('Tuplet 5');
    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });

    expect(screen.getAllByTestId('rendered-tuplet')).toHaveLength(1);
    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'sixteenth',
    );
    expect(screen.getByLabelText('Rest measure 1 beat 1.2')).toHaveAttribute(
      'data-duration',
      'sixteenth',
    );

    const secondQuintupletSlotX = getRenderedSlotX('Rest measure 1 beat 1.2');

    fireEvent.mouseMove(overlay, {
      clientX: secondQuintupletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Sixteenth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(overlay, {
      clientX: secondQuintupletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.queryByTestId('invalid-measure-warning')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 1.2')).toHaveAttribute(
      'data-duration',
      'sixteenth',
    );
  });

  it('re-enters existing tuplet-slot context after undo clears the write cursor', () => {
    render(<App />);
    chooseTuplet('Triplet');
    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'A', octave: 4 }, 'treble', 0),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    const secondTripletSlotX = getRenderedSlotX('Rest measure 1 beat 1.3333');

    fireEvent.mouseMove(overlay, {
      clientX: secondTripletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(getTupletMenuButton()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Eighth' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(overlay, {
      clientX: secondTripletSlotX,
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note G4 measure 1 beat 1.3333')).toHaveAttribute(
      'data-duration',
      'eighth',
    );
    expect(screen.queryByLabelText('Note A4 measure 1 beat 3')).not.toBeInTheDocument();
  });

  it('applies repeat and jump symbols to the selected measure', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Measure 1 treble' }));
    fireEvent.click(screen.getByRole('button', { name: 'Repeat and jump menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fine' }));

    expect(screen.getByRole('button', { name: 'Repeat and jump menu' })).toHaveTextContent(
      'Fine',
    );
    expect(screen.getByText('Fine set at measure 1')).toBeInTheDocument();
  });

  it('zooms the canvas with the slider and trackpad pinch wheel', () => {
    render(<App />);

    const paper = document.querySelector('.paper') as HTMLElement;
    const zoomSlider = screen.getByLabelText('Canvas zoom');

    fireEvent.change(zoomSlider, {
      target: { value: '125' },
    });

    expect(paper.style.getPropertyValue('--canvas-zoom')).toBe('1.25');
    expect(screen.getByLabelText('Current canvas zoom')).toHaveTextContent('125%');

    fireEvent.wheel(screen.getByLabelText('Notation viewport'), {
      ctrlKey: true,
      deltaY: -100,
    });

    expect(screen.getByLabelText('Current canvas zoom')).toHaveTextContent('130%');
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
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'G', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note E4 measure 1 beat 1')).toHaveAttribute(
      'data-duration',
      'quarter',
    );
    expect(screen.getByLabelText('Note G4 measure 1 beat 2')).toHaveAttribute(
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

  it('previews insert nudge on hover without committing until click', async () => {
    const { container } = render(<App />);
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
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
    });

    await waitFor(() =>
      expect(
        container.querySelector(
          '.vf-score-event[data-event-id="event-2"].vf-insert-preview-nudge',
        ),
      ).not.toBeNull(),
    );

    expect(screen.queryByLabelText('Note D4 measure 1 beat 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 2')).toBeInTheDocument();
    expect(screen.queryByTestId('insert-preview-layer')).not.toBeInTheDocument();

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
    });

    expect(screen.getByLabelText('Note D4 measure 1 beat 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Note G4 measure 1 beat 4')).toBeInTheDocument();
  });

  it('rejects insert into an empty slot instead of using insert like place mode', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 3, 4),
      clientY: getPitchY({ step: 'D', octave: 4 }, 'treble', 0),
    });

    expect(
      screen.getByText('Cannot insert: choose an existing note boundary first'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Note D4 measure 1 beat 4')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note C4 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Note E4 measure 1 beat 2')).toBeInTheDocument();
  });

  it('inserts a real clef change before an existing note and uses it for later pitch entry', async () => {
    const { container } = render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 3 }, 'bass', 1),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert Treble clef' }));
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });

    expect(screen.getByTestId('clef-change-preview')).toHaveAttribute(
      'data-clef',
      'treble',
    );

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });

    await waitFor(() =>
      expect(screen.getByTestId('rendered-clef-change')).toHaveAttribute(
        'data-clef',
        'treble',
      ),
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Clef change inserted',
      ),
    ).toBeInTheDocument();

    const bassTopLine = Number(
      container
        .querySelector('.vf-stave[data-staff-id="bass"][data-measure-index="0"] path')
        ?.getAttribute('d')
        ?.match(/^M[\d.]+ ([\d.]+)/)?.[1] ?? Number.NaN,
    );
    const d5InTrebleClefOnBassStaffY = Number.isFinite(bassTopLine)
      ? bassTopLine + STAFF_LINE_SPACING
      : getPitchY({ step: 'D', octave: 5 }, 'treble', 1);

    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: d5InTrebleClefOnBassStaffY,
    });

    expect(screen.getByLabelText('Note C3 measure 1 beat 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Note E3 measure 1 beat 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Note D5 measure 1 beat 3')).toBeInTheDocument();
  });

  it('selects, moves, and deletes an inline clef change like a score element', async () => {
    render(<App />);
    startWriting();

    const overlay = screen.getByTestId('staff-renderer');

    fireEvent.click(overlay, {
      clientX: getBeatX(0, 0, 4),
      clientY: getPitchY({ step: 'C', octave: 3 }, 'bass', 1),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 3 }, 'bass', 1),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Treble clef' }));
    fireEvent.click(overlay, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });

    await waitFor(() =>
      expect(screen.getByTestId('rendered-clef-change')).toHaveAttribute(
        'data-beat',
        '1',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select tool' }));

    const target = screen.getByTestId('clef-change-target');
    fireEvent.click(target);

    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'treble clef M1 B2',
      ),
    ).toBeInTheDocument();

    fireEvent.mouseDown(target, {
      clientX: getBeatX(0, 1, 4),
      clientY: getPitchY({ step: 'E', octave: 3 }, 'bass', 1),
    });
    fireEvent.mouseMove(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 3 }, 'bass', 1),
    });
    fireEvent.mouseUp(overlay, {
      clientX: getBeatX(0, 2, 4),
      clientY: getPitchY({ step: 'G', octave: 3 }, 'bass', 1),
    });

    await waitFor(() =>
      expect(screen.getByTestId('rendered-clef-change')).toHaveAttribute(
        'data-beat',
        '2',
      ),
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Clef change moved',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() =>
      expect(screen.queryByTestId('rendered-clef-change')).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Clef change deleted',
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

  it('starts playback from the selected event with the Space shortcut', async () => {
    const playTimelineAudioMock = vi.mocked(playTimelineAudio);

    render(<App />);

    fireEvent.keyDown(window, { code: 'Digit5', key: '5' });
    fireEvent.keyDown(window, { key: 'C' });
    fireEvent.keyDown(window, { key: 'D' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByTestId('score-event-delete')).toHaveAttribute(
      'aria-label',
      'Delete Note D4 measure 1 beat 2',
    );

    playTimelineAudioMock.mockClear();
    fireEvent.keyDown(window, { key: ' ' });

    await waitFor(() => {
      expect(playTimelineAudioMock).toHaveBeenCalledWith(
        expect.any(Array),
        { startSeconds: 0.625 },
      );
    });
    expect(
      screen.getByText('Playback started from selected event'),
    ).toBeInTheDocument();
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

  it('imports ABC notation files into the editor', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Import ABC notation file'), {
      target: {
        files: [
          new File(
            [
              `X:1
T:Imported ABC Tune
C:ABC Composer
M:3/4
L:1/32
Q:1/4=112
K:D
C8 D8 z4 | [EGB]8 |`,
            ],
            'imported.abc',
            {
              type: 'text/vnd.abc',
            },
          ),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Score title')).toHaveValue(
        'Imported ABC Tune',
      );
    });
    expect(screen.getByDisplayValue('ABC Composer')).toBeInTheDocument();
    expect(screen.getAllByTestId('score-event').length).toBeGreaterThan(0);
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'ABC imported: imported.abc',
      ),
    ).toBeInTheDocument();
  });

  it('downloads the current score as ABC notation', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:sheetlab-abc');
    const revokeObjectUrlSpy = vi.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlSpy,
    });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Download ABC' }));

    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:sheetlab-abc');
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'ABC downloaded: untitled-piano-exercise.abc',
      ),
    ).toBeInTheDocument();

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

  it('renders repeat and jump thumbnails as notation-style SVG previews', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Repeat and jump menu' }));

    const menu = screen.getByTestId('repeat-jump-thumbnail-menu');

    expect(menu.querySelector('.repeat-thumbnail-svg')).toBeInTheDocument();
    expect(menu.querySelector('.repeat-thumbnail-thick-bar')).toBeInTheDocument();
    expect(menu.querySelector('.repeat-thumbnail-volta')).toBeInTheDocument();
  });

  it('blocks PDF export and selects the first invalid measure when rhythm issues remain', async () => {
    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);
    render(<App />);
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
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected-measure')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(screen.getByTestId('invalid-measure-warning')).toHaveAttribute(
      'data-measure-key',
      'treble:0',
    );
    expect(
      within(screen.getByLabelText('Current editor state')).getByText(
        'Export blocked: fix 1 music issue before PDF (first: Voice voice-treble-1-main has rhythm overlap)',
      ),
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
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
        'PDF downloaded: untitled-piano-exercise.pdf',
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
