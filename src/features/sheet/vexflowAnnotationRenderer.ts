import type {
  AnnotationKind,
  PedalMark,
  Score,
  Staff,
} from '../../domain/score/types';
import { getEventAnnotationOffset } from '../../domain/score/annotationOffsets';
import { isGeneratedRestEvent } from '../../domain/score/events';
import { getLyricMapEventIds } from '../../domain/score/lyricMapping';
import {
  getMeasureContentLeft,
  getMeasureX,
  getScoreStaffTop,
  getScoreSystemMeasureIndexes,
  getSystemIndex,
  STAFF_LINE_SPACING,
} from './layout';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';
import {
  ANNOTATION_METRICS,
  NOTEHEAD_ANNOTATION_INK_PADDING,
  type AnnotationBounds,
  type AnnotationPlacement,
  type AnnotationSide,
  getAnnotationBaseline,
  createManualAnnotationPlacement,
  doAnnotationBoundsOverlap,
  getAnnotationBounds,
  getAutomaticAnnotationSide,
  getEventAnnotationText,
  hasManualAnnotationLayout,
  insetAnnotationBounds,
  keepAnnotationPlacementOutsideStaff,
  placeAnnotationInRows,
  resolveAnnotationPlacementCollisions,
} from './annotationLayoutPolicy';
import {
  getRenderedEventInkBounds,
  getRenderedSystemStaffSymbolInkBounds,
} from './renderedVoiceZones';
import {
  getPedalGlyphParts,
  getPedalMarkLabel,
} from './pedalMarks';

const TEMPO_QUARTER_NOTE_SYMBOL = String.fromCodePoint(0x1d15f);

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

function appendSvgPedalMark({
  dataset,
  mark,
  svg,
  x,
  y,
}: {
  dataset?: Record<string, string>;
  mark: PedalMark;
  svg: SVGSVGElement;
  x: number;
  y: number;
}) {
  const textElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'text',
  );

  textElement.classList.add('sheetlab-pedal');
  textElement.setAttribute('aria-label', getPedalMarkLabel(mark));
  textElement.setAttribute('data-pedal-mark', mark);
  textElement.setAttribute('x', x.toFixed(2));
  textElement.setAttribute('y', y.toFixed(2));

  Object.entries(dataset ?? {}).forEach(([key, value]) => {
    textElement.setAttribute(key, value);
  });

  getPedalGlyphParts(mark).forEach((part) => {
    const tspan = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'tspan',
    );

    tspan.classList.add('sheetlab-pedal-glyph', `sheetlab-pedal-${part.part}`);
    tspan.setAttribute('x', (x + part.xOffset).toFixed(2));
    tspan.setAttribute('y', y.toFixed(2));
    tspan.textContent = part.glyph;
    textElement.appendChild(tspan);
  });

  svg.appendChild(textElement);

  return textElement;
}

function getRenderedEventAnnotationAnchorBounds(
  layout: RenderedEventLayout,
): { maxY: number; minY: number } {
  const renderedInkBounds = getRenderedEventInkBounds(layout);

  if (layout.pitchLayouts.length === 0) {
    return renderedInkBounds;
  }

  const pitchYs = layout.pitchLayouts.map((pitchLayout) => pitchLayout.y);

  return {
    maxY: Math.max(
      renderedInkBounds.maxY,
      Math.max(...pitchYs) + NOTEHEAD_ANNOTATION_INK_PADDING,
    ),
    minY: Math.min(
      renderedInkBounds.minY,
      Math.min(...pitchYs) - NOTEHEAD_ANNOTATION_INK_PADDING,
    ),
  };
}

function getLyricAnnotationX({
  eventId,
  eventLayouts,
  fallbackX,
  score,
  systemIndex,
}: {
  eventId: string;
  eventLayouts: Record<string, RenderedEventLayout>;
  fallbackX: number;
  score: Score;
  systemIndex: number;
}) {
  const mappedLayouts = getLyricMapEventIds(score, eventId)
    .map((targetEventId) => eventLayouts[targetEventId])
    .filter(
      (targetLayout): targetLayout is RenderedEventLayout =>
        Boolean(targetLayout) &&
        getSystemIndex(targetLayout.measureIndex, score) === systemIndex,
    );

  if (mappedLayouts.length === 0) {
    return fallbackX;
  }

  return (
    (Math.min(...mappedLayouts.map((targetLayout) => targetLayout.x)) +
      Math.max(...mappedLayouts.map((targetLayout) => targetLayout.x))) /
    2
  );
}

function createRenderedAnnotationLayout({
  eventId,
  kind,
  measureIndex,
  offsetX,
  offsetY,
  placement,
  staffId,
  text,
  voiceIndex,
  x,
}: {
  eventId: string;
  kind: AnnotationKind;
  measureIndex: number;
  offsetX: number;
  offsetY: number;
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
    offsetX,
    offsetY,
    row: placement.row,
    side: placement.side,
    staffId,
    text,
    voiceIndex,
    x,
    y: placement.maxY - ANNOTATION_METRICS[kind].descent,
  };
}

function moveAnnotationPlacement(
  placement: AnnotationPlacement,
  offset: { x: number; y: number },
): AnnotationPlacement {
  return {
    ...placement,
    maxX: placement.maxX + offset.x,
    maxY: placement.maxY + offset.y,
    minX: placement.minX + offset.x,
    minY: placement.minY + offset.y,
  };
}

function getSectionMarkerPlacementAvoidingBlockers({
  blockers,
  text,
  x,
  y,
}: {
  blockers: AnnotationBounds[];
  text: string;
  x: number;
  y: number;
}): AnnotationPlacement {
  let markerY = y;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const bounds = getAnnotationBounds({
      kind: 'sectionMarker',
      text,
      x,
      y: markerY,
    });

    if (!blockers.some((blocker) => doAnnotationBoundsOverlap(bounds, blocker))) {
      return {
        ...bounds,
        row: attempt,
        side: 'above',
      };
    }

    markerY -= ANNOTATION_METRICS.sectionMarker.height + 6;
  }

  return {
    ...getAnnotationBounds({
      kind: 'sectionMarker',
      text,
      x,
      y: markerY,
    }),
    row: 4,
    side: 'above',
  };
}

function measureHasKeySignatureChange(
  staves: Staff[],
  measureIndex: number,
) {
  return staves.some((systemStaff) => {
    const systemMeasure = systemStaff.measures.find(
      (candidate) => candidate.index === measureIndex,
    );

    return Boolean(
      systemMeasure?.keySignature ||
        systemMeasure?.keySignatureSymbols?.length,
    );
  });
}

function getSectionMarkerDesiredY({
  hasMeasureKeySignature,
  isSystemFirstMeasure,
  staffTop,
  systemIndex,
}: {
  hasMeasureKeySignature: boolean;
  isSystemFirstMeasure: boolean;
  staffTop: number;
  systemIndex: number;
}) {
  if (hasMeasureKeySignature && systemIndex > 0) {
    return staffTop - 82;
  }

  return isSystemFirstMeasure ? staffTop - 56 : staffTop - 42;
}

function getScoreTempoMarkText(score: Score) {
  return score.importedLayout
    ? `${TEMPO_QUARTER_NOTE_SYMBOL}=${Math.round(score.tempo)}`
    : `Moderato \u2669 = ${Math.round(score.tempo)}`;
}

export function drawTextAnnotations(
  container: HTMLDivElement,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
  visibleMeasureIndexes?: ReadonlySet<number> | null,
  showMeasureNumbers = false,
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
        '.sheetlab-tempo-mark',
        '.sheetlab-dynamic',
        '.sheetlab-fermata',
        '.sheetlab-measure-number',
        '.sheetlab-pedal',
      ].join(', '),
    )
    .forEach((element) => element.remove());

  const staves = score.parts[0]?.staves ?? [];

  staves.forEach((staff, staffIndex) => {
    const visibleMeasures = visibleMeasureIndexes
      ? staff.measures.filter((measure) =>
          visibleMeasureIndexes.has(measure.index),
        )
      : staff.measures;
    const systemIndexes = [
      ...new Set(
        visibleMeasures.map((measure) =>
          getSystemIndex(measure.index, score),
        ),
      ),
    ];

    systemIndexes.forEach((systemIndex) => {
      const systemMeasures = visibleMeasures.filter(
        (measure) => getSystemIndex(measure.index, score) === systemIndex,
      );
      const systemFirstMeasureIndex =
        getScoreSystemMeasureIndexes(score, systemIndex)[0] ?? 0;
      const staffTop = getScoreStaffTop(score, staffIndex, systemFirstMeasureIndex);
      const staffBounds = {
        maxY: staffTop + STAFF_LINE_SPACING * 4,
        minY: staffTop,
      };
      const systemAnnotationPlacements: AnnotationPlacement[] = [];
      const voiceStates = new Map<
        number,
        {
          abovePlacements: AnnotationPlacement[];
          belowPlacements: AnnotationPlacement[];
        }
      >();
      const systemInkBlockers = Object.entries(eventLayouts).flatMap(
        ([eventId, eventLayout]) =>
          getSystemIndex(eventLayout.measureIndex, score) === systemIndex &&
          !eventLayout.isGeneratedRest
            ? [{ bounds: getRenderedEventInkBounds(eventLayout), eventId }]
            : [],
      );
      const staffInkBlockers = Object.entries(eventLayouts).flatMap(
        ([eventId, eventLayout]) =>
          eventLayout.staffId === staff.id &&
          getSystemIndex(eventLayout.measureIndex, score) === systemIndex &&
          !eventLayout.isGeneratedRest
            ? [{ bounds: getRenderedEventInkBounds(eventLayout), eventId }]
            : [],
      );
      const staffSymbolInkBlockers = getRenderedSystemStaffSymbolInkBounds(
        score,
        staffIndex,
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
        };

        voiceStates.set(voiceIndex, nextState);
        return nextState;
      };

      if (staffIndex === 0 && systemIndex === 0) {
        const tempoX = getMeasureContentLeft(systemFirstMeasureIndex, score) + 12;
        const tempoY = staffTop - 78;
        const tempoText = getScoreTempoMarkText(score);

        systemAnnotationPlacements.push({
          maxX: tempoX + Math.max(78, tempoText.length * 7.4),
          maxY: tempoY + 2,
          minX: tempoX - 3,
          minY: tempoY - 18,
          row: 0,
          side: 'above',
        });
        appendSvgText({
          className: 'sheetlab-tempo-mark',
          dataset: {
            ...(score.importedLayout ? { 'data-imported-tempo': 'true' } : {}),
            'data-testid': 'rendered-tempo-mark',
          },
          svg,
          text: tempoText,
          x: tempoX,
          y: tempoY,
        });
      }

      if (
        staffIndex === 0 &&
        showMeasureNumbers &&
        systemFirstMeasureIndex > 0
      ) {
        const measureNumberText = String(systemFirstMeasureIndex + 1);
        const measureNumberX = getMeasureX(systemFirstMeasureIndex, score) - 24;
        const measureNumberY = staffTop - 18;

        systemAnnotationPlacements.push({
          maxX: measureNumberX + Math.max(16, measureNumberText.length * 8),
          maxY: measureNumberY + 4,
          minX: measureNumberX - 4,
          minY: measureNumberY - 16,
          row: 0,
          side: 'above',
        });
        appendSvgText({
          className: 'sheetlab-measure-number',
          dataset: {
            'data-measure-index': String(systemFirstMeasureIndex),
            'data-testid': 'measure-number',
          },
          svg,
          text: measureNumberText,
          x: measureNumberX,
          y: measureNumberY,
        });
      }

      systemMeasures.forEach((measure) => {
        if (staffIndex === 0 && measure.sectionMarker) {
          const markerX = getMeasureContentLeft(measure.index, score) + 12;
          const desiredMarkerY = getSectionMarkerDesiredY({
            hasMeasureKeySignature: measureHasKeySignatureChange(
              staves,
              measure.index,
            ),
            isSystemFirstMeasure: measure.index === systemFirstMeasureIndex,
            staffTop,
            systemIndex,
          });
          const markerPlacement = getSectionMarkerPlacementAvoidingBlockers({
            blockers: [...staffSymbolInkBlockers, ...systemAnnotationPlacements],
            text: measure.sectionMarker,
            x: markerX,
            y: desiredMarkerY,
          });
          const markerY =
            markerPlacement.maxY - ANNOTATION_METRICS.sectionMarker.descent;
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
          systemAnnotationPlacements.push(markerPlacement);
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

          sortedEvents.forEach((event) => {
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
              const annotationX =
                kind === 'lyric'
                  ? getLyricAnnotationX({
                      eventId: event.id,
                      eventLayouts,
                      fallbackX: layout.x,
                      score,
                      systemIndex,
                    })
                  : layout.x;
              const automaticSide = getAutomaticAnnotationSide(
                event,
                kind,
                voiceState.abovePlacements,
                voiceState.belowPlacements,
              );
              const side =
                kind === 'pedal' &&
                score.type === 'grand' &&
                event.annotationPlacements?.pedal !== 'above'
                  ? 'below'
                  : automaticSide;
              const grandPedalStaffIndex =
                kind === 'pedal' && score.type === 'grand' && side === 'below'
                  ? Math.max(0, staves.length - 1)
                  : staffIndex;
              const annotationStaffTop = getScoreStaffTop(
                score,
                grandPedalStaffIndex,
                systemFirstMeasureIndex,
              );
              const annotationStaffBounds = {
                maxY: annotationStaffTop + STAFF_LINE_SPACING * 4,
                minY: annotationStaffTop,
              };
              const sidePlacements =
                side === 'below'
                  ? voiceState.belowPlacements
                  : voiceState.abovePlacements;
              const offset = getEventAnnotationOffset(event, kind);
              const eventInkBounds = getRenderedEventAnnotationAnchorBounds(layout);
              const preferredBounds = getAnnotationBounds({
                kind,
                text,
                  x: annotationX,
                  y: getAnnotationBaseline({
                    eventInkBounds,
                    kind,
                    side,
                    staffBounds: annotationStaffBounds,
                  }),
                });
              const isManualLayout = hasManualAnnotationLayout(event, kind);
              const inkBlockerSource =
                kind === 'pedal' && score.type === 'grand' && side === 'below'
                  ? systemInkBlockers
                  : staffInkBlockers;
              const annotationStaffSymbolInkBlockers =
                grandPedalStaffIndex === staffIndex
                  ? staffSymbolInkBlockers
                  : getRenderedSystemStaffSymbolInkBounds(
                      score,
                      grandPedalStaffIndex,
                      systemIndex,
                    );
              const otherEventInkBlockers = inkBlockerSource
                .filter((blocker) => blocker.eventId !== event.id)
                .map((blocker) =>
                  insetAnnotationBounds(blocker.bounds, { x: 10, y: 6 }),
                );
              const manualStaffSymbolBlockers =
                annotationStaffSymbolInkBlockers.map((blocker) =>
                  insetAnnotationBounds(blocker, { x: 12, y: 8 }),
                );
              const manualBlockers = [
                ...otherEventInkBlockers,
                ...manualStaffSymbolBlockers,
                ...systemAnnotationPlacements,
              ];
              const autoBlockers = [
                ...otherEventInkBlockers,
                ...annotationStaffSymbolInkBlockers,
                ...systemAnnotationPlacements,
              ];
              const placement = isManualLayout
                ? createManualAnnotationPlacement(preferredBounds, side)
                : placeAnnotationInRows({
                    blockers: autoBlockers,
                    direction: side,
                    placements: sidePlacements,
                    preferredBounds,
                  });
              const shiftedPlacement = keepAnnotationPlacementOutsideStaff(
                moveAnnotationPlacement(placement, offset),
                annotationStaffBounds,
              );
              const renderedPlacement = isManualLayout
                ? keepAnnotationPlacementOutsideStaff(
                    resolveAnnotationPlacementCollisions({
                      blockers: manualBlockers,
                      direction: side,
                      placement: shiftedPlacement,
                    }),
                    annotationStaffBounds,
                  )
                : shiftedPlacement;

              if (isManualLayout) {
                sidePlacements.push(renderedPlacement);
              }
              systemAnnotationPlacements.push(renderedPlacement);

              const renderedAnnotationLayout = createRenderedAnnotationLayout({
                eventId: event.id,
                kind,
                measureIndex: measure.index,
                offsetX: offset.x,
                offsetY: offset.y,
                placement: renderedPlacement,
                staffId: staff.id,
                text,
                voiceIndex,
                x: annotationX + offset.x,
              });

              annotationLayouts.push(renderedAnnotationLayout);
              const dataset = {
                'data-annotation-kind': kind,
                'data-annotation-offset-x': String(offset.x),
                'data-annotation-offset-y': String(offset.y),
                'data-annotation-row': String(renderedPlacement.row),
                'data-annotation-side': side,
                'data-event-id': event.id,
                'data-testid': testId,
                'data-voice-index': String(voiceIndex),
              };

              if (kind === 'pedal' && event.pedal) {
                appendSvgPedalMark({
                  dataset,
                  mark: event.pedal,
                  svg,
                  x: annotationX + offset.x,
                  y: renderedAnnotationLayout.y,
                });
                return;
              }

              appendSvgText({
                className,
                dataset,
                svg,
                text,
                x: annotationX + offset.x,
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
          });
        });
      });
    });
  });

  return annotationLayouts;
}
