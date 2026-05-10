import type { Clef } from '../../domain/score/types';
import type { AnnotationBounds } from './annotationLayoutPolicy';

const CLEF_X_OFFSET = 0;

const CLEF_INK_BOUNDS = {
  bass: {
    maxX: 34,
    maxY: 36,
    minX: 4,
    minY: -2,
  },
  treble: {
    maxX: 34,
    maxY: 52,
    minX: 4,
    minY: -22,
  },
} satisfies Record<Clef, AnnotationBounds>;

export function getClefVerticalInkBounds(clef: Clef) {
  const bounds = CLEF_INK_BOUNDS[clef];

  return {
    maxY: bounds.maxY,
    minY: bounds.minY,
  };
}

export function getClefInkBounds({
  clef,
  measureX,
  staffTop,
}: {
  clef: Clef;
  measureX: number;
  staffTop: number;
}): AnnotationBounds {
  const bounds = CLEF_INK_BOUNDS[clef];

  return {
    maxX: measureX + CLEF_X_OFFSET + bounds.maxX,
    maxY: staffTop + bounds.maxY,
    minX: measureX + CLEF_X_OFFSET + bounds.minX,
    minY: staffTop + bounds.minY,
  };
}
