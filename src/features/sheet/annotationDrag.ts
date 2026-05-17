import {
  clampAnnotationOffset,
} from '../../domain/score/annotationOffsets';
import type { AnnotationOffset } from '../../domain/score/types';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';

const COLLISION_GAP = 6;

function boundsOverlap(
  first: { maxX: number; maxY: number; minX: number; minY: number },
  second: { maxX: number; maxY: number; minX: number; minY: number },
) {
  return (
    first.minX < second.maxX &&
    first.maxX > second.minX &&
    first.minY < second.maxY &&
    first.maxY > second.minY
  );
}

function getShiftedAnnotationBounds(
  layout: RenderedAnnotationLayout,
  offset: AnnotationOffset,
) {
  const deltaX = offset.x - layout.offsetX;
  const deltaY = offset.y - layout.offsetY;

  return {
    maxX: layout.maxX + deltaX,
    maxY: layout.maxY + deltaY,
    minX: layout.minX + deltaX,
    minY: layout.minY + deltaY,
  };
}

export function resolveAnnotationDragOffset({
  eventLayout,
  layout,
  offset,
}: {
  eventLayout?: RenderedEventLayout | null;
  layout: RenderedAnnotationLayout;
  offset: AnnotationOffset;
}) {
  const clampedOffset = clampAnnotationOffset(offset);

  if (!eventLayout) {
    return clampedOffset;
  }

  const shiftedBounds = getShiftedAnnotationBounds(layout, clampedOffset);

  if (!boundsOverlap(shiftedBounds, eventLayout)) {
    return clampedOffset;
  }

  const verticalPush =
    layout.side === 'above'
      ? eventLayout.minY - COLLISION_GAP - shiftedBounds.maxY
      : eventLayout.maxY + COLLISION_GAP - shiftedBounds.minY;

  const verticalOffset = clampAnnotationOffset({
    ...clampedOffset,
    y: clampedOffset.y + verticalPush,
  });
  const verticalBounds = getShiftedAnnotationBounds(layout, verticalOffset);

  if (!boundsOverlap(verticalBounds, eventLayout)) {
    return verticalOffset;
  }

  const pushLeft = eventLayout.minX - COLLISION_GAP - shiftedBounds.maxX;
  const pushRight = eventLayout.maxX + COLLISION_GAP - shiftedBounds.minX;
  const horizontalPush =
    Math.abs(pushLeft) <= Math.abs(pushRight) ? pushLeft : pushRight;

  return clampAnnotationOffset({
    ...verticalOffset,
    x: verticalOffset.x + horizontalPush,
  });
}
