import type {
  AnnotationKind,
  Score,
} from '../../domain/score/types';
import { isGeneratedRestEvent } from '../../domain/score/events';
import {
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
  ABOVE_STAFF_INK_GAP,
  BELOW_STAFF_INK_GAP,
  type AnnotationBounds,
  type AnnotationPlacement,
  type AnnotationSide,
  getAnnotationBounds,
  getAutomaticAnnotationSide,
  getEventAnnotationText,
  placeAnnotationInRows,
} from './annotationLayoutPolicy';
import {
  getRenderedSystemVoiceBounds,
  getRenderedSystemVoiceEventInkBounds,
} from './renderedVoiceZones';

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

function getAnnotationY({
  kind,
  side,
  voiceBounds,
}: {
  kind: AnnotationKind;
  side: AnnotationSide;
  voiceBounds: { maxY: number; minY: number };
}) {
  const metrics = ANNOTATION_METRICS[kind];

  if (side === 'below') {
    return voiceBounds.maxY + BELOW_STAFF_INK_GAP + metrics.height;
  }

  return voiceBounds.minY - ABOVE_STAFF_INK_GAP - metrics.descent;
}

function createRenderedAnnotationLayout({
  eventId,
  kind,
  measureIndex,
  placement,
  staffId,
  text,
  voiceIndex,
  x,
}: {
  eventId: string;
  kind: AnnotationKind;
  measureIndex: number;
  placement: AnnotationPlacement;
  staffId: string;
  text: string;
  voiceIndex: number;
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
    voiceIndex,
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
      const systemAnnotationPlacements: AnnotationPlacement[] = [];
      const voiceStates = new Map<
        number,
        {
          abovePlacements: AnnotationPlacement[];
          belowPlacements: AnnotationPlacement[];
          voiceBounds: { maxY: number; minY: number };
        }
      >();
      const staffInkBlockers = getRenderedSystemVoiceEventInkBounds(
        eventLayouts,
        score,
        staff.id,
        systemIndex,
      );
      const getVoiceState = (voiceIndex: number) => {
        const existingState = voiceStates.get(voiceIndex);

        if (existingState) {
          return existingState;
        }

        const nextState = {
          abovePlacements: [],
          belowPlacements: [],
          voiceBounds: getRenderedSystemVoiceBounds({
            eventLayouts,
            measureIndex: systemFirstMeasureIndex,
            score,
            staffId: staff.id,
            staffIndex,
            systemIndex,
            voiceIndex,
          }),
        };

        voiceStates.set(voiceIndex, nextState);
        return nextState;
      };

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
          systemAnnotationPlacements.push({
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
          const voiceState = getVoiceState(voiceIndex);
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
                voiceState.abovePlacements,
                voiceState.belowPlacements,
              );
              const placement = placeAnnotationInRows({
                blockers: [
                  ...staffInkBlockers,
                  ...systemAnnotationPlacements,
                ],
                direction: side,
                placements:
                  side === 'below'
                    ? voiceState.belowPlacements
                    : voiceState.abovePlacements,
                preferredBounds: getAnnotationBounds({
                  kind,
                  text,
                  x: layout.x,
                  y: getAnnotationY({
                    kind,
                    side,
                    voiceBounds: voiceState.voiceBounds,
                  }),
                }),
              });
              systemAnnotationPlacements.push(placement);
              const renderedAnnotationLayout = createRenderedAnnotationLayout({
                eventId: event.id,
                kind,
                measureIndex: measure.index,
                placement,
                staffId: staff.id,
                text,
                voiceIndex,
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
                  'data-voice-index': String(voiceIndex),
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
