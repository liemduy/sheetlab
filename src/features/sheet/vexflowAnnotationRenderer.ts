import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Score,
  ScoreEvent,
} from '../../domain/score/types';
import { isGeneratedRestEvent } from '../../domain/score/events';
import {
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getScoreStaffTop,
  getScoreSystemMeasureIndexes,
  getSystemIndex,
} from './layout';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';

interface AnnotationBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface AnnotationPlacement extends AnnotationBounds {
  row: number;
  side: AnnotationSide;
}

type TextAnnotationKind = AnnotationKind | 'sectionMarker';
type AnnotationSide = Exclude<AnnotationPlacementSide, 'auto'>;

const FERMATA_SYMBOL = String.fromCodePoint(0x1d110);
const PEDAL_MARK_TEXT = {
  release: '*',
  start: 'Ped.',
  'start-release': 'Ped. *',
} as const;

const BELOW_STAFF_INK_GAP = 10;
const BELOW_STAFF_ROW_GAP = 26;
const ABOVE_STAFF_INK_GAP = 10;
const ABOVE_STAFF_ROW_GAP = 26;
const ABOVE_STAFF_CLOSE_BASELINE_OFFSET = -18;
const ABOVE_STAFF_FAR_BASELINE_OFFSET = -42;
const NOTEHEAD_ANNOTATION_INK_PADDING = 12;
const ANNOTATION_HORIZONTAL_GAP = 6;
const MAX_ANNOTATION_ROW_ATTEMPTS = 8;
const MAX_AUTO_BELOW_ANNOTATION_ROWS = 2;

const ANNOTATION_METRICS = {
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

function combineAnnotationBounds(bounds: AnnotationBounds[]) {
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

function appendSvgText({
  className,
  dataset,
  svg,
  text,
  x,
  y,
}: {
  className: string;
  dataset?: Record<string, string>;
  svg: SVGSVGElement;
  text: string;
  x: number;
  y: number;
}) {
  const textElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'text',
  );

  textElement.classList.add(className);
  textElement.setAttribute('x', x.toFixed(2));
  textElement.setAttribute('y', y.toFixed(2));
  textElement.textContent = text;

  Object.entries(dataset ?? {}).forEach(([key, value]) => {
    textElement.setAttribute(key, value);
  });

  svg.appendChild(textElement);

  return textElement;
}

function getAnnotationBounds({
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

function doAnnotationBoundsOverlap(
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

function moveAnnotationBoundsY(bounds: AnnotationBounds, deltaY: number) {
  return {
    ...bounds,
    maxY: bounds.maxY + deltaY,
    minY: bounds.minY + deltaY,
  };
}

function placeAnnotationInRows({
  direction,
  placements,
  preferredBounds,
}: {
  direction: AnnotationSide;
  placements: AnnotationPlacement[];
  preferredBounds: AnnotationBounds;
}) {
  const rowGap =
    direction === 'below' ? BELOW_STAFF_ROW_GAP : ABOVE_STAFF_ROW_GAP;
  const rowDirection = direction === 'below' ? 1 : -1;

  for (let offset = 0; offset < MAX_ANNOTATION_ROW_ATTEMPTS; offset += 1) {
    const row = offset;
    const bounds = moveAnnotationBoundsY(
      preferredBounds,
      rowDirection * offset * rowGap,
    );
    const hasCollision = placements.some((placement) =>
      doAnnotationBoundsOverlap(bounds, placement),
    );

    if (!hasCollision) {
      const placement = { ...bounds, row, side: direction };

      placements.push(placement);
      return placement;
    }
  }

  const fallbackOffset = MAX_ANNOTATION_ROW_ATTEMPTS;
  const fallbackRow = fallbackOffset;
  const fallbackBounds = moveAnnotationBoundsY(
    preferredBounds,
    rowDirection * fallbackOffset * rowGap,
  );

  const fallbackPlacement = {
    ...fallbackBounds,
    row: fallbackRow,
    side: direction,
  };

  placements.push(fallbackPlacement);
  return fallbackPlacement;
}

function getSystemVoiceEventLayoutBounds(
  eventLayouts: Record<string, RenderedEventLayout>,
  score: Score,
  staffId: string,
  systemIndex: number,
  voiceIndex: number,
) {
  return combineAnnotationBounds(
    Object.values(eventLayouts)
      .filter(
        (layout) =>
          layout.staffId === staffId &&
          layout.voiceIndex === voiceIndex &&
          getSystemIndex(layout.measureIndex, score) === systemIndex &&
          !layout.isGeneratedRest,
      )
      .map((layout) => ({
        maxX:
          layout.pitchLayouts.length > 0
            ? Math.max(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.maxX))
            : layout.maxX,
        maxY:
          layout.pitchLayouts.length > 0
            ? Math.max(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.y)) +
              NOTEHEAD_ANNOTATION_INK_PADDING
            : layout.maxY,
        minX:
          layout.pitchLayouts.length > 0
            ? Math.min(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.minX))
            : layout.minX,
        minY:
          layout.pitchLayouts.length > 0
            ? Math.min(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.y)) -
              NOTEHEAD_ANNOTATION_INK_PADDING
            : layout.minY,
      })),
  );
}

function getAnnotationRowCount(placements: AnnotationPlacement[]) {
  return placements.length === 0
    ? 0
    : Math.max(...placements.map((placement) => placement.row)) + 1;
}

function getAutomaticAnnotationSide(
  event: ScoreEvent,
  kind: AnnotationKind,
  aboveStaffPlacements: AnnotationPlacement[],
  belowStaffPlacements: AnnotationPlacement[],
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

  const belowRows = getAnnotationRowCount(belowStaffPlacements);
  const aboveRows = getAnnotationRowCount(aboveStaffPlacements);

  return belowRows >= MAX_AUTO_BELOW_ANNOTATION_ROWS && belowRows > aboveRows
    ? 'above'
    : 'below';
}

function getAnnotationY({
  aboveStaffBaseline,
  belowStaffBaseline,
  kind,
  layout,
  side,
  staffTop,
}: {
  aboveStaffBaseline: number;
  belowStaffBaseline: number;
  kind: AnnotationKind;
  layout: RenderedEventLayout;
  side: AnnotationSide;
  staffTop: number;
}) {
  if (side === 'below') {
    return belowStaffBaseline;
  }

  if (kind === 'fermata') {
    return Math.max(
      staffTop + ABOVE_STAFF_FAR_BASELINE_OFFSET,
      Math.min(staffTop - 30, layout.minY - 18),
    );
  }

  if (kind === 'dynamic' || kind === 'lyric' || kind === 'pedal') {
    return staffTop + ABOVE_STAFF_CLOSE_BASELINE_OFFSET;
  }

  return aboveStaffBaseline;
}

function createRenderedAnnotationLayout({
  eventId,
  kind,
  measureIndex,
  placement,
  staffId,
  text,
  x,
}: {
  eventId: string;
  kind: AnnotationKind;
  measureIndex: number;
  placement: AnnotationPlacement;
  staffId: string;
  text: string;
  x: number;
}): RenderedAnnotationLayout {
  return {
    eventId,
    id: `${eventId}:${kind}`,
    kind,
    maxX: placement.maxX,
    maxY: placement.maxY,
    measureIndex,
    minX: placement.minX,
    minY: placement.minY,
    row: placement.row,
    side: placement.side,
    staffId,
    text,
    x,
    y: placement.maxY - ANNOTATION_METRICS[kind].descent,
  };
}

export function drawTextAnnotations(
  container: HTMLDivElement,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
) {
  const svg = container.querySelector('svg');
  const annotationLayouts: RenderedAnnotationLayout[] = [];

  if (!svg) {
    return annotationLayouts;
  }

  svg
    .querySelectorAll(
      [
        '.sheetlab-chord-symbol',
        '.sheetlab-lyric',
        '.sheetlab-section-marker',
        '.sheetlab-dynamic',
        '.sheetlab-fermata',
        '.sheetlab-pedal',
        '.sheetlab-glissando',
      ].join(', '),
    )
    .forEach((element) => element.remove());

  const staves = score.parts[0]?.staves ?? [];

  staves.forEach((staff, staffIndex) => {
    const systemIndexes = [
      ...new Set(
        staff.measures.map((measure) => getSystemIndex(measure.index, score)),
      ),
    ];

    systemIndexes.forEach((systemIndex) => {
      const systemMeasures = staff.measures.filter(
        (measure) => getSystemIndex(measure.index, score) === systemIndex,
      );
      const systemFirstMeasureIndex =
        getScoreSystemMeasureIndexes(score, systemIndex)[0] ?? 0;
      const staffTop = getScoreStaffTop(score, staffIndex, systemFirstMeasureIndex);
      const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
      const aboveStaffPlacements: AnnotationPlacement[] = [];
      const belowStaffPlacements: AnnotationPlacement[] = [];

      systemMeasures.forEach((measure) => {
        if (staffIndex === 0 && measure.sectionMarker) {
          const markerX = getMeasureContentLeft(measure.index, score) + 12;
          const markerY = staffTop - 42;
          const markerWidth = Math.max(34, measure.sectionMarker.length * 8 + 18);
          const markerGroup = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'g',
          );
          const markerRect = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'rect',
          );

          markerGroup.classList.add('sheetlab-section-marker');
          markerGroup.setAttribute('data-testid', 'rendered-section-marker');
          markerGroup.setAttribute('data-measure-index', String(measure.index));
          aboveStaffPlacements.push({
            ...getAnnotationBounds({
              kind: 'sectionMarker',
              text: measure.sectionMarker,
              x: markerX,
              y: markerY,
            }),
            row: 0,
            side: 'above',
          });
          markerRect.setAttribute('x', (markerX - 9).toFixed(2));
          markerRect.setAttribute('y', (markerY - 15).toFixed(2));
          markerRect.setAttribute('width', markerWidth.toFixed(2));
          markerRect.setAttribute('height', '20');
          markerRect.setAttribute('rx', '3');
          markerGroup.appendChild(markerRect);
          markerGroup.appendChild(
            appendSvgText({
              className: 'sheetlab-section-marker-text',
              svg,
              text: measure.sectionMarker,
              x: markerX,
              y: markerY,
            }),
          );
          svg.appendChild(markerGroup);
        }
      });

      systemMeasures.forEach((measure) => {
        measure.voices.forEach((voice, voiceIndex) => {
          const voiceInkBounds = getSystemVoiceEventLayoutBounds(
            eventLayouts,
            score,
            staff.id,
            systemIndex,
            voiceIndex,
          );
          const belowStaffBaseline = Math.max(
            staffBottom,
            voiceInkBounds?.maxY ?? staffBottom,
          ) +
            BELOW_STAFF_INK_GAP +
            ANNOTATION_METRICS.lyric.height;
          const aboveStaffBaseline = Math.max(
            staffTop + ABOVE_STAFF_FAR_BASELINE_OFFSET,
            Math.min(
              staffTop + ABOVE_STAFF_CLOSE_BASELINE_OFFSET,
              (voiceInkBounds?.minY ?? staffTop) -
                ABOVE_STAFF_INK_GAP -
                ANNOTATION_METRICS.chordSymbol.descent,
            ),
          );
          const sortedEvents = [...voice.events].sort((a, b) => a.beat - b.beat);

          sortedEvents.forEach((event, eventIndex) => {
            const layout = eventLayouts[event.id];

            if (!layout || isGeneratedRestEvent(event)) {
              return;
            }

            const drawEventAnnotation = ({
              className,
              kind,
              testId,
              text,
            }: {
              className: string;
              kind: AnnotationKind;
              testId: string;
              text: string;
            }) => {
              const side = getAutomaticAnnotationSide(
                event,
                kind,
                aboveStaffPlacements,
                belowStaffPlacements,
              );
              const placement = placeAnnotationInRows({
                direction: side,
                placements:
                  side === 'below' ? belowStaffPlacements : aboveStaffPlacements,
                preferredBounds: getAnnotationBounds({
                  kind,
                  text,
                  x: layout.x,
                  y: getAnnotationY({
                    aboveStaffBaseline,
                    belowStaffBaseline,
                    kind,
                    layout,
                    side,
                    staffTop,
                  }),
                }),
              });
              const renderedAnnotationLayout = createRenderedAnnotationLayout({
                eventId: event.id,
                kind,
                measureIndex: measure.index,
                placement,
                staffId: staff.id,
                text,
                x: layout.x,
              });

              annotationLayouts.push(renderedAnnotationLayout);
              appendSvgText({
                className,
                dataset: {
                  'data-annotation-kind': kind,
                  'data-annotation-row': String(placement.row),
                  'data-annotation-side': side,
                  'data-event-id': event.id,
                  'data-testid': testId,
                },
                svg,
                text,
                x: layout.x,
                y: renderedAnnotationLayout.y,
              });
            };

            if (event.chordSymbol) {
              drawEventAnnotation({
                className: 'sheetlab-chord-symbol',
                kind: 'chordSymbol',
                testId: 'rendered-chord-symbol',
                text: event.chordSymbol,
              });
            }

            if (event.lyric) {
              drawEventAnnotation({
                className: 'sheetlab-lyric',
                kind: 'lyric',
                testId: 'rendered-lyric',
                text: event.lyric,
              });
            }

            if (event.dynamic) {
              drawEventAnnotation({
                className: 'sheetlab-dynamic',
                kind: 'dynamic',
                testId: 'rendered-dynamic',
                text: event.dynamic,
              });
            }

            if (event.fermata) {
              drawEventAnnotation({
                className: 'sheetlab-fermata',
                kind: 'fermata',
                testId: 'rendered-fermata',
                text: FERMATA_SYMBOL,
              });
            }

            if (event.pedal) {
              drawEventAnnotation({
                className: 'sheetlab-pedal',
                kind: 'pedal',
                testId: 'rendered-pedal',
                text: PEDAL_MARK_TEXT[event.pedal],
              });
            }

            if (event.glissando) {
              const nextEvent = sortedEvents
                .slice(eventIndex + 1)
                .find((candidate) => !isGeneratedRestEvent(candidate));
              const nextLayout = nextEvent ? eventLayouts[nextEvent.id] : null;

              if (nextLayout) {
                const glissando = document.createElementNS(
                  'http://www.w3.org/2000/svg',
                  'line',
                );

                glissando.classList.add('sheetlab-glissando');
                glissando.setAttribute('data-event-id', event.id);
                glissando.setAttribute('data-testid', 'rendered-glissando');
                glissando.setAttribute('x1', (layout.x + 12).toFixed(2));
                glissando.setAttribute('y1', layout.y.toFixed(2));
                glissando.setAttribute('x2', (nextLayout.x - 12).toFixed(2));
                glissando.setAttribute('y2', nextLayout.y.toFixed(2));
                svg.appendChild(glissando);
              }
            }
          });
        });
      });
    });
  });

  return annotationLayouts;
}
