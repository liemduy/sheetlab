import type {
  AnnotationKind,
  Score,
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
import {
  ANNOTATION_METRICS,
  BELOW_STAFF_INK_GAP,
  NOTEHEAD_ANNOTATION_INK_PADDING,
  type AnnotationBounds,
  type AnnotationPlacement,
  type AnnotationSide,
  combineAnnotationBounds,
  getAboveAnnotationBaseline,
  getAnnotationBounds,
  getAutomaticAnnotationSide,
  getEventAnnotationText,
  placeAnnotationInRows,
} from './annotationLayoutPolicy';

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

function getSystemVoiceEventInkBounds(
  eventLayouts: Record<string, RenderedEventLayout>,
  score: Score,
  staffId: string,
  systemIndex: number,
  voiceIndex?: number,
) {
  return Object.values(eventLayouts)
    .filter(
      (layout) =>
        layout.staffId === staffId &&
        (voiceIndex === undefined || layout.voiceIndex === voiceIndex) &&
        getSystemIndex(layout.measureIndex, score) === systemIndex &&
        !layout.isGeneratedRest,
    )
    .map(getEventInkBounds);
}

function getEventInkBounds(layout: RenderedEventLayout): AnnotationBounds {
  return {
    maxX:
      layout.pitchLayouts.length > 0
        ? Math.max(
            layout.maxX,
            ...layout.pitchLayouts.map((pitchLayout) => pitchLayout.maxX),
          )
        : layout.maxX,
    maxY:
      layout.pitchLayouts.length > 0
        ? Math.max(
            layout.maxY,
            Math.max(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.y)) +
              NOTEHEAD_ANNOTATION_INK_PADDING,
          )
        : layout.maxY,
    minX:
      layout.pitchLayouts.length > 0
        ? Math.min(
            layout.minX,
            ...layout.pitchLayouts.map((pitchLayout) => pitchLayout.minX),
          )
        : layout.minX,
    minY:
      layout.pitchLayouts.length > 0
        ? Math.min(
            layout.minY,
            Math.min(...layout.pitchLayouts.map((pitchLayout) => pitchLayout.y)) -
              NOTEHEAD_ANNOTATION_INK_PADDING,
          )
        : layout.minY,
  };
}

function getSystemVoiceEventLayoutBounds(
  eventLayouts: Record<string, RenderedEventLayout>,
  score: Score,
  staffId: string,
  systemIndex: number,
  voiceIndex: number,
) {
  return combineAnnotationBounds(
    getSystemVoiceEventInkBounds(
      eventLayouts,
      score,
      staffId,
      systemIndex,
      voiceIndex,
    ),
  );
}

function getAnnotationY({
  belowStaffBaseline,
  kind,
  layout,
  side,
  staffTop,
  voiceInkTop,
}: {
  belowStaffBaseline: number;
  kind: AnnotationKind;
  layout: RenderedEventLayout;
  side: AnnotationSide;
  staffTop: number;
  voiceInkTop?: number | null;
}) {
  if (side === 'below') {
    return belowStaffBaseline;
  }

  const aboveBaseline = getAboveAnnotationBaseline({
    eventInkTop: layout.minY,
    kind,
    staffTop,
    voiceInkTop,
  });

  if (kind === 'fermata') {
    return Math.min(
      staffTop - 30,
      layout.minY - 18,
      aboveBaseline,
    );
  }

  return aboveBaseline;
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
      const staffInkBlockers = getSystemVoiceEventInkBounds(
        eventLayouts,
        score,
        staff.id,
        systemIndex,
      );

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
              const localInkBottom = Math.max(
                staffBottom,
                getEventInkBounds(layout).maxY,
              );
              const belowStaffBaseline =
                localInkBottom +
                BELOW_STAFF_INK_GAP +
                ANNOTATION_METRICS.lyric.height;
              const placement = placeAnnotationInRows({
                blockers: staffInkBlockers,
                direction: side,
                placements:
                  side === 'below' ? belowStaffPlacements : aboveStaffPlacements,
                preferredBounds: getAnnotationBounds({
                  kind,
                  text,
                  x: layout.x,
                  y: getAnnotationY({
                    belowStaffBaseline,
                    kind,
                    layout,
                    side,
                    staffTop,
                    voiceInkTop: voiceInkBounds?.minY ?? staffTop,
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
              const text = getEventAnnotationText(event, 'fermata');

              if (!text) {
                return;
              }

              drawEventAnnotation({
                className: 'sheetlab-fermata',
                kind: 'fermata',
                testId: 'rendered-fermata',
                text,
              });
            }

            if (event.pedal) {
              const text = getEventAnnotationText(event, 'pedal');

              if (!text) {
                return;
              }

              drawEventAnnotation({
                className: 'sheetlab-pedal',
                kind: 'pedal',
                testId: 'rendered-pedal',
                text,
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
