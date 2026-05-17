import type { MouseEvent } from 'react';
import type { AnnotationKind, AnnotationOffset } from '../../domain/score/types';
import type { AnnotationTarget } from '../app/selectionTypes';
import type { RenderedAnnotationLayout } from './renderedEventLayout';

interface AnnotationHitTargetsProps {
  layouts: RenderedAnnotationLayout[];
  onAnnotationContextMenu?: (
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
  ) => void;
  onAnnotationStartDrag?: (
    layout: RenderedAnnotationLayout,
    event: MouseEvent<SVGElement>,
  ) => void;
  onSelectAnnotation?: (target: AnnotationTarget) => void;
  selectedAnnotation?: AnnotationTarget | null;
}

export function AnnotationHitTargets({
  layouts,
  onAnnotationContextMenu,
  onAnnotationStartDrag,
  onSelectAnnotation,
  selectedAnnotation,
}: AnnotationHitTargetsProps) {
  if (!onAnnotationContextMenu && !onAnnotationStartDrag && !onSelectAnnotation) {
    return null;
  }

  return (
    <>
      {layouts.map((layout) => {
        const isSelected =
          selectedAnnotation?.eventId === layout.eventId &&
          selectedAnnotation.kind === layout.kind;

        return (
          <rect
            key={layout.id}
            aria-label={`${layout.kind} annotation ${layout.text}`}
            className={`annotation-hit-target${isSelected ? ' is-selected' : ''}`}
            data-annotation-kind={layout.kind}
            data-annotation-offset-x={layout.offsetX}
            data-annotation-offset-y={layout.offsetY}
            data-annotation-selected={isSelected ? 'true' : undefined}
            data-annotation-side={layout.side}
            data-event-id={layout.eventId}
            data-testid="annotation-hit-target"
            height={layout.maxY - layout.minY + 8}
            role="button"
            tabIndex={0}
            width={layout.maxX - layout.minX + 8}
            x={layout.minX - 4}
            y={layout.minY - 4}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectAnnotation?.({
                eventId: layout.eventId,
                kind: layout.kind,
              });
            }}
            onMouseDown={(event) => {
              if (event.button !== 0 || !onAnnotationStartDrag) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onSelectAnnotation?.({
                eventId: layout.eventId,
                kind: layout.kind,
              });
              onAnnotationStartDrag(layout, event);
            }}
            onContextMenu={(event) => {
              if (!onAnnotationContextMenu) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onSelectAnnotation?.({
                eventId: layout.eventId,
                kind: layout.kind,
              });
              onAnnotationContextMenu(
                layout.eventId,
                layout.kind,
                event.clientX,
                event.clientY,
              );
            }}
          />
        );
      })}
    </>
  );
}

export function AnnotationDragPreview({
  attachmentPoint,
  layout,
  offset,
}: {
  attachmentPoint?: { x: number; y: number } | null;
  layout: RenderedAnnotationLayout;
  offset: AnnotationOffset;
}) {
  const deltaX = offset.x - layout.offsetX;
  const deltaY = offset.y - layout.offsetY;
  const guideEndY =
    layout.side === 'below' ? layout.minY + deltaY - 4 : layout.maxY + deltaY + 4;

  return (
    <g
      className="annotation-drag-preview"
      data-annotation-kind={layout.kind}
      data-testid="annotation-drag-preview"
    >
      {attachmentPoint ? (
        <line
          className="annotation-drag-guide"
          data-testid="annotation-drag-guide"
          x1={attachmentPoint.x}
          x2={layout.x + deltaX}
          y1={attachmentPoint.y}
          y2={guideEndY}
        />
      ) : null}
      <rect
        height={layout.maxY - layout.minY + 8}
        width={layout.maxX - layout.minX + 8}
        x={layout.minX + deltaX - 4}
        y={layout.minY + deltaY - 4}
      />
      <text x={layout.x + deltaX} y={layout.y + deltaY}>
        {layout.text}
      </text>
    </g>
  );
}
