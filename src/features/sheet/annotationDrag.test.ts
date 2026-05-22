import { describe, expect, it } from 'vitest';
import { ANNOTATION_OFFSET_LIMIT } from '../../domain/score/annotationOffsets';
import { resolveAnnotationDragOffset } from './annotationDrag';

describe('resolveAnnotationDragOffset', () => {
  it('keeps drag freedom near the owning event while clamping the local range', () => {
    const resolvedOffset = resolveAnnotationDragOffset({
      offset: { x: 0, y: 15 },
    });

    expect(resolvedOffset).toEqual({ x: 0, y: 15 });
  });

  it('bounds extreme offsets to the annotation movement range', () => {
    const resolvedOffset = resolveAnnotationDragOffset({
      offset: { x: 999, y: -999 },
    });

    expect(resolvedOffset).toEqual({
      x: ANNOTATION_OFFSET_LIMIT.x,
      y: -ANNOTATION_OFFSET_LIMIT.y,
    });
  });
});
