import type { MouseEvent } from 'react';
import type { KeySignatureSymbolLayout } from './keySignatureLayout';

export function KeySignatureSymbolTarget({
  layout,
  onStartDrag,
}: {
  layout: KeySignatureSymbolLayout;
  onStartDrag: (
    layout: KeySignatureSymbolLayout,
    event: MouseEvent<SVGGElement>,
  ) => void;
}) {
  const label = `Key signature ${layout.accidental} ${layout.pitch.step} measure ${
    layout.sourceMeasureIndex + 1
  } ${layout.staffId}`;

  return (
    <g
      aria-label={label}
      className="key-signature-symbol-hit"
      data-accidental={layout.accidental}
      data-measure-index={layout.measureIndex}
      data-source-measure-index={layout.sourceMeasureIndex}
      data-staff-id={layout.staffId}
      data-step={layout.pitch.step}
      data-symbol-index={layout.symbolIndex}
      data-testid="key-signature-symbol-target"
      role="button"
      tabIndex={0}
      onMouseDown={(eventMouseDown) => {
        eventMouseDown.preventDefault();
        eventMouseDown.stopPropagation();
        onStartDrag(layout, eventMouseDown);
      }}
      onKeyDown={(eventKey) => {
        if (eventKey.key === 'Enter' || eventKey.key === ' ') {
          eventKey.preventDefault();
          eventKey.stopPropagation();
        }
      }}
    >
      <rect
        className="key-signature-symbol-target"
        height={44}
        rx={5}
        width={10}
        x={layout.x - 5}
        y={layout.y - 22}
      />
    </g>
  );
}
