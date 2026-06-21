import { describe, expect, it } from 'vitest';
import {
  doAnnotationBoundsOverlap,
  insetAnnotationBounds,
  resolveAnnotationPlacementCollisions,
  type AnnotationBounds,
  type AnnotationPlacement,
} from './annotationLayoutPolicy';

const blocker: AnnotationBounds = {
  maxX: 48,
  maxY: 32,
  minX: 12,
  minY: 8,
};

function createPlacement(side: AnnotationPlacement['side']): AnnotationPlacement {
  return {
    maxX: 44,
    maxY: 30,
    minX: 16,
    minY: 10,
    row: 0,
    side,
  };
}

describe('resolveAnnotationPlacementCollisions', () => {
  it('keeps a clear manual placement unchanged', () => {
    const placement = {
      ...createPlacement('above'),
      maxY: -10,
      minY: -30,
    };

    expect(
      resolveAnnotationPlacementCollisions({
        blockers: [blocker],
        direction: 'above',
        placement,
      }),
    ).toEqual(placement);
  });

  it('nudges above-staff manual placements upward until blockers are clear', () => {
    const placement = createPlacement('above');
    const resolved = resolveAnnotationPlacementCollisions({
      blockers: [blocker],
      direction: 'above',
      placement,
    });

    expect(resolved.maxY).toBeLessThan(placement.maxY);
    expect(resolved.row).toBe(placement.row);
    expect(doAnnotationBoundsOverlap(resolved, blocker)).toBe(false);
  });

  it('nudges below-staff manual placements downward until blockers are clear', () => {
    const placement = createPlacement('below');
    const resolved = resolveAnnotationPlacementCollisions({
      blockers: [blocker],
      direction: 'below',
      placement,
    });

    expect(resolved.minY).toBeGreaterThan(placement.minY);
    expect(resolved.row).toBe(placement.row);
    expect(doAnnotationBoundsOverlap(resolved, blocker)).toBe(false);
  });

  it('can shrink padded ink blockers for manual collision checks', () => {
    expect(insetAnnotationBounds(blocker, { x: 4, y: 2 })).toEqual({
      maxX: 44,
      maxY: 30,
      minX: 16,
      minY: 10,
    });
  });
});
