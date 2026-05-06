import { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveConnector } from 'vexflow';
import type { StaffRendererProps } from './StaffRenderer';
import { NotationOverlay } from './NotationOverlay';
import {
  MEASURE_WIDTH,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getMeasureX,
  getScoreSvgHeight,
  getStaffTop,
} from './layout';

function drawVexFlowStaves(container: HTMLDivElement, score: StaffRendererProps['score']) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score.type);

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(SVG_WIDTH, height);
  const context = renderer.getContext();
  const renderedStaves = staves.map((staff, staffIndex) =>
    staff.measures.map((measure) => {
      const stave = new Stave(
        getMeasureX(measure.index),
        getStaffTop(staffIndex) - VEXFLOW_STAVE_TOP_LINE_OFFSET,
        MEASURE_WIDTH,
        {
          spacingBetweenLinesPx: 11,
        },
      );

      if (measure.index === 0) {
        stave.addClef(staff.clef);
        stave.addTimeSignature(
          `${score.timeSignature.beats}/${score.timeSignature.beatUnit}`,
        );
      }

      stave.setContext(context).draw();

      return stave;
    }),
  );

  const svg = container.querySelector('svg');

  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  }

  if (score.type === 'grand' && renderedStaves.length >= 2) {
    new StaveConnector(renderedStaves[0][0], renderedStaves[1][0])
      .setType('brace')
      .setContext(context)
      .draw();
    new StaveConnector(renderedStaves[0][0], renderedStaves[1][0])
      .setType('singleLeft')
      .setContext(context)
      .draw();
  }
}

export function VexFlowStaffRenderer(props: StaffRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const height = getScoreSvgHeight(props.score.type);

  useEffect(() => {
    if (containerRef.current) {
      drawVexFlowStaves(containerRef.current, props.score);
    }
  }, [props.score]);

  return (
    <div
      className="vexflow-stage"
      data-testid="vexflow-renderer"
      style={{ aspectRatio: `${SVG_WIDTH} / ${height}` }}
    >
      <div
        aria-hidden="true"
        className="vexflow-stage-spacer"
        style={{ paddingBottom: `${(height / SVG_WIDTH) * 100}%` }}
      />
      <div ref={containerRef} className="vexflow-output" aria-hidden="true" />
      <NotationOverlay
        activeEventId={props.activeEventId}
        duration={props.duration ?? 'quarter'}
        entryMode={props.entryMode ?? 'note'}
        hoverPosition={props.hoverPosition}
        onDeleteEvent={props.onDeleteEvent}
        onHoverPositionChange={props.onHoverPositionChange}
        onMoveEvent={props.onMoveEvent}
        onPlaceAtPosition={props.onPlaceAtPosition}
        onSelectEvent={props.onSelectEvent}
        playbackBeat={props.playbackBeat}
        placementMode={props.placementMode}
        score={props.score}
        selectedEventId={props.selectedEventId}
        svgHeight={height}
      />
    </div>
  );
}
