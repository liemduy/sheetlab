import type { RenderedVoiceZoneLayout } from './renderedEventLayout';

function ZoneRect({
  className,
  kind,
  maxX,
  maxY,
  minX,
  minY,
  zone,
}: {
  className: string;
  kind: string;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  zone: RenderedVoiceZoneLayout;
}) {
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <rect
      className={className}
      data-staff-id={zone.staffId}
      data-system-index={zone.systemIndex}
      data-testid="voice-zone-debug"
      data-voice-index={zone.voiceIndex}
      data-zone-kind={kind}
      height={height}
      width={width}
      x={minX}
      y={minY}
    />
  );
}

export function VoiceZoneDebugOverlay({
  show,
  zones,
}: {
  show: boolean;
  zones: RenderedVoiceZoneLayout[];
}) {
  if (!show || zones.length === 0) {
    return null;
  }

  return (
    <g className="voice-zone-debug-layer" aria-hidden="true">
      {zones.flatMap((zone) => [
        <ZoneRect
          key={`${zone.id}:above`}
          className="voice-zone-debug voice-zone-debug-above"
          kind="above"
          maxX={zone.maxX}
          maxY={zone.above.maxY}
          minX={zone.minX}
          minY={zone.above.minY}
          zone={zone}
        />,
        <ZoneRect
          key={`${zone.id}:voice`}
          className="voice-zone-debug voice-zone-debug-voice"
          kind="voice"
          maxX={zone.maxX}
          maxY={zone.voice.maxY}
          minX={zone.minX}
          minY={zone.voice.minY}
          zone={zone}
        />,
        <ZoneRect
          key={`${zone.id}:below`}
          className="voice-zone-debug voice-zone-debug-below"
          kind="below"
          maxX={zone.maxX}
          maxY={zone.below.maxY}
          minX={zone.minX}
          minY={zone.below.minY}
          zone={zone}
        />,
      ])}
    </g>
  );
}
