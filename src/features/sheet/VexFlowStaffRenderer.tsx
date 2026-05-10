import { useEffect, useRef, useState } from 'react';
import {
  Accidental as VexFlowAccidental,
  Barline,
  Beam,
  Dot,
  Formatter,
  Repetition,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Stem,
  Volta,
  Voice as VexFlowVoice,
} from 'vexflow';
import type { ScoreEvent, Staff } from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import {
  getActiveKeySignature,
  measureStartsKeySignatureChange,
} from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getMeasureRepeatJump } from '../../domain/score/repeatJumps';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';
import type { StaffRendererProps } from './StaffRenderer';
import { NotationOverlay } from './NotationOverlay';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
  RenderedVoiceZoneLayout,
} from './renderedEventLayout';
import {
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getLocalMeasureIndex,
  getMeasureContentLeft,
  getMeasureX,
  getMeasureWidth,
  getScoreSystemMeasureIndexes,
  getScoreStaffTop,
  getScoreSvgHeight,
  getSystemIndex,
} from './layout';
import {
  accidentalToVexFlow,
  durationToVexFlowDuration,
  pitchToVexFlowKey,
  splitBeatsIntoDurations,
} from './vexflowAdapter';
import { getBeatX, getPitchYForScore } from './notationGeometry';
import { getMeasureKey } from './measureKey';
import { getKeySignatureSymbolLayouts } from './keySignatureLayout';
import { drawTextAnnotations } from './vexflowAnnotationRenderer';
import { computeRenderedVoiceZones } from './renderedVoiceZones';
import { NOTEHEAD_ANNOTATION_INK_PADDING } from './annotationLayoutPolicy';

const REST_KEY_BY_CLEF = {
  treble: 'b/4',
  bass: 'd/3',
} satisfies Record<Staff['clef'], string>;
const STEM_RENDERED_INK_ESTIMATE = STAFF_LINE_SPACING * 3;
const KEY_SIGNATURE_SYMBOL_TEXT = {
  flat: '♭',
  sharp: '♯',
} as const;
const REPETITION_TYPE_BY_REPEAT_JUMP = {
  coda: Repetition.type.CODA_LEFT,
  dc: Repetition.type.DC,
  'dc-al-coda': Repetition.type.DC_AL_CODA,
  'dc-al-fine': Repetition.type.DC_AL_FINE,
  ds: Repetition.type.DS,
  'ds-al-coda': Repetition.type.DS_AL_CODA,
  'ds-al-fine': Repetition.type.DS_AL_FINE,
  fine: Repetition.type.FINE,
  segno: Repetition.type.SEGNO_LEFT,
  'to-coda': Repetition.type.TO_CODA,
} as const;

interface RenderedBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

function getVexFlowEventClasses(event: ScoreEvent) {
  return isGeneratedRestEvent(event)
    ? 'vf-score-event vf-generated-rest'
    : 'vf-score-event vf-user-event';
}

function combineRenderedBounds(bounds: RenderedBounds[]) {
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce<RenderedBounds>(
    (combined, candidate) => ({
      maxX: Math.max(combined.maxX, candidate.maxX),
      maxY: Math.max(combined.maxY, candidate.maxY),
      minX: Math.min(combined.minX, candidate.minX),
      minY: Math.min(combined.minY, candidate.minY),
    }),
    bounds[0],
  );
}

function getRenderedNoteBounds(note: StaveNote, svgElement: SVGElement) {
  const bounds: RenderedBounds[] = [];

  try {
    const vexFlowBounds = note.getBoundingBox();
    const x = vexFlowBounds.getX();
    const y = vexFlowBounds.getY();
    const width = vexFlowBounds.getW();
    const height = vexFlowBounds.getH();

    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(width) &&
      Number.isFinite(height)
    ) {
      bounds.push({
        maxX: x + width,
        maxY: y + height,
        minX: x,
        minY: y,
      });
    }
  } catch {
    // VexFlow can omit bounding boxes for some generated SVG fragments.
  }

  try {
    const svgGraphicsElement = svgElement as SVGGraphicsElement;
    const svgBounds =
      typeof svgGraphicsElement.getBBox === 'function'
        ? svgGraphicsElement.getBBox()
        : null;

    if (
      svgBounds &&
      Number.isFinite(svgBounds.x) &&
      Number.isFinite(svgBounds.y) &&
      Number.isFinite(svgBounds.width) &&
      Number.isFinite(svgBounds.height)
    ) {
      bounds.push({
        maxX: svgBounds.x + svgBounds.width,
        maxY: svgBounds.y + svgBounds.height,
        minX: svgBounds.x,
        minY: svgBounds.y,
      });
    }
  } catch {
    // JSDOM does not implement SVG getBBox; the VexFlow bounds above cover tests.
  }

  return combineRenderedBounds(bounds);
}

function createVexFlowNote(
  event: ScoreEvent,
  staff: Staff,
  stemDirection?: number,
) {
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
          stemDirection,
        })
      : new StaveNote({
          clef: staff.clef,
          dots: eventDots || undefined,
          duration: durationToVexFlowDuration(event.duration),
          keys: eventPitches.map(pitchToVexFlowKey),
          stemDirection,
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

function applyRepeatJumpToStave(
  stave: Stave,
  score: StaffRendererProps['score'],
  measureIndex: number,
  staffIndex: number,
) {
  const repeatJump = getMeasureRepeatJump(score, measureIndex);

  if (!repeatJump) {
    return;
  }

  if (repeatJump === 'repeat-start') {
    stave.setBegBarType(Barline.type.REPEAT_BEGIN);
    return;
  }

  if (repeatJump === 'repeat-end') {
    stave.setEndBarType(Barline.type.REPEAT_END);
    return;
  }

  if (repeatJump === 'repeat-both') {
    stave.setBegBarType(Barline.type.REPEAT_BEGIN);
    stave.setEndBarType(Barline.type.REPEAT_END);
    return;
  }

  if (staffIndex !== 0) {
    return;
  }

  if (repeatJump === 'ending-1' || repeatJump === 'ending-2' || repeatJump === 'ending-3') {
    stave.setVoltaType(
      Volta.type.BEGIN_END,
      `${repeatJump.replace('ending-', '')}.`,
      -20,
    );
    return;
  }

  const repetitionType =
    REPETITION_TYPE_BY_REPEAT_JUMP[
      repeatJump as keyof typeof REPETITION_TYPE_BY_REPEAT_JUMP
    ];

  if (repetitionType !== undefined) {
    stave.setRepetitionType(repetitionType, -8);
  }
}

function drawVexFlowMeasureEvents({
  beatsPerMeasure,
  context,
  measureIndex,
  score,
  staff,
  staffIndex,
  stave,
}: {
  beatsPerMeasure: number;
  context: ReturnType<Renderer['getContext']>;
  measureIndex: number;
  score: StaffRendererProps['score'];
  staff: Staff;
  staffIndex: number;
  stave: Stave;
}) {
  const measure = staff.measures.find((candidate) => candidate.index === measureIndex);
  const voiceGroups =
    measure?.voices
      .map((voice, voiceIndex) => ({
        events: voice.events,
        voiceIndex,
      }))
      .filter((voice) => voice.events.length > 0) ?? [];
  const renderGroups =
    voiceGroups.length > 0
      ? voiceGroups
      : [
          {
            events: createEmptyMeasureDisplayRests(
              staff.id,
              measureIndex,
              beatsPerMeasure,
            ),
            voiceIndex: 0,
          },
        ];
  const hasMultipleVoices = renderGroups.length > 1;
  const renderedVoices = renderGroups.map((voiceGroup) => {
    const stemDirection =
      hasMultipleVoices
        ? voiceGroup.voiceIndex === 0
          ? Stem.UP
          : Stem.DOWN
        : undefined;
    const notes = voiceGroup.events.map((event) =>
      createVexFlowNote(event, staff, stemDirection),
    );

    return {
      ...voiceGroup,
      notes,
      vexFlowVoice: new VexFlowVoice({
        beatValue: score.timeSignature.beatUnit,
        numBeats: score.timeSignature.beats,
      })
        .setMode(VexFlowVoice.Mode.SOFT)
        .addTickables(notes),
    };
  });
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const beams = renderedVoices.flatMap(({ notes }) =>
    Beam.generateBeams(notes, {
      beamRests: false,
      groups: Beam.getDefaultBeamGroups(
        `${score.timeSignature.beats}/${score.timeSignature.beatUnit}`,
      ),
      maintainStemDirections: hasMultipleVoices,
    }),
  );
  const vexFlowVoices = renderedVoices.map((voice) => voice.vexFlowVoice);

  new Formatter()
    .joinVoices(vexFlowVoices)
    .formatToStave(vexFlowVoices, stave, {
      alignRests: true,
      context,
    });
  vexFlowVoices.forEach((voice) => voice.draw(context, stave));
  beams.forEach((beam) => beam.setContext(context).draw());

  renderedVoices.forEach(({ events, notes, voiceIndex }) => {
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
      svgElement.setAttribute('data-voice-index', String(voiceIndex));

      const eventPitches = getEventPitches(event);
      const fallbackX = getBeatX(
        measureIndex,
        event.beat,
        beatsPerMeasure,
        score,
      );
      const minX = note.getNoteHeadBeginX();
      const maxX = note.getNoteHeadEndX();
      const renderedX =
        Number.isFinite(minX) && Number.isFinite(maxX)
          ? (minX + maxX) / 2
          : fallbackX;
      const noteBounds = getRenderedNoteBounds(note, svgElement);
      const pitchYs =
        eventPitches.length > 0
          ? eventPitches.map((pitch) =>
              getPitchYForScore(
                clampPitchToClefRange(pitch, staff.clef),
                staff.clef,
                staffIndex,
                score,
                measureIndex,
              ),
            )
          : [
              getScoreStaffTop(score, staffIndex, measureIndex) +
                STAFF_LINE_SPACING * 2,
            ];
      const pitchLayouts = eventPitches.map((_, pitchIndex) => {
        const noteHead = note.noteHeads[pitchIndex];
        const noteHeadMinX = noteHead?.getAbsoluteX();
        const noteHeadWidth = noteHead?.getWidth();
        const pitchY =
          pitchYs[pitchIndex] ??
          getScoreStaffTop(score, staffIndex, measureIndex) +
            STAFF_LINE_SPACING * 2;
        const minPitchX =
          noteHead &&
          noteHeadMinX !== undefined &&
          Number.isFinite(noteHeadMinX)
            ? noteHeadMinX
            : renderedX - 6;
        const pitchWidth =
          noteHeadWidth !== undefined && Number.isFinite(noteHeadWidth)
            ? noteHeadWidth
            : 12;
        const maxPitchX = minPitchX + pitchWidth;
        const pitchLayout = {
          isDisplaced: noteHead?.isDisplaced() ?? false,
          maxX: maxPitchX,
          minX: minPitchX,
          pitchIndex,
          x: (minPitchX + maxPitchX) / 2,
          y: pitchY,
        };
        const noteHeadElement = noteHead?.getSVGElement();

        if (noteHeadElement) {
          noteHeadElement.classList.add('vf-user-notehead');
          noteHeadElement.setAttribute('data-event-id', event.id);
          noteHeadElement.setAttribute('data-pitch-index', String(pitchIndex));
          noteHeadElement.setAttribute('data-notehead-x', pitchLayout.x.toFixed(2));
          noteHeadElement.setAttribute('data-notehead-y', pitchLayout.y.toFixed(2));
        }

        return pitchLayout;
      });
      const minPitchY = Math.min(...pitchYs);
      const maxPitchY = Math.max(...pitchYs);
      const stemDirection =
        eventPitches.length > 0 && event.duration !== 'whole'
          ? note.getStemDirection()
          : null;
      const minY =
        stemDirection === Stem.UP
          ? minPitchY - STEM_RENDERED_INK_ESTIMATE
          : minPitchY - NOTEHEAD_ANNOTATION_INK_PADDING;
      const maxY =
        stemDirection === Stem.DOWN
          ? maxPitchY + STEM_RENDERED_INK_ESTIMATE
          : maxPitchY + NOTEHEAD_ANNOTATION_INK_PADDING;

      eventLayouts[event.id] = {
        beat: event.beat,
        isGeneratedRest: isGeneratedRestEvent(event),
        kind: event.kind,
        maxX: Math.max(
          Number.isFinite(maxX) ? maxX : renderedX + 10,
          noteBounds?.maxX ?? Number.NEGATIVE_INFINITY,
        ),
        maxY: Math.max(maxY, noteBounds?.maxY ?? Number.NEGATIVE_INFINITY),
        measureIndex,
        minX: Math.min(
          Number.isFinite(minX) ? minX : renderedX - 10,
          noteBounds?.minX ?? Number.POSITIVE_INFINITY,
        ),
        minY: Math.min(minY, noteBounds?.minY ?? Number.POSITIVE_INFINITY),
        pitchLayouts,
        staffId: staff.id,
        voiceIndex,
        x: renderedX,
        y:
          (Math.min(minY, noteBounds?.minY ?? Number.POSITIVE_INFINITY) +
            Math.max(maxY, noteBounds?.maxY ?? Number.NEGATIVE_INFINITY)) /
          2,
      };
    });
  });

  return eventLayouts;
}

function drawVexFlowStaves(container: HTMLDivElement, score: StaffRendererProps['score']) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(SVG_WIDTH, height);
  const context = renderer.getContext();
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const renderedStaves = staves.map((staff, staffIndex) =>
    staff.measures.map((measure) => {
      const stave = new Stave(
        getMeasureX(measure.index, score),
        getScoreStaffTop(score, staffIndex, measure.index) -
          VEXFLOW_STAVE_TOP_LINE_OFFSET,
        getMeasureWidth(measure.index, score),
        {
          spacingBetweenLinesPx: 11,
        },
      );

      if (getLocalMeasureIndex(measure.index, score) === 0) {
        stave.addClef(staff.clef);
        const activeKeySignature = getActiveKeySignature(score, measure.index);

        if (activeKeySignature !== 'C') {
          stave.addKeySignature(activeKeySignature);
        }

        if (measure.index === 0) {
          stave.addTimeSignature(
            `${score.timeSignature.beats}/${score.timeSignature.beatUnit}`,
          );
        }
      } else if (measureStartsKeySignatureChange(score, measure.index)) {
        stave.addKeySignature(getActiveKeySignature(score, measure.index));
      }

      applyRepeatJumpToStave(stave, score, measure.index, staffIndex);
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
      if (getLocalMeasureIndex(measureIndex, score) !== 0) {
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
          beatsPerMeasure,
          context,
          measureIndex,
          score,
          staff,
          staffIndex,
          stave,
        }),
      );
    });
  });

  drawKeySignatureSymbols(container, score);
  const annotationLayouts = drawTextAnnotations(container, score, eventLayouts);
  const voiceZoneLayouts = computeRenderedVoiceZones({
    annotationLayouts,
    eventLayouts,
    score,
  });

  return {
    annotationLayouts,
    eventLayouts,
    voiceZoneLayouts,
  };
}

function drawKeySignatureSymbols(
  container: HTMLDivElement,
  score: StaffRendererProps['score'],
) {
  const svg = container.querySelector('svg');

  if (!svg) {
    return;
  }

  svg
    .querySelectorAll('.sheetlab-key-signature-symbol')
    .forEach((element) => element.remove());
  svg
    .querySelectorAll('.vf-keysignature')
    .forEach((element) =>
      element.setAttribute('data-sheetlab-hidden-standard-key-signature', 'true'),
    );

  getKeySignatureSymbolLayouts(score).forEach((layout) => {
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'text');

    symbol.classList.add('sheetlab-key-signature-symbol');
    symbol.setAttribute('data-testid', 'rendered-key-signature-symbol');
    symbol.setAttribute('data-source-measure-index', String(layout.sourceMeasureIndex));
    symbol.setAttribute('data-measure-index', String(layout.measureIndex));
    symbol.setAttribute('data-staff-id', layout.staffId);
    symbol.setAttribute('data-symbol-index', String(layout.symbolIndex));
    symbol.setAttribute('data-step', layout.pitch.step);
    symbol.setAttribute('data-accidental', layout.accidental);
    symbol.setAttribute('x', layout.x.toFixed(2));
    symbol.setAttribute('y', layout.y.toFixed(2));
    symbol.setAttribute('dominant-baseline', 'central');
    symbol.setAttribute('text-anchor', 'middle');
    symbol.textContent = KEY_SIGNATURE_SYMBOL_TEXT[layout.accidental];
    svg.appendChild(symbol);
  });
}

function syncVexFlowSelection(
  container: HTMLDivElement,
  selectedEventId?: string | null,
  selectedPitchIndex?: number | null,
  activeEventId?: string | null,
  activeEventIds: readonly string[] = [],
  invalidMeasureKeys: readonly string[] = [],
) {
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);
  const activeEventIdSet = new Set([
    ...activeEventIds,
    ...(activeEventId ? [activeEventId] : []),
  ]);

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
    element.classList.toggle(
      'is-playing',
      eventId !== null && activeEventIdSet.has(eventId),
    );
    element.classList.toggle('is-invalid-measure', isInvalidMeasure);
  });

  container.querySelectorAll('.vf-user-notehead').forEach((element) => {
    const eventId = element.getAttribute('data-event-id');
    const pitchIndex = Number(element.getAttribute('data-pitch-index'));
    const isSelectedPitch =
      eventId === selectedEventId &&
      selectedPitchIndex !== null &&
      selectedPitchIndex !== undefined &&
      Number.isFinite(pitchIndex) &&
      pitchIndex === selectedPitchIndex;

    element.classList.toggle('is-selected-notehead', isSelectedPitch);
  });
}

export function VexFlowStaffRenderer(props: StaffRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [eventLayouts, setEventLayouts] = useState<
    Record<string, RenderedEventLayout>
  >({});
  const [annotationLayouts, setAnnotationLayouts] = useState<
    RenderedAnnotationLayout[]
  >([]);
  const [voiceZoneLayouts, setVoiceZoneLayouts] = useState<
    RenderedVoiceZoneLayout[]
  >([]);
  const height = getScoreSvgHeight(props.score);

  useEffect(() => {
    if (containerRef.current) {
      const {
        annotationLayouts: nextAnnotationLayouts,
        eventLayouts: nextEventLayouts,
        voiceZoneLayouts: nextVoiceZoneLayouts,
      } = drawVexFlowStaves(containerRef.current, props.score);
      setEventLayouts(nextEventLayouts);
      setAnnotationLayouts(nextAnnotationLayouts);
      setVoiceZoneLayouts(nextVoiceZoneLayouts);
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.selectedPitchIndex,
        props.activeEventId,
        props.activeEventIds,
        props.invalidMeasureKeys,
      );
    }
  }, [props.score]);

  useEffect(() => {
    if (containerRef.current) {
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.selectedPitchIndex,
        props.activeEventId,
        props.activeEventIds,
        props.invalidMeasureKeys,
      );
    }
  }, [
    eventLayouts,
    props.activeEventId,
    props.invalidMeasureKeys,
    props.selectedEventId,
    props.selectedPitchIndex,
    props.activeEventIds,
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
        activeEventIds={props.activeEventIds}
        duration={props.duration ?? 'quarter'}
        dots={props.dots ?? 0}
        entryMode={props.entryMode ?? 'note'}
        annotationLayouts={annotationLayouts}
        eventLayouts={eventLayouts}
        voiceZoneLayouts={voiceZoneLayouts}
        hoverPosition={props.hoverPosition}
        inputCursor={props.inputCursor}
        isInputArmed={props.isInputArmed ?? true}
        invalidMeasureKeys={props.invalidMeasureKeys}
        onClearInteraction={props.onClearInteraction}
        onDeleteEvent={props.onDeleteEvent}
        onHoverPositionChange={props.onHoverPositionChange}
        onLyricMapChange={props.onLyricMapChange}
        onMeasureContextMenu={props.onMeasureContextMenu}
        onAnnotationContextMenu={props.onAnnotationContextMenu}
        onMoveEvent={props.onMoveEvent}
        onMoveKeySignatureSymbol={props.onMoveKeySignatureSymbol}
        onPlaceAtPosition={props.onPlaceAtPosition}
        onSelectMeasure={props.onSelectMeasure}
        onSelectEvent={props.onSelectEvent}
        playbackBeat={props.playbackBeat}
        placementMode={props.placementMode}
        score={props.score}
        selectedEventId={props.selectedEventId}
        selectedMeasure={props.selectedMeasure}
        selectedPitchIndex={props.selectedPitchIndex}
        showLayoutZones={props.showLayoutZones ?? false}
        showLyricMap={props.showLyricMap ?? false}
        svgHeight={height}
        voiceIndex={props.voiceIndex}
      />
    </div>
  );
}
