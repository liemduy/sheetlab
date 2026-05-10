import type { Score } from '../../domain/score/types';
import {
  getMeasureRight,
  getMeasureX,
  getScoreStaffTop,
  getScoreSystemMeasureIndexes,
  getSystemIndex,
} from './layout';
import { STAFF_LINE_SPACING } from './layoutConstants';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
  RenderedVoiceZoneLayout,
} from './renderedEventLayout';
import {
  ANNOTATION_METRICS,
  ABOVE_STAFF_INK_GAP,
  BELOW_STAFF_INK_GAP,
  NOTEHEAD_ANNOTATION_INK_PADDING,
  type AnnotationBounds,
  combineAnnotationBounds,
} from './annotationLayoutPolicy';

export function getRenderedEventInkBounds(
  layout: RenderedEventLayout,
): AnnotationBounds {
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

export function getRenderedSystemVoiceEventInkBounds(
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
    .map(getRenderedEventInkBounds);
}

function getDefaultVoiceBounds(score: Score, staffIndex: number, measureIndex: number) {
  const staffTop = getScoreStaffTop(score, staffIndex, measureIndex);

  return {
    maxY: staffTop + STAFF_LINE_SPACING * 4,
    minY: staffTop,
  };
}

export function getRenderedSystemVoiceBounds({
  eventLayouts,
  measureIndex,
  score,
  staffId,
  staffIndex,
  systemIndex,
  voiceIndex,
}: {
  eventLayouts: Record<string, RenderedEventLayout>;
  measureIndex: number;
  score: Score;
  staffId: string;
  staffIndex: number;
  systemIndex: number;
  voiceIndex: number;
}) {
  const voiceBounds = combineAnnotationBounds(
    getRenderedSystemVoiceEventInkBounds(
      eventLayouts,
      score,
      staffId,
      systemIndex,
      voiceIndex,
    ),
  );

  return voiceBounds ?? getDefaultVoiceBounds(score, staffIndex, measureIndex);
}

export function computeRenderedVoiceZones({
  annotationLayouts,
  eventLayouts,
  score,
}: {
  annotationLayouts: RenderedAnnotationLayout[];
  eventLayouts: Record<string, RenderedEventLayout>;
  score: Score;
}): RenderedVoiceZoneLayout[] {
  const staves = score.parts[0]?.staves ?? [];

  return staves.flatMap((staff, staffIndex) => {
    const systemIndexes = [
      ...new Set(
        staff.measures.map((measure) => getSystemIndex(measure.index, score)),
      ),
    ];

    return systemIndexes.flatMap((systemIndex) => {
      const measureIndexes = getScoreSystemMeasureIndexes(score, systemIndex);
      const firstMeasureIndex = measureIndexes[0] ?? 0;
      const lastMeasureIndex =
        measureIndexes[measureIndexes.length - 1] ?? firstMeasureIndex;
      const minX = getMeasureX(firstMeasureIndex, score);
      const maxX = getMeasureRight(lastMeasureIndex, score);
      const maxVoiceCount = Math.max(
        1,
        ...staff.measures
          .filter((measure) => getSystemIndex(measure.index, score) === systemIndex)
          .map((measure) => measure.voices.length),
      );

      return Array.from({ length: maxVoiceCount }, (_, voiceIndex) => {
        const voice = getRenderedSystemVoiceBounds({
          eventLayouts,
          measureIndex: firstMeasureIndex,
          score,
          staffId: staff.id,
          staffIndex,
          systemIndex,
          voiceIndex,
        });
        const zoneAnnotations = annotationLayouts.filter(
          (layout) =>
            layout.staffId === staff.id &&
            layout.voiceIndex === voiceIndex &&
            getSystemIndex(layout.measureIndex, score) === systemIndex,
        );
        const aboveAnnotations = zoneAnnotations.filter(
          (layout) => layout.side === 'above',
        );
        const belowAnnotations = zoneAnnotations.filter(
          (layout) => layout.side === 'below',
        );
        const aboveMinY =
          aboveAnnotations.length > 0
            ? Math.min(...aboveAnnotations.map((layout) => layout.minY))
            : voice.minY -
              ABOVE_STAFF_INK_GAP -
              ANNOTATION_METRICS.lyric.height;
        const belowMaxY =
          belowAnnotations.length > 0
            ? Math.max(...belowAnnotations.map((layout) => layout.maxY))
            : voice.maxY +
              BELOW_STAFF_INK_GAP +
              ANNOTATION_METRICS.lyric.height;

        return {
          above: {
            maxY: voice.minY - ABOVE_STAFF_INK_GAP,
            minY: aboveMinY,
          },
          below: {
            maxY: belowMaxY,
            minY: voice.maxY + BELOW_STAFF_INK_GAP,
          },
          id: `${staff.id}:${systemIndex}:${voiceIndex}`,
          maxX,
          measureIndexes,
          minX,
          staffId: staff.id,
          staffIndex,
          systemIndex,
          voice,
          voiceIndex,
        };
      });
    });
  });
}
