import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Clef, Pitch } from './domain/score/types';
import { getBeatX, getPitchY } from './features/sheet/notationGeometry';

function clickDuration(name: 'Whole' | 'Half' | 'Quarter') {
  fireEvent.click(screen.getByRole('button', { name }));
}

function clickPlacement(name: 'Insert' | 'Place') {
  fireEvent.click(screen.getByRole('button', { name }));
}

function clickScoreNote(
  overlay: HTMLElement,
  measureIndex: number,
  beat: number,
  pitch: Pitch,
  clef: Clef = 'treble',
  staffIndex = 0,
) {
  fireEvent.click(overlay, {
    clientX: getBeatX(measureIndex, beat, 4),
    clientY: getPitchY(pitch, clef, staffIndex),
  });
}

function dragScoreNote(
  overlay: HTMLElement,
  label: string,
  from: { beat: number; clef?: Clef; measureIndex: number; pitch: Pitch; staffIndex?: number },
  to: { beat: number; clef?: Clef; measureIndex: number; pitch: Pitch; staffIndex?: number },
) {
  const startPoint = {
    clientX: getBeatX(from.measureIndex, from.beat, 4),
    clientY: getPitchY(from.pitch, from.clef ?? 'treble', from.staffIndex ?? 0),
  };
  const targetPoint = {
    clientX: getBeatX(to.measureIndex, to.beat, 4),
    clientY: getPitchY(to.pitch, to.clef ?? 'treble', to.staffIndex ?? 0),
  };

  fireEvent.mouseDown(screen.getByRole('button', { name: label }), startPoint);
  fireEvent.mouseMove(overlay, targetPoint);
  fireEvent.mouseUp(overlay, targetPoint);
  fireEvent.click(overlay, targetPoint);
}

function expectNote(label: string, duration: string) {
  expect(screen.getByRole('button', { name: label })).toHaveAttribute(
    'data-duration',
    duration,
  );
}

describe('user acceptance song flows', () => {
  it('creates the treble melody with insert, drag repair, and delete correction', () => {
    render(<App />);

    const overlay = screen.getByTestId('staff-renderer');

    clickScoreNote(overlay, 0, 0, { step: 'E', octave: 4 });
    clickScoreNote(overlay, 0, 1, { step: 'D', octave: 4 });
    clickScoreNote(overlay, 0, 2, { step: 'D', octave: 4 });
    clickPlacement('Insert');
    clickScoreNote(overlay, 0, 2, { step: 'C', octave: 4 });
    clickPlacement('Place');

    clickScoreNote(overlay, 1, 0, { step: 'F', octave: 4 });
    dragScoreNote(
      overlay,
      'Note F4 measure 2 beat 1',
      { beat: 0, measureIndex: 1, pitch: { step: 'F', octave: 4 } },
      { beat: 0, measureIndex: 1, pitch: { step: 'E', octave: 4 } },
    );

    clickScoreNote(overlay, 1, 1, { step: 'A', octave: 4 });
    fireEvent.click(screen.getByTestId('score-event-delete'));
    clickScoreNote(overlay, 1, 1, { step: 'E', octave: 4 });
    clickDuration('Half');
    clickScoreNote(overlay, 1, 2, { step: 'E', octave: 4 });

    clickDuration('Quarter');
    clickScoreNote(overlay, 2, 0, { step: 'D', octave: 4 });
    clickScoreNote(overlay, 2, 1, { step: 'D', octave: 4 });
    clickDuration('Half');
    clickScoreNote(overlay, 2, 2, { step: 'D', octave: 4 });

    clickDuration('Quarter');
    clickScoreNote(overlay, 3, 0, { step: 'E', octave: 4 });
    clickScoreNote(overlay, 3, 1, { step: 'G', octave: 4 });
    clickDuration('Half');
    clickScoreNote(overlay, 3, 2, { step: 'G', octave: 4 });

    expectNote('Note E4 measure 1 beat 1', 'quarter');
    expectNote('Note D4 measure 1 beat 2', 'quarter');
    expectNote('Note C4 measure 1 beat 3', 'quarter');
    expectNote('Note D4 measure 1 beat 4', 'quarter');
    expectNote('Note E4 measure 2 beat 1', 'quarter');
    expectNote('Note E4 measure 2 beat 2', 'quarter');
    expectNote('Note E4 measure 2 beat 3', 'half');
    expectNote('Note D4 measure 3 beat 1', 'quarter');
    expectNote('Note D4 measure 3 beat 2', 'quarter');
    expectNote('Note D4 measure 3 beat 3', 'half');
    expectNote('Note E4 measure 4 beat 1', 'quarter');
    expectNote('Note G4 measure 4 beat 2', 'quarter');
    expectNote('Note G4 measure 4 beat 3', 'half');
  });

  it('creates a piano grand-staff exercise with treble and bass parts', () => {
    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Score type' }), {
      target: { value: 'grand' },
    });
    const overlay = screen.getByTestId('staff-renderer');

    clickScoreNote(overlay, 0, 0, { step: 'C', octave: 5 });
    clickScoreNote(overlay, 0, 1, { step: 'D', octave: 5 });
    clickScoreNote(overlay, 0, 2, { step: 'G', octave: 5 });
    clickPlacement('Insert');
    clickScoreNote(overlay, 0, 2, { step: 'E', octave: 5 });
    clickPlacement('Place');

    clickScoreNote(overlay, 0, 4 - 1, { step: 'A', octave: 5 });
    fireEvent.click(screen.getByTestId('score-event-delete'));
    clickScoreNote(overlay, 0, 3, { step: 'G', octave: 5 });

    clickDuration('Half');
    clickScoreNote(overlay, 1, 2, { step: 'C', octave: 5 });
    clickDuration('Quarter');
    clickScoreNote(overlay, 1, 0, { step: 'E', octave: 5 });
    clickScoreNote(overlay, 1, 1, { step: 'D', octave: 5 });

    clickScoreNote(overlay, 2, 0, { step: 'G', octave: 4 });
    clickScoreNote(overlay, 2, 1, { step: 'A', octave: 4 });
    clickScoreNote(overlay, 2, 2, { step: 'B', octave: 4 });
    clickScoreNote(overlay, 2, 3, { step: 'C', octave: 5 });

    clickDuration('Whole');
    clickScoreNote(overlay, 3, 0, { step: 'C', octave: 5 });

    clickScoreNote(overlay, 0, 0, { step: 'D', octave: 3 }, 'bass', 1);
    dragScoreNote(
      overlay,
      'Note D3 measure 1 beat 1',
      {
        beat: 0,
        clef: 'bass',
        measureIndex: 0,
        pitch: { step: 'D', octave: 3 },
        staffIndex: 1,
      },
      {
        beat: 0,
        clef: 'bass',
        measureIndex: 0,
        pitch: { step: 'C', octave: 3 },
        staffIndex: 1,
      },
    );
    clickScoreNote(overlay, 1, 0, { step: 'G', octave: 2 }, 'bass', 1);
    clickScoreNote(overlay, 2, 0, { step: 'F', octave: 2 }, 'bass', 1);
    clickScoreNote(overlay, 3, 0, { step: 'C', octave: 3 }, 'bass', 1);

    expectNote('Note C5 measure 1 beat 1', 'quarter');
    expectNote('Note D5 measure 1 beat 2', 'quarter');
    expectNote('Note E5 measure 1 beat 3', 'quarter');
    expectNote('Note G5 measure 1 beat 4', 'quarter');
    expectNote('Note E5 measure 2 beat 1', 'quarter');
    expectNote('Note D5 measure 2 beat 2', 'quarter');
    expectNote('Note C5 measure 2 beat 3', 'half');
    expectNote('Note G4 measure 3 beat 1', 'quarter');
    expectNote('Note A4 measure 3 beat 2', 'quarter');
    expectNote('Note B4 measure 3 beat 3', 'quarter');
    expectNote('Note C5 measure 3 beat 4', 'quarter');
    expect(screen.getAllByRole('button', { name: 'Note C5 measure 4 beat 1' })[0])
      .toHaveAttribute('data-duration', 'whole');
    expectNote('Note C3 measure 1 beat 1', 'whole');
    expectNote('Note G2 measure 2 beat 1', 'whole');
    expectNote('Note F2 measure 3 beat 1', 'whole');
    expectNote('Note C3 measure 4 beat 1', 'whole');
  });

  it('exports a PDF after a user creates a piano score', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      blob: vi
        .fn()
        .mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' })),
      ok: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:sheetlab-uat-pdf');
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Score type' }), {
      target: { value: 'grand' },
    });
    const overlay = screen.getByTestId('staff-renderer');

    clickScoreNote(overlay, 0, 0, { step: 'C', octave: 5 });
    clickDuration('Whole');
    clickScoreNote(overlay, 0, 0, { step: 'C', octave: 3 }, 'bass', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/export-pdf',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:sheetlab-uat-pdf');
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
