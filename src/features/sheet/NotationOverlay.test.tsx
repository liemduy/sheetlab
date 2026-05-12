import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tryPlaceTupletGroup } from '../../domain/score/editing';
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
});
