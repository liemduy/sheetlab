import type {
  AnnotationKind,
  AnnotationOffset,
  AnnotationOffsets,
  ScoreEvent,
} from './types';

export const ANNOTATION_OFFSET_LIMIT = {
  x: 56,
  y: 42,
} as const;

function clamp(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}

function roundOffsetValue(value: number) {
  const rounded = Number(value.toFixed(2));

  return Math.abs(rounded) < 0.01 ? 0 : rounded;
}

export function clampAnnotationOffset(
  offset: AnnotationOffset,
): AnnotationOffset {
  return {
    x: roundOffsetValue(clamp(offset.x, ANNOTATION_OFFSET_LIMIT.x)),
    y: roundOffsetValue(clamp(offset.y, ANNOTATION_OFFSET_LIMIT.y)),
  };
}

export function isDefaultAnnotationOffset(offset: AnnotationOffset) {
  return offset.x === 0 && offset.y === 0;
}

export function getEventAnnotationOffset(
  event: Pick<ScoreEvent, 'annotationOffsets'>,
  kind: AnnotationKind,
): AnnotationOffset {
  const offset = event.annotationOffsets?.[kind];

  return offset ? clampAnnotationOffset(offset) : { x: 0, y: 0 };
}

export function setAnnotationOffset(
  offsets: AnnotationOffsets | undefined,
  kind: AnnotationKind,
  offset: AnnotationOffset | null,
) {
  const nextOffsets = { ...(offsets ?? {}) };

  if (!offset) {
    delete nextOffsets[kind];
  } else {
    const clampedOffset = clampAnnotationOffset(offset);

    if (isDefaultAnnotationOffset(clampedOffset)) {
      delete nextOffsets[kind];
    } else {
      nextOffsets[kind] = clampedOffset;
    }
  }

  return Object.keys(nextOffsets).length > 0 ? nextOffsets : undefined;
}
