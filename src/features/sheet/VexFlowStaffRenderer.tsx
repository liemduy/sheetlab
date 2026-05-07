import { useEffect, useRef, useState } from 'react';
import {
  Accidental as VexFlowAccidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
} from 'vexflow';
import type { ScoreEvent, Staff } from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';
import type { StaffRendererProps } from './StaffRenderer';
import { NotationOverlay } from './NotationOverlay';
import type { RenderedEventLayout } from './NotationOverlay';
import {
  MEASURE_WIDTH,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getLocalMeasureIndex,
  getMeasureX,
  getScoreStaffGap,
  getScoreSystemGap,
  getScoreSvgHeight,
  getStaffTop,
} from './layout';
import {
  accidentalToVexFlow,
  durationToVexFlowDuration,
  pitchToVexFlowKey,
  splitBeatsIntoDurations,
} from './vexflowAdapter';
import { getBeatX, getPitchY } from './notationGeometry';
import { getMeasureKey } from './measureKey';

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
  const eventPitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, staff.clef),
  );
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

function createEmptyMeasureDisplayRests(
  staffId: Staff['id'],
  measureIndex: number,
  beatsPerMeasure: number,
): ScoreEvent[] {
  let cursorBeat = 0;

  return splitBeatsIntoDurations(beatsPerMeasure).map((duration) => {
    const event: ScoreEvent = {
      id: `rest-${staffId}-m${measureIndex + 1}-display-${cursorBeat}-${duration}`,
      kind: 'rest',
      beat: cursorBeat,
      duration,
    };
    cursorBeat += getDurationBeats(duration);

    return event;
  });
}

function drawVexFlowMeasureEvents({
  beatsPerMeasure,
  context,
  measureIndex,
  staff,
  staffGap,
  staffIndex,
  systemGap,
  stave,
}: {
  beatsPerMeasure: number;
  context: ReturnType<Renderer['getContext']>;
  measureIndex: number;
  staff: Staff;
  staffGap: number;
  staffIndex: number;
  systemGap: number;
  stave: Stave;
}) {
  const measure = staff.measures.find((candidate) => candidate.index === measureIndex);
  const measureEvents = measure?.voices[0]?.events ?? [];
  const events =
    measureEvents.length > 0
      ? measureEvents
      : createEmptyMeasureDisplayRests(staff.id, measureIndex, beatsPerMeasure);
  const notes = events.map((event) => createVexFlowNote(event, staff));
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const beams = Beam.generateBeams(notes, {
    beamRests: false,
    groups: Beam.getDefaultBeamGroups(`${beatsPerMeasure}/4`),
  });

  Formatter.FormatAndDraw(context, stave, notes, {
    alignRests: true,
  });
  beams.forEach((beam) => beam.setContext(context).draw());

  notes.forEach((note, noteIndex) => {
    const event = events[noteIndex];
    const svgElement = note.getSVGElement();

    if (!event || !svgElement) {
      return;
    }

    svgElement.classList.add(...getVexFlowEventClasses(event).split(' '));
    svgElement.setAttribute('data-event-id', event.id);
    svgElement.setAttribute('data-duration', event.duration);
    svgElement.setAttribute('data-measure-index', String(measureIndex));
    svgElement.setAttribute('data-pitch-count', String(getEventPitches(event).length));
    svgElement.setAttribute('data-staff-id', staff.id);

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
            getPitchY(
              clampPitchToClefRange(pitch, staff.clef),
              staff.clef,
              staffIndex,
              staffGap,
              measureIndex,
              systemGap,
            ),
          )
        : [
            getStaffTop(staffIndex, staffGap, measureIndex, systemGap) +
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
  });

  return eventLayouts;
}

function drawVexFlowStaves(container: HTMLDivElement, score: StaffRendererProps['score']) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score);
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(SVG_WIDTH, height);
  const context = renderer.getContext();
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const renderedStaves = staves.map((staff, staffIndex) =>
    staff.measures.map((measure) => {
      const stave = new Stave(
        getMeasureX(measure.index),
        getStaffTop(staffIndex, staffGap, measure.index, systemGap) -
          VEXFLOW_STAVE_TOP_LINE_OFFSET,
        MEASURE_WIDTH,
        {
          spacingBetweenLinesPx: 11,
        },
      );

      if (getLocalMeasureIndex(measure.index) === 0) {
        stave.addClef(staff.clef);
        if (measure.index === 0) {
          stave.addTimeSignature(
            `${score.timeSignature.beats}/${score.timeSignature.beatUnit}`,
          );
        }
      }

      stave.setAttribute('data-measure-index', String(measure.index));
      stave.setAttribute('data-staff-id', staff.id);
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
    renderedStaves[0].forEach((trebleStave, measureIndex) => {
      if (getLocalMeasureIndex(measureIndex) !== 0) {
        return;
      }

      const bassStave = renderedStaves[1]?.[measureIndex];

      if (!bassStave) {
        return;
      }

      new StaveConnector(trebleStave, bassStave)
        .setType('brace')
        .setContext(context)
        .draw();
      new StaveConnector(trebleStave, bassStave)
        .setType('singleLeft')
        .setContext(context)
        .draw();
    });
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
          systemGap,
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
  selectedPitchIndex?: number | null,
  activeEventId?: string | null,
  invalidMeasureKeys: readonly string[] = [],
) {
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);

  container.querySelectorAll('.vf-user-event').forEach((element) => {
    const eventId = element.getAttribute('data-event-id');
    const pitchCount = Number(element.getAttribute('data-pitch-count'));
    const staffId = element.getAttribute('data-staff-id');
    const measureIndex = Number(element.getAttribute('data-measure-index'));
    const isInvalidMeasure =
      (staffId === 'treble' || staffId === 'bass') &&
      Number.isFinite(measureIndex) &&
      invalidMeasureKeySet.has(getMeasureKey(staffId, measureIndex));

    element.classList.toggle(
      'is-selected',
      eventId === selectedEventId &&
        (selectedPitchIndex === null ||
          selectedPitchIndex === undefined ||
          pitchCount <= 1),
    );
    element.classList.toggle('is-playing', eventId === activeEventId);
    element.classList.toggle('is-invalid-measure', isInvalidMeasure);
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
        props.selectedPitchIndex,
        props.activeEventId,
        props.invalidMeasureKeys,
      );
    }
  }, [
    props.activeEventId,
    props.invalidMeasureKeys,
    props.score,
    props.selectedEventId,
    props.selectedPitchIndex,
  ]);

  useEffect(() => {
    if (containerRef.current) {
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.selectedPitchIndex,
        props.activeEventId,
        props.invalidMeasureKeys,
      );
    }
  }, [
    eventLayouts,
    props.activeEventId,
    props.invalidMeasureKeys,
    props.selectedEventId,
    props.selectedPitchIndex,
  ]);

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
        invalidMeasureKeys={props.invalidMeasureKeys}
        onClearInteraction={props.onClearInteraction}
        onDeleteEvent={props.onDeleteEvent}
        onHoverPositionChange={props.onHoverPositionChange}
        onMoveEvent={props.onMoveEvent}
        onPlaceAtPosition={props.onPlaceAtPosition}
        onSelectMeasure={props.onSelectMeasure}
        onSelectEvent={props.onSelectEvent}
        playbackBeat={props.playbackBeat}
        placementMode={props.placementMode}
        score={props.score}
        selectedEventId={props.selectedEventId}
        selectedMeasure={props.selectedMeasure}
        selectedPitchIndex={props.selectedPitchIndex}
        svgHeight={height}
      />
    </div>
  );
}
