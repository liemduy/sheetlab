import { describe, expect, it } from 'vitest';
import { resolveAnnotationDragOffset } from './annotationDrag';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';

const baseAnnotationLayout: RenderedAnnotationLayout = {
  eventId: 'event-1',
  id: 'event-1:dynamic',
  kind: 'dynamic',
  maxX: 112,
  maxY: 70,
  measureIndex: 0,
  minX: 88,
  minY: 50,
  offsetX: 0,
  offsetY: 0,
  row: 0,
  side: 'above',
  staffId: 'treble',
  text: 'mf',
  voiceIndex: 0,
  x: 100,
  y: 65,
};

const baseEventLayout: RenderedEventLayout = {
  beat: 0,
  isGeneratedRest: false,
  kind: 'note',
  maxX: 114,
  maxY: 92,
  measureIndex: 0,
  minX: 86,
  minY: 72,
  pitchLayouts: [],
  staffId: 'treble',
  voiceIndex: 0,
  x: 100,
  y: 82,
};

describe('resolveAnnotationDragOffset', () => {
  it('keeps dragged annotation bounds clear of their owning event ink', () => {
    const resolvedOffset = resolveAnnotationDragOffset({
      eventLayout: baseEventLayout,
      layout: baseAnnotationLayout,
      offset: { x: 0, y: 15 },
    });

    expect(resolvedOffset).toEqual({ x: 0, y: -4 });
  });

  it('preserves non-colliding offsets inside the local drag range', () => {
    const resolvedOffset = resolveAnnotationDragOffset({
      eventLayout: baseEventLayout,
      layout: baseAnnotationLayout,
      offset: { x: 18, y: -12 },
    });

    expect(resolvedOffset).toEqual({ x: 18, y: -12 });
  });
});
