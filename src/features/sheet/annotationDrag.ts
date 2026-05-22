import { clampAnnotationOffset } from '../../domain/score/annotationOffsets';
import type { AnnotationOffset } from '../../domain/score/types';

export function resolveAnnotationDragOffset({
  offset,
}: {
  offset: AnnotationOffset;
}) {
  return clampAnnotationOffset(offset);
}
