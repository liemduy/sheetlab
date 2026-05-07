import { useEffect, useRef, useState } from 'react';
import {
  Accidental as VexFlowAccidental,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
} from 'vexflow';
import type { ScoreEvent, Staff } from '../../domain/score/types';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import type { StaffRendererProps } from './StaffRenderer';
import { NotationOverlay } from './NotationOverlay';
import type { RenderedEventLayout } from './NotationOverlay';
import {
  MEASURE_WIDTH,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getMeasureX,
  getScoreStaffGap,
  getScoreSvgHeight,
  getStaffTop,
} from './layout';
import {
  accidentalToVexFlow,
  durationToVexFlowDuration,
  pitchToVexFlowKey,
} from './vexflowAdapter';
import { getBeatX, getPitchY } from './notationGeometry';

const REST_KEY_BY_CLEF = {
  treble: 'b/4',
  bass: 'd/3',
} satisfies Record<Staff['clef'], string>;

function getVexFlowEventClasses(event: ScoreEvent) {
  return isGeneratedRestEvent(event)
    ? 'vf-score-event vf-generated-rest'
    : 'vf-score-event vf-user-event';
}

function createVexFlowNote(event: ScoreEvent, staff: Staff) {
  const eventDots = getEventDots(event);
  const eventPitches = getEventPitches(event);
  const staveNote =
    event.kind === 'rest'
      ? new StaveNote({
          clef: staff.clef,
          dots: eventDots || undefined,
          duration: durationToVexFlowDuration(event.duration, true),
          keys: [REST_KEY_BY_CLEF[staff.clef]],
        })
      : new StaveNote({
          clef: staff.clef,
          dots: eventDots || undefined,
          duration: durationToVexFlowDuration(event.duration),
          keys: eventPitches.map(pitchToVexFlowKey),
        });

  staveNote.addClass(getVexFlowEventClasses(event));
  staveNote.setAttribute('data-event-id', event.id);
  staveNote.setAttribute('data-duration', event.duration);

  if (event.kind !== 'rest') {
    eventPitches.forEach((pitch, pitchIndex) => {
      if (pitch.accidental) {
        staveNote.addModifier(
          new VexFlowAccidental(accidentalToVexFlow(pitch.accidental)),
          pitchIndex,
        );
      }
    });
  }

  if (eventDots > 0) {
    for (let dotIndex = 0; dotIndex < eventDots; dotIndex += 1) {
      Dot.buildAndAttach([staveNote], { all: true });
    }
  }

  return staveNote;
}

function drawVexFlowMeasureEvents({
  beatsPerMeasure,
  context,
  measureIndex,
  staff,
  staffGap,
  staffIndex,
  stave,
}: {
  beatsPerMeasure: number;
  context: ReturnType<Renderer['getContext']>;
  measureIndex: number;
  staff: Staff;
  staffGap: number;
  staffIndex: number;
  stave: Stave;
}) {
  const measure = staff.measures.find((candidate) => candidate.index === measureIndex);
  const events = measure?.voices[0]?.events ?? [];
  const hasUserEvents = events.some((event) => !isGeneratedRestEvent(event));

  if (!hasUserEvents) {
    return {};
  }

  const notes = events.map((event) => createVexFlowNote(event, staff));
  const eventLayouts: Record<string, RenderedEventLayout> = {};

  Formatter.FormatAndDraw(context, stave, notes, {
    alignRests: true,
    autoBeam: true,
  });

  notes.forEach((note, noteIndex) => {
    const event = events[noteIndex];
    const svgElement = note.getSVGElement();

    if (!event || !svgElement) {
      return;
    }

    svgElement.classList.add(...getVexFlowEventClasses(event).split(' '));
    svgElement.setAttribute('data-event-id', event.id);
    svgElement.setAttribute('data-duration', event.duration);

    if (!isGeneratedRestEvent(event)) {
      const eventPitches = getEventPitches(event);
      const fallbackX = getBeatX(measureIndex, event.beat, beatsPerMeasure);
      const minX = note.getNoteHeadBeginX();
      const maxX = note.getNoteHeadEndX();
      const renderedX =
        Number.isFinite(minX) && Number.isFinite(maxX)
          ? (minX + maxX) / 2
          : fallbackX;
      const pitchYs =
        eventPitches.length > 0
          ? eventPitches.map((pitch) =>
              getPitchY(pitch, staff.clef, staffIndex, staffGap),
            )
          : [
              getStaffTop(staffIndex, staffGap) +
                STAFF_LINE_SPACING * 2,
            ];
      const minY = Math.min(...pitchYs);
      const maxY = Math.max(...pitchYs);

      eventLayouts[event.id] = {
        beat: event.beat,
        maxX: Number.isFinite(maxX) ? maxX : renderedX + 10,
        maxY,
        measureIndex,
        minX: Number.isFinite(minX) ? minX : renderedX - 10,
        minY,
        staffId: staff.id,
        x: renderedX,
        y: (minY + maxY) / 2,
      };
    }
  });

  return eventLayouts;
}

function drawVexFlowStaves(container: HTMLDivElement, score: StaffRendererProps['score']) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score);
  const staffGap = getScoreStaffGap(score);

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(SVG_WIDTH, height);
  const context = renderer.getContext();
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const renderedStaves = staves.map((staff, staffIndex) =>
    staff.measures.map((measure) => {
      const stave = new Stave(
        getMeasureX(measure.index),
        getStaffTop(staffIndex, staffGap) - VEXFLOW_STAVE_TOP_LINE_OFFSET,
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

      stave.setAttribute('data-measure-index', String(measure.index));
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

  renderedStaves.forEach((staffStaves, staffIndex) => {
    const staff = staves[staffIndex];

    if (!staff) {
      return;
    }

    staffStaves.forEach((stave, measureIndex) => {
      Object.assign(
        eventLayouts,
        drawVexFlowMeasureEvents({
          beatsPerMeasure: score.timeSignature.beats,
          context,
          measureIndex,
          staff,
          staffGap,
          staffIndex,
          stave,
        }),
      );
    });
  });

  return eventLayouts;
}

function syncVexFlowSelection(
  container: HTMLDivElement,
  selectedEventId?: string | null,
  activeEventId?: string | null,
) {
  container.querySelectorAll('.vf-user-event').forEach((element) => {
    const eventId = element.getAttribute('data-event-id');

    element.classList.toggle('is-selected', eventId === selectedEventId);
    element.classList.toggle('is-playing', eventId === activeEventId);
  });
}

export function VexFlowStaffRenderer(props: StaffRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [eventLayouts, setEventLayouts] = useState<
    Record<string, RenderedEventLayout>
  >({});
  const height = getScoreSvgHeight(props.score);

  useEffect(() => {
    if (containerRef.current) {
      const nextEventLayouts = drawVexFlowStaves(containerRef.current, props.score);
      setEventLayouts(nextEventLayouts);
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.activeEventId,
      );
    }
  }, [props.activeEventId, props.score, props.selectedEventId]);

  useEffect(() => {
    if (containerRef.current) {
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.activeEventId,
      );
    }
  }, [eventLayouts, props.activeEventId, props.selectedEventId]);

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
        dots={props.dots ?? 0}
        entryMode={props.entryMode ?? 'note'}
        eventLayouts={eventLayouts}
        hoverPosition={props.hoverPosition}
        inputCursor={props.inputCursor}
        isInputArmed={props.isInputArmed ?? true}
        onClearInteraction={props.onClearInteraction}
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
