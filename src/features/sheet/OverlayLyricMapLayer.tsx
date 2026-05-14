import type { MouseEvent } from 'react';
import type { Score } from '../../domain/score/types';
import { getLyricMapEventIds } from '../../domain/score/lyricMapping';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';
import { getSystemIndex } from './layout';

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
            .map((targetEventId) => ({
              eventId: targetEventId,
              layout: eventLayouts[targetEventId],
            }))
            .filter(
              (
                target,
              ): target is { eventId: string; layout: RenderedEventLayout } =>
                Boolean(target.layout),
            )
            .map((target) => ({
              ...getLyricMapAnchor(target.layout),
              eventId: target.eventId,
              systemIndex: getSystemIndex(target.layout.measureIndex, score),
            }));

          if (targets.length === 0) {
            return null;
          }

          const layoutSystemIndex = getSystemIndex(layout.measureIndex, score);
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

          const renderSingleSystemConnector = (
            connectorTargets: typeof targets,
            keySuffix: string,
          ) => {
            if (connectorTargets.length === 1) {
              const target = connectorTargets[0];

              return target ? (
                <g key={`${layout.id}:${keySuffix}`}>
                  <line
                    className="lyric-map-connector"
                    data-map-cardinality="single"
                    data-event-id={layout.eventId}
                    data-target-event-ids={connectorTargets
                      .map((connectorTarget) => connectorTarget.eventId)
                      .join(' ')}
                    data-testid="lyric-map-connector"
                    x1={layout.x}
                    x2={target.x}
                    y1={lyricAnchorY}
                    y2={target.y}
                  />
                  <circle
                    className="lyric-map-target-dot"
                    data-testid="lyric-map-target-dot"
                    cx={target.x}
                    cy={target.y}
                    r={3.5}
                  />
                  <line
                    className="lyric-map-hit-target"
                    data-testid="lyric-map-hit-target"
                    x1={layout.x}
                    x2={target.x}
                    y1={lyricAnchorY}
                    y2={target.y}
                    onMouseDown={handleStartDrag}
                  />
                </g>
              ) : null;
            }

            const sortedTargets = [...connectorTargets].sort((a, b) => a.x - b.x);
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
              <g key={`${layout.id}:${keySuffix}`}>
                <path
                  className="lyric-map-connector"
                  d={pathData}
                  data-map-cardinality="range"
                  data-event-id={layout.eventId}
                  data-target-event-ids={connectorTargets
                    .map((connectorTarget) => connectorTarget.eventId)
                    .join(' ')}
                  data-testid="lyric-map-connector"
                />
                {sortedTargets.map((target) => (
                  <circle
                    key={`${layout.id}:${keySuffix}:${target.eventId}:dot`}
                    className="lyric-map-target-dot"
                    data-testid="lyric-map-target-dot"
                    cx={target.x}
                    cy={target.y}
                    r={3.5}
                  />
                ))}
                <path
                  className="lyric-map-hit-target"
                  data-testid="lyric-map-hit-target"
                  d={pathData}
                  onMouseDown={handleStartDrag}
                />
              </g>
            );
          };

          const renderRemoteSystemConnector = (
            connectorTargets: typeof targets,
            keySuffix: string,
          ) => {
            if (connectorTargets.length === 1) {
              const target = connectorTargets[0];
              const markerY =
                layout.side === 'below'
                  ? target.y - 16
                  : target.y + 16;

              return target ? (
                <g key={`${layout.id}:${keySuffix}`}>
                  <line
                    className="lyric-map-connector"
                    data-map-cardinality="single"
                    data-event-id={layout.eventId}
                    data-target-event-ids={target.eventId}
                    data-testid="lyric-map-connector"
                    x1={target.x}
                    x2={target.x}
                    y1={markerY}
                    y2={target.y}
                  />
                  <circle
                    className="lyric-map-target-dot"
                    data-testid="lyric-map-target-dot"
                    cx={target.x}
                    cy={target.y}
                    r={3.5}
                  />
                  <line
                    className="lyric-map-hit-target"
                    data-testid="lyric-map-hit-target"
                    x1={target.x}
                    x2={target.x}
                    y1={markerY}
                    y2={target.y}
                    onMouseDown={handleStartDrag}
                  />
                </g>
              ) : null;
            }

            const sortedTargets = [...connectorTargets].sort((a, b) => a.x - b.x);
            const firstTarget = sortedTargets[0];
            const lastTarget = sortedTargets[sortedTargets.length - 1];

            if (!firstTarget || !lastTarget) {
              return null;
            }

            const bridgeY =
              layout.side === 'below'
                ? Math.min(...sortedTargets.map((target) => target.y)) - 16
                : Math.max(...sortedTargets.map((target) => target.y)) + 16;
            const pathData = [
              `M ${firstTarget.x} ${bridgeY} L ${lastTarget.x} ${bridgeY}`,
              ...sortedTargets.map(
                (target) => `M ${target.x} ${bridgeY} L ${target.x} ${target.y}`,
              ),
            ].join(' ');

            return (
              <g key={`${layout.id}:${keySuffix}`}>
                <path
                  className="lyric-map-connector"
                  d={pathData}
                  data-map-cardinality="range"
                  data-event-id={layout.eventId}
                  data-target-event-ids={connectorTargets
                    .map((connectorTarget) => connectorTarget.eventId)
                    .join(' ')}
                  data-testid="lyric-map-connector"
                />
                {sortedTargets.map((target) => (
                  <circle
                    key={`${layout.id}:${keySuffix}:${target.eventId}:dot`}
                    className="lyric-map-target-dot"
                    data-testid="lyric-map-target-dot"
                    cx={target.x}
                    cy={target.y}
                    r={3.5}
                  />
                ))}
                <path
                  className="lyric-map-hit-target"
                  data-testid="lyric-map-hit-target"
                  d={pathData}
                  onMouseDown={handleStartDrag}
                />
              </g>
            );
          };

          const targetSystemIndexes = [
            ...new Set(targets.map((target) => target.systemIndex)),
          ];
          const connectorGroups = targetSystemIndexes
            .map((systemIndex) => {
              const connectorTargets = targets.filter(
                (target) => target.systemIndex === systemIndex,
              );

              return systemIndex === layoutSystemIndex
                ? renderSingleSystemConnector(
                    connectorTargets,
                    `system-${systemIndex}`,
                  )
                : renderRemoteSystemConnector(
                    connectorTargets,
                    `system-${systemIndex}`,
                  );
            })
            .filter(Boolean);

          return connectorGroups.length > 1 ? (
            <g key={layout.id}>{connectorGroups}</g>
          ) : (
            connectorGroups[0] ?? null
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
