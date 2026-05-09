import type { AnnotationKind } from '../../domain/score/types';
import type { RenderedAnnotationLayout } from './renderedEventLayout';

interface AnnotationHitTargetsProps {
  layouts: RenderedAnnotationLayout[];
  onAnnotationContextMenu?: (
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
  ) => void;
}

export function AnnotationHitTargets({
  layouts,
  onAnnotationContextMenu,
}: AnnotationHitTargetsProps) {
  if (!onAnnotationContextMenu) {
    return null;
  }

  return (
    <>
      {layouts.map((layout) => (
        <rect
          key={layout.id}
          aria-label={`${layout.kind} annotation ${layout.text}`}
          className="annotation-hit-target"
          data-annotation-kind={layout.kind}
          data-annotation-side={layout.side}
          data-event-id={layout.eventId}
          data-testid="annotation-hit-target"
          height={layout.maxY - layout.minY + 8}
          role="button"
          tabIndex={0}
          width={layout.maxX - layout.minX + 8}
          x={layout.minX - 4}
          y={layout.minY - 4}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAnnotationContextMenu(
              layout.eventId,
              layout.kind,
              event.clientX,
              event.clientY,
            );
          }}
        />
      ))}
    </>
  );
}
