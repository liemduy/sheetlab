import type { MouseEvent } from 'react';
import type { Score } from '../../domain/score/types';
import { getLyricMapEventIds } from '../../domain/score/lyricMapping';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';

export interface LyricMapDragAnchor {
  anchorX: number;
  anchorY: number;
  eventId: string;
}

export function getClosestPitchedEventId(
  point: { x: number; y: number },
  eventLayouts: Record<string, RenderedEventLayout>,
) {
  let closestEventId: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  Object.entries(eventLayouts).forEach(([eventId, layout]) => {
    if (layout.isGeneratedRest || layout.pitchLayouts.length === 0) {
      return;
    }

    layout.pitchLayouts.forEach((pitchLayout) => {
      const distance = Math.hypot(point.x - pitchLayout.x, point.y - pitchLayout.y);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestEventId = eventId;
      }
    });
  });

  return closestDistance <= 36 ? closestEventId : null;
}

function getLyricMapAnchor(layout: RenderedEventLayout) {
  const pitchLayout =
    layout.pitchLayouts.length > 0
      ? layout.pitchLayouts.reduce((lowest, candidate) =>
          candidate.y > lowest.y ? candidate : lowest,
        )
      : undefined;

  return {
    x: pitchLayout?.x ?? layout.x,
    y: (pitchLayout?.y ?? layout.y) + 9,
  };
}

export function LyricMapConnectors({
  annotationLayouts,
  eventLayouts,
  onStartDrag,
  score,
  show,
}: {
  annotationLayouts: RenderedAnnotationLayout[];
  eventLayouts: Record<string, RenderedEventLayout>;
  onStartDrag?: (drag: LyricMapDragAnchor) => void;
  score: Score;
  show: boolean;
}) {
  if (!show) {
    return null;
  }

  return (
    <g aria-hidden="true" className="lyric-map-layer">
      {annotationLayouts
        .filter((layout) => layout.kind === 'lyric')
        .map((layout) => {
          const targetEventIds = getLyricMapEventIds(score, layout.eventId);
          const targets = targetEventIds
            .map((targetEventId) => eventLayouts[targetEventId])
            .filter((targetLayout): targetLayout is RenderedEventLayout =>
              Boolean(targetLayout),
            )
            .map(getLyricMapAnchor);

          if (targets.length === 0) {
            return null;
          }

          const lyricAnchorY =
            layout.side === 'below' ? layout.minY - 3 : layout.maxY + 3;
          const handleStartDrag = (event: MouseEvent<SVGElement>) => {
            if (!onStartDrag) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onStartDrag({
              anchorX: layout.x,
              anchorY: lyricAnchorY,
              eventId: layout.eventId,
            });
          };

          if (targets.length === 1) {
            const target = targets[0];

            return target ? (
              <g key={layout.id}>
                <line
                  className="lyric-map-connector"
                  data-event-id={layout.eventId}
                  data-target-event-ids={targetEventIds.join(' ')}
                  data-testid="lyric-map-connector"
                  x1={layout.x}
                  x2={target.x}
                  y1={lyricAnchorY}
                  y2={target.y}
                />
                <line
                  className="lyric-map-hit-target"
                  x1={layout.x}
                  x2={target.x}
                  y1={lyricAnchorY}
                  y2={target.y}
                  onMouseDown={handleStartDrag}
                />
              </g>
            ) : null;
          }

          const sortedTargets = [...targets].sort((a, b) => a.x - b.x);
          const firstTarget = sortedTargets[0];
          const lastTarget = sortedTargets[sortedTargets.length - 1];

          if (!firstTarget || !lastTarget) {
            return null;
          }

          const bridgeY =
            layout.side === 'below' ? layout.minY - 12 : layout.maxY + 12;
          const pathData = [
            `M ${layout.x} ${lyricAnchorY} L ${layout.x} ${bridgeY}`,
            `M ${firstTarget.x} ${bridgeY} L ${lastTarget.x} ${bridgeY}`,
            ...sortedTargets.map(
              (target) => `M ${target.x} ${bridgeY} L ${target.x} ${target.y}`,
            ),
          ].join(' ');

          return (
            <g key={layout.id}>
              <path
                className="lyric-map-connector"
                d={pathData}
                data-event-id={layout.eventId}
                data-target-event-ids={targetEventIds.join(' ')}
                data-testid="lyric-map-connector"
              />
              <path
                className="lyric-map-hit-target"
                d={pathData}
                onMouseDown={handleStartDrag}
              />
            </g>
          );
        })}
    </g>
  );
}

export function LyricMapPreview({
  dragState,
}: {
  dragState: (LyricMapDragAnchor & {
    previewPoint: { x: number; y: number } | null;
  }) | null;
}) {
  return dragState?.previewPoint ? (
    <line
      className="lyric-map-connector lyric-map-preview"
      data-testid="lyric-map-preview"
      x1={dragState.anchorX}
      x2={dragState.previewPoint.x}
      y1={dragState.anchorY}
      y2={dragState.previewPoint.y}
    />
  ) : null;
}
