import type {
  AnnotationKind,
  AnnotationPlacementSide,
  ScoreEvent,
} from '../../domain/score/types';

export type TextAnnotationKind = AnnotationKind | 'sectionMarker';
export type AnnotationSide = Exclude<AnnotationPlacementSide, 'auto'>;

export interface AnnotationBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export interface AnnotationPlacement extends AnnotationBounds {
  row: number;
  side: AnnotationSide;
}

export const FERMATA_SYMBOL = String.fromCodePoint(0x1d110);
export const PEDAL_MARK_TEXT = {
  release: '*',
  start: 'Ped.',
  'start-release': 'Ped. *',
} as const;

export const BELOW_STAFF_INK_GAP = 10;
export const ANNOTATION_ROW_GAP = 26;
export const ABOVE_STAFF_INK_GAP = 10;
export const ABOVE_STAFF_CLOSE_BASELINE_OFFSET = -18;
export const ABOVE_STAFF_FAR_BASELINE_OFFSET = -42;
export const NOTEHEAD_ANNOTATION_INK_PADDING = 12;
export const ANNOTATION_HORIZONTAL_GAP = 6;
export const MAX_ANNOTATION_ROW_ATTEMPTS = 8;
export const MAX_AUTO_BELOW_ANNOTATION_ROWS = 2;

export const ANNOTATION_METRICS = {
  chordSymbol: { charWidth: 9.5, descent: 5, height: 20, minWidth: 22 },
  dynamic: { charWidth: 9, descent: 5, height: 21, minWidth: 18 },
  fermata: { charWidth: 14, descent: 5, height: 26, minWidth: 18 },
  lyric: { charWidth: 8.2, descent: 5, height: 18, minWidth: 18 },
  pedal: { charWidth: 8.5, descent: 5, height: 19, minWidth: 20 },
  sectionMarker: { charWidth: 8, descent: 5, height: 20, minWidth: 34 },
} satisfies Record<
  TextAnnotationKind,
  { charWidth: number; descent: number; height: number; minWidth: number }
>;

export function combineAnnotationBounds(bounds: AnnotationBounds[]) {
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce<AnnotationBounds>(
    (combined, candidate) => ({
      maxX: Math.max(combined.maxX, candidate.maxX),
      maxY: Math.max(combined.maxY, candidate.maxY),
      minX: Math.min(combined.minX, candidate.minX),
      minY: Math.min(combined.minY, candidate.minY),
    }),
    bounds[0],
  );
}

export function getAnnotationBounds({
  kind,
  text,
  x,
  y,
}: {
  kind: TextAnnotationKind;
  text: string;
  x: number;
  y: number;
}): AnnotationBounds {
  const metrics = ANNOTATION_METRICS[kind];
  const width =
    Math.max(metrics.minWidth, text.length * metrics.charWidth) +
    ANNOTATION_HORIZONTAL_GAP * 2;

  return {
    maxX: x + width / 2,
    maxY: y + metrics.descent,
    minX: x - width / 2,
    minY: y - metrics.height,
  };
}

export function doAnnotationBoundsOverlap(
  first: AnnotationBounds,
  second: AnnotationBounds,
) {
  return (
    first.minX < second.maxX &&
    first.maxX > second.minX &&
    first.minY < second.maxY &&
    first.maxY > second.minY
  );
}

export function moveAnnotationBoundsY(
  bounds: AnnotationBounds,
  deltaY: number,
) {
  return {
    ...bounds,
    maxY: bounds.maxY + deltaY,
    minY: bounds.minY + deltaY,
  };
}

export function placeAnnotationInRows({
  blockers = [],
  direction,
  placements,
  preferredBounds,
}: {
  blockers?: AnnotationBounds[];
  direction: AnnotationSide;
  placements: AnnotationPlacement[];
  preferredBounds: AnnotationBounds;
}) {
  const rowDirection = direction === 'below' ? 1 : -1;

  for (let offset = 0; offset < MAX_ANNOTATION_ROW_ATTEMPTS; offset += 1) {
    const row = offset;
    const bounds = moveAnnotationBoundsY(
      preferredBounds,
      rowDirection * offset * ANNOTATION_ROW_GAP,
    );
    const hasCollision = [...placements, ...blockers].some((placement) =>
      doAnnotationBoundsOverlap(bounds, placement),
    );

    if (!hasCollision) {
      const placement = { ...bounds, row, side: direction };

      placements.push(placement);
      return placement;
    }
  }

  const fallbackOffset = MAX_ANNOTATION_ROW_ATTEMPTS;
  const fallbackBounds = moveAnnotationBoundsY(
    preferredBounds,
    rowDirection * fallbackOffset * ANNOTATION_ROW_GAP,
  );
  const fallbackPlacement = {
    ...fallbackBounds,
    row: fallbackOffset,
    side: direction,
  };

  placements.push(fallbackPlacement);
  return fallbackPlacement;
}

export function getAnnotationRowCount(placements: AnnotationPlacement[]) {
  return placements.length === 0
    ? 0
    : Math.max(...placements.map((placement) => placement.row)) + 1;
}

export function getAutomaticAnnotationSide(
  event: ScoreEvent,
  kind: AnnotationKind,
  abovePlacements: AnnotationPlacement[],
  belowPlacements: AnnotationPlacement[],
): AnnotationSide {
  const override = event.annotationPlacements?.[kind];

  if (override === 'above' || override === 'below') {
    return override;
  }

  if (kind === 'chordSymbol' || kind === 'fermata') {
    return 'above';
  }

  if (kind === 'lyric') {
    return 'below';
  }

  const belowRows = getAnnotationRowCount(belowPlacements);
  const aboveRows = getAnnotationRowCount(abovePlacements);

  return belowRows >= MAX_AUTO_BELOW_ANNOTATION_ROWS && belowRows > aboveRows
    ? 'above'
    : 'below';
}

export function getEventAnnotationText(event: ScoreEvent, kind: AnnotationKind) {
  if (kind === 'chordSymbol') {
    return event.chordSymbol ?? null;
  }

  if (kind === 'dynamic') {
    return event.dynamic ?? null;
  }

  if (kind === 'fermata') {
    return event.fermata ? FERMATA_SYMBOL : null;
  }

  if (kind === 'lyric') {
    return event.lyric ?? null;
  }

  return event.pedal ? PEDAL_MARK_TEXT[event.pedal] : null;
}

export function getEventAnnotationKinds(event: ScoreEvent) {
  return ([
    event.chordSymbol ? 'chordSymbol' : null,
    event.lyric ? 'lyric' : null,
    event.dynamic ? 'dynamic' : null,
    event.fermata ? 'fermata' : null,
    event.pedal ? 'pedal' : null,
  ].filter(Boolean) as AnnotationKind[]);
}

export function getAboveAnnotationBaseline({
  eventInkTop,
  kind,
  staffTop,
  voiceInkTop,
}: {
  eventInkTop?: number | null;
  kind: AnnotationKind;
  staffTop: number;
  voiceInkTop?: number | null;
}) {
  const metrics = ANNOTATION_METRICS[kind];
  const closeBaseline = staffTop + ABOVE_STAFF_CLOSE_BASELINE_OFFSET;
  const candidateBaselines = [
    closeBaseline,
    voiceInkTop !== null && voiceInkTop !== undefined
      ? voiceInkTop - ABOVE_STAFF_INK_GAP - metrics.descent
      : null,
    eventInkTop !== null && eventInkTop !== undefined
      ? eventInkTop - ABOVE_STAFF_INK_GAP - metrics.descent
      : null,
  ].filter((value): value is number => value !== null);

  return Math.min(...candidateBaselines);
}
