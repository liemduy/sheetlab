import type { StaffId } from '../../domain/score/types';
import type { RenderedEventLayout } from './renderedEventLayout';

const BEAT_MATCH_EPSILON = 0.0001;
const MIN_INSERT_TARGET_WIDTH = 34;
const INSERT_TARGET_HORIZONTAL_PADDING = 28;

export interface RenderedEventTarget {
  beat: number;
  distance: number;
  layout: RenderedEventLayout;
}

export function findRenderedEventLayoutAtBeat({
  beat,
  eventLayouts,
  measureIndex,
  staffId,
}: {
  beat: number;
  eventLayouts: Record<string, RenderedEventLayout>;
  measureIndex: number;
  staffId: StaffId;
}) {
  return Object.values(eventLayouts)
    .filter(
      (candidate) =>
        candidate.staffId === staffId &&
        candidate.measureIndex === measureIndex &&
        Math.abs(candidate.beat - beat) <= BEAT_MATCH_EPSILON,
    )
    .sort((first, second) => first.voiceIndex - second.voiceIndex)[0] ?? null;
}

export function findClosestRenderedInsertTarget({
  eventLayouts,
  measureIndex,
  pointerX,
  staffId,
  voiceIndex,
}: {
  eventLayouts: Record<string, RenderedEventLayout>;
  measureIndex: number;
  pointerX: number;
  staffId: StaffId;
  voiceIndex: number;
}): RenderedEventTarget | null {
  return (
    Object.values(eventLayouts)
      .filter(
        (layout) =>
          layout.staffId === staffId &&
          layout.measureIndex === measureIndex &&
          layout.voiceIndex === voiceIndex &&
          layout.kind !== 'rest' &&
          !layout.isGeneratedRest,
      )
      .map((layout) => ({
        beat: layout.beat,
        distance: Math.abs(layout.x - pointerX),
        layout,
      }))
      .filter(({ distance, layout }) => {
        const targetWidth = Math.max(
          MIN_INSERT_TARGET_WIDTH,
          layout.maxX - layout.minX + INSERT_TARGET_HORIZONTAL_PADDING,
        );

        return distance <= targetWidth;
      })
      .sort((first, second) => first.distance - second.distance)[0] ?? null
  );
}
