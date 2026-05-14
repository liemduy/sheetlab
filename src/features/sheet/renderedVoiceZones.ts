import type { Score } from '../../domain/score/types';
import { getActiveClef } from '../../domain/score/clefChanges';
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
  type AnnotationBounds,
  combineAnnotationBounds,
} from './annotationLayoutPolicy';
import { getClefInkBounds } from './staffSymbolInk';

const INTER_VOICE_ZONE_GAP = 18;
const VOICE_NOTEHEAD_INK_PADDING = 16;

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
              VOICE_NOTEHEAD_INK_PADDING,
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
              VOICE_NOTEHEAD_INK_PADDING,
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

export function getRenderedSystemStaffSymbolInkBounds(
  score: Score,
  staffIndex: number,
  systemIndex: number,
) {
  const staff = score.parts[0]?.staves[staffIndex];
  const firstMeasureIndex =
    getScoreSystemMeasureIndexes(score, systemIndex)[0] ?? 0;

  if (!staff) {
    return [];
  }

  return [
    getClefInkBounds({
      clef: getActiveClef(score, staff.id, firstMeasureIndex, 0),
      measureX: getMeasureX(firstMeasureIndex, score),
      staffTop: getScoreStaffTop(score, staffIndex, firstMeasureIndex),
    }),
  ];
}

function getDefaultVoiceBounds(score: Score, staffIndex: number, measureIndex: number) {
  const staffTop = getScoreStaffTop(score, staffIndex, measureIndex);

  return {
    maxX: 0,
    maxY: staffTop + STAFF_LINE_SPACING * 4,
    minX: 0,
    minY: staffTop,
  };
}

function getVoiceCenter(zone: RenderedVoiceZoneLayout) {
  return (zone.voice.minY + zone.voice.maxY) / 2;
}

function clampInterVoiceAnnotationZones(
  zones: RenderedVoiceZoneLayout[],
): RenderedVoiceZoneLayout[] {
  if (zones.length < 2) {
    return zones;
  }

  const sortedZones = [...zones].sort((first, second) =>
    getVoiceCenter(first) - getVoiceCenter(second),
  );
  const limits = new Map<
    string,
    {
      aboveMinY: number;
      belowMaxY: number;
    }
  >(
    zones.map((zone) => [
      zone.id,
      {
        aboveMinY: Number.NEGATIVE_INFINITY,
        belowMaxY: Number.POSITIVE_INFINITY,
      },
    ]),
  );

  sortedZones.slice(0, -1).forEach((upperZone, index) => {
    const lowerZone = sortedZones[index + 1];

    if (!lowerZone) {
      return;
    }

    const upperBottom = upperZone.voice.maxY;
    const lowerTop = lowerZone.voice.minY;
    const divider =
      lowerTop > upperBottom
        ? (upperBottom + lowerTop) / 2
        : (getVoiceCenter(upperZone) + getVoiceCenter(lowerZone)) / 2;
    const upperLimit = divider - INTER_VOICE_ZONE_GAP / 2;
    const lowerLimit = divider + INTER_VOICE_ZONE_GAP / 2;
    const upperLimits = limits.get(upperZone.id);
    const lowerLimits = limits.get(lowerZone.id);

    if (upperLimits) {
      upperLimits.belowMaxY = Math.min(upperLimits.belowMaxY, upperLimit);
    }

    if (lowerLimits) {
      lowerLimits.aboveMinY = Math.max(lowerLimits.aboveMinY, lowerLimit);
    }
  });

  return zones.map((zone) => {
    const zoneLimits = limits.get(zone.id);

    if (!zoneLimits) {
      return zone;
    }

    return {
      ...zone,
      above: {
        ...zone.above,
        minY: Math.min(
          zone.above.maxY,
          Math.max(zone.above.minY, zoneLimits.aboveMinY),
        ),
      },
      below: {
        ...zone.below,
        maxY: Math.max(
          zone.below.minY,
          Math.min(zone.below.maxY, zoneLimits.belowMaxY),
        ),
      },
    };
  });
}

export function getRenderedSystemVoiceBounds({
  eventLayouts,
  measureIndex,
  score,
  staffId,
  staffIndex,
  systemIndex,
  voiceIndex,
  includeStaffSymbols = true,
  includeStaffBounds = false,
}: {
  eventLayouts: Record<string, RenderedEventLayout>;
  includeStaffBounds?: boolean;
  includeStaffSymbols?: boolean;
  measureIndex: number;
  score: Score;
  staffId: string;
  staffIndex: number;
  systemIndex: number;
  voiceIndex: number;
}) {
  const eventInkBounds = getRenderedSystemVoiceEventInkBounds(
    eventLayouts,
    score,
    staffId,
    systemIndex,
    voiceIndex,
  );
  const staffSymbolInkBounds = includeStaffSymbols
    ? getRenderedSystemStaffSymbolInkBounds(score, staffIndex, systemIndex)
    : [];
  const staffBounds = includeStaffBounds
    ? [getDefaultVoiceBounds(score, staffIndex, measureIndex)]
    : [];
  const voiceBounds = combineAnnotationBounds(
    [...staffBounds, ...eventInkBounds, ...staffSymbolInkBounds],
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

      const rawZones = Array.from({ length: maxVoiceCount }, (_, voiceIndex) => {
        const voice = getRenderedSystemVoiceBounds({
          eventLayouts,
          includeStaffBounds: maxVoiceCount === 1,
          includeStaffSymbols: maxVoiceCount === 1,
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
        const aboveGuideY = voice.minY;
        const belowGuideY = voice.maxY;
        const hasAboveContent = aboveAnnotations.length > 0;
        const hasBelowContent = belowAnnotations.length > 0;
        const aboveMinY = hasAboveContent
          ? Math.min(...aboveAnnotations.map((layout) => layout.minY))
          : aboveGuideY;
        const belowMaxY = hasBelowContent
          ? Math.max(...belowAnnotations.map((layout) => layout.maxY))
          : belowGuideY;

        return {
          above: {
            hasContent: hasAboveContent,
            maxY: aboveGuideY,
            minY: aboveMinY,
          },
          below: {
            hasContent: hasBelowContent,
            maxY: belowMaxY,
            minY: belowGuideY,
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

      return clampInterVoiceAnnotationZones(rawZones);
    });
  });
}
