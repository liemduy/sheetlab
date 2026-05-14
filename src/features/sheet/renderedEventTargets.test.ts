import { describe, expect, it } from 'vitest';
import type { RenderedEventLayout } from './renderedEventLayout';
import {
  findClosestRenderedInsertTarget,
  findRenderedEventLayoutAtBeat,
} from './renderedEventTargets';

function createLayout(
  update: Partial<RenderedEventLayout> = {},
): RenderedEventLayout {
  return {
    beat: 0,
    isGeneratedRest: false,
    kind: 'note',
    maxX: 106,
    maxY: 120,
    measureIndex: 0,
    minX: 94,
    minY: 80,
    pitchLayouts: [],
    staffId: 'treble',
    voiceIndex: 0,
    x: 100,
    y: 100,
    ...update,
  };
}

describe('rendered event targets', () => {
  it('finds the first rendered voice layout at an exact musical beat', () => {
    const voiceOneLayout = createLayout({
      beat: 1,
      voiceIndex: 1,
      x: 180,
    });
    const voiceZeroLayout = createLayout({
      beat: 1,
      voiceIndex: 0,
      x: 160,
    });

    expect(
      findRenderedEventLayoutAtBeat({
        beat: 1,
        eventLayouts: {
          voiceOne: voiceOneLayout,
          voiceZero: voiceZeroLayout,
        },
        measureIndex: 0,
        staffId: 'treble',
      }),
    ).toBe(voiceZeroLayout);
  });

  it('uses only written events from the active voice for insert snapping', () => {
    const target = createLayout({
      beat: 2,
      maxX: 226,
      minX: 214,
      x: 220,
    });

    expect(
      findClosestRenderedInsertTarget({
        eventLayouts: {
          generatedRest: createLayout({
            beat: 1,
            isGeneratedRest: true,
            kind: 'rest',
            x: 218,
          }),
          otherVoice: createLayout({
            beat: 1,
            voiceIndex: 1,
            x: 219,
          }),
          target,
        },
        measureIndex: 0,
        pointerX: 221,
        staffId: 'treble',
        voiceIndex: 0,
      })?.layout,
    ).toBe(target);
  });

  it('rejects insert snapping when the pointer is outside the rendered target width', () => {
    expect(
      findClosestRenderedInsertTarget({
        eventLayouts: {
          far: createLayout({
            maxX: 106,
            minX: 94,
            x: 100,
          }),
        },
        measureIndex: 0,
        pointerX: 180,
        staffId: 'treble',
        voiceIndex: 0,
      }),
    ).toBeNull();
  });
});
