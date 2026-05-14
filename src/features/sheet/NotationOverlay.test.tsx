import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  tryPlaceScoreEvent,
  tryPlaceTupletGroup,
} from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import type { TupletInfo } from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { InputCursor } from '../editor/inputCursor';
import { getBeatX } from './notationGeometry';
import { NotationOverlay } from './NotationOverlay';
import type { MusicPosition } from './interaction';
import type { RenderedEventLayout } from './renderedEventLayout';

function createLayout(x: number, beat: number): RenderedEventLayout {
  return {
    beat,
    isGeneratedRest: false,
    kind: 'rest',
    maxX: x + 5,
    maxY: 130,
    measureIndex: 0,
    minX: x - 5,
    minY: 100,
    pitchLayouts: [],
    staffId: 'treble',
    voiceIndex: 0,
    x,
    y: 115,
  };
}

describe('NotationOverlay', () => {
  it('keeps the ghost note on the hovered rendered tuplet slot', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'overlay-hover-triplet',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const score = tripletResult.score;
    const tripletEvents =
      score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.filter(
        (event) => event.tuplet?.id === 'tuplet-overlay-hover-triplet',
      ) ?? [];
    const targetEvent = tripletEvents[2];
    const targetTuplet = targetEvent?.tuplet as TupletInfo;
    const linearCursorX = getBeatX(
      0,
      targetEvent?.beat ?? 0.6667,
      getMeasureBeats(score.timeSignature),
      score,
    );
    const targetRenderedX = linearCursorX + 80;
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'overlay-hover-triplet': createLayout(linearCursorX - 80, 0),
      'tuplet-overlay-hover-triplet-rest-1': createLayout(linearCursorX, 0.3333),
      'tuplet-overlay-hover-triplet-rest-2': createLayout(targetRenderedX, 0.6667),
    };
    const hoverPosition: MusicPosition = {
      beat: targetEvent?.beat ?? 0.6667,
      measureIndex: 0,
      pitch: { step: 'E', octave: 4 },
      staffId: 'treble',
      staffIndex: 0,
      x: targetRenderedX,
      y: 118,
    };
    const inputCursor: InputCursor = {
      beat: hoverPosition.beat,
      duration: 'eighth',
      measureIndex: 0,
      mode: 'note-input',
      pitchPreview: hoverPosition.pitch,
      staffId: 'treble',
      staffIndex: 0,
      tuplet: targetTuplet,
    };

    render(
      <NotationOverlay
        dots={0}
        duration="eighth"
        entryMode="note"
        eventLayouts={eventLayouts}
        hoverPosition={hoverPosition}
        inputCursor={inputCursor}
        isInputArmed
        score={score}
        svgHeight={260}
      />,
    );

    const slotCenterX = Number(
      screen.getByTestId('rhythm-slot').getAttribute('data-slot-center-x'),
    );
    const ghostCenterX = Number(
      screen.getByTestId('ghost-event').querySelector('ellipse')?.getAttribute('cx'),
    );

    expect(slotCenterX).toBeCloseTo(targetRenderedX, 2);
    expect(ghostCenterX).toBeCloseTo(targetRenderedX, 2);
    expect(ghostCenterX).not.toBeCloseTo(linearCursorX, 2);
  });

  it('keeps the ghost note on a regular rendered column after a tuplet', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'overlay-post-triplet',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const noteResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'overlay-post-triplet-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const score = noteResult.score;
    const linearCursorX = getBeatX(
      0,
      1,
      getMeasureBeats(score.timeSignature),
      score,
    );
    const targetRenderedX = linearCursorX + 80;
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'overlay-post-triplet': createLayout(linearCursorX - 120, 0),
      'tuplet-overlay-post-triplet-rest-1': createLayout(linearCursorX - 80, 0.3333),
      'tuplet-overlay-post-triplet-rest-2': createLayout(linearCursorX - 40, 0.6667),
      'overlay-post-triplet-note': createLayout(targetRenderedX, 1),
    };
    const hoverPosition: MusicPosition = {
      beat: 1,
      measureIndex: 0,
      pitch: { step: 'D', octave: 4 },
      staffId: 'treble',
      staffIndex: 0,
      x: targetRenderedX,
      y: 118,
    };
    const inputCursor: InputCursor = {
      beat: 1,
      duration: 'eighth',
      measureIndex: 0,
      mode: 'note-input',
      pitchPreview: hoverPosition.pitch,
      staffId: 'treble',
      staffIndex: 0,
    };

    render(
      <NotationOverlay
        dots={0}
        duration="eighth"
        entryMode="note"
        eventLayouts={eventLayouts}
        hoverPosition={hoverPosition}
        inputCursor={inputCursor}
        isInputArmed
        score={score}
        svgHeight={260}
      />,
    );

    const slotCenterX = Number(
      screen.getByTestId('rhythm-slot').getAttribute('data-slot-center-x'),
    );
    const ghostCenterX = Number(
      screen.getByTestId('ghost-event').querySelector('ellipse')?.getAttribute('cx'),
    );

    expect(slotCenterX).toBeCloseTo(targetRenderedX, 2);
    expect(ghostCenterX).toBeCloseTo(targetRenderedX, 2);
    expect(ghostCenterX).not.toBeCloseTo(linearCursorX, 2);
  });

  it('uses the live hover column when the stored cursor still points at the previous slot', () => {
    const first = tryPlaceScoreEvent(createEmptyScore('treble'), {
      eventId: 'stale-cursor-previous',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const second = tryPlaceScoreEvent(first.score, {
      eventId: 'stale-cursor-target',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const previousX = getBeatX(
      0,
      1,
      getMeasureBeats(second.score.timeSignature),
      second.score,
    );
    const targetX = previousX + 90;
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'stale-cursor-previous': createLayout(previousX, 1),
      'stale-cursor-target': createLayout(targetX, 2),
    };
    const hoverPosition: MusicPosition = {
      beat: 2,
      measureIndex: 0,
      pitch: { step: 'F', octave: 4 },
      staffId: 'treble',
      staffIndex: 0,
      x: targetX,
      y: 118,
    };
    const inputCursor: InputCursor = {
      beat: 1,
      duration: 'quarter',
      measureIndex: 0,
      mode: 'note-input',
      pitchPreview: hoverPosition.pitch,
      staffId: 'treble',
      staffIndex: 0,
    };

    render(
      <NotationOverlay
        dots={0}
        duration="quarter"
        entryMode="note"
        eventLayouts={eventLayouts}
        hoverPosition={hoverPosition}
        inputCursor={inputCursor}
        isInputArmed
        score={second.score}
        svgHeight={260}
      />,
    );

    const slot = screen.getByTestId('rhythm-slot');
    const slotCenterX = Number(slot.getAttribute('data-slot-center-x'));
    const ghostCenterX = Number(
      screen.getByTestId('ghost-event').querySelector('ellipse')?.getAttribute('cx'),
    );

    expect(slot).toHaveAttribute('data-beat', '2');
    expect(slotCenterX).toBeCloseTo(targetX, 2);
    expect(ghostCenterX).toBeCloseTo(targetX, 2);
    expect(ghostCenterX).not.toBeCloseTo(previousX, 2);
  });
});
