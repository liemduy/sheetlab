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
import type { RenderedEventLayout } from './renderedEventLayout';
import {
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getLocalMeasureIndex,
  getMeasureContentLeft,
  getMeasureX,
  getMeasureWidth,
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
import { getKeySignatureSymbolLayouts } from './keySignatureLayout';

const REST_KEY_BY_CLEF = {
  treble: 'b/4',
  bass: 'd/3',
} satisfies Record<Staff['clef'], string>;
const KEY_SIGNATURE_SYMBOL_TEXT = {
  flat: '♭',
  sharp: '♯',
} as const;
const FERMATA_SYMBOL = String.fromCodePoint(0x1d110);
const PEDAL_MARK_TEXT = {
  release: '*',
  start: 'Ped.',
  'start-release': 'Ped. *',
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

function getVexFlowEventClasses(event: ScoreEvent) {
  return isGeneratedRestEvent(event)
    ? 'vf-score-event vf-generated-rest'
    : 'vf-score-event vf-user-event';
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
  staffGap,
  staffIndex,
  systemGap,
  stave,
}: {
  beatsPerMeasure: number;
  context: ReturnType<Renderer['getContext']>;
  measureIndex: number;
  score: StaffRendererProps['score'];
  staff: Staff;
  staffGap: number;
  staffIndex: number;
  systemGap: number;
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
        isGeneratedRest: isGeneratedRestEvent(event),
        kind: event.kind,
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
  });

  return eventLayouts;
}

function drawVexFlowStaves(container: HTMLDivElement, score: StaffRendererProps['score']) {
  const staves = score.parts[0]?.staves ?? [];
  const height = getScoreSvgHeight(score);
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);
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
        getStaffTop(staffIndex, staffGap, measure.index, systemGap) -
          VEXFLOW_STAVE_TOP_LINE_OFFSET,
        getMeasureWidth(measure.index, score),
        {
          spacingBetweenLinesPx: 11,
        },
      );

      if (getLocalMeasureIndex(measure.index) === 0) {
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
          beatsPerMeasure,
          context,
          measureIndex,
          score,
          staff,
          staffGap,
          staffIndex,
          systemGap,
          stave,
        }),
      );
    });
  });

  drawKeySignatureSymbols(container, score);
  drawTextAnnotations(container, score, eventLayouts);

  return eventLayouts;
}

function appendSvgText({
  className,
  dataset,
  svg,
  text,
  x,
  y,
}: {
  className: string;
  dataset?: Record<string, string>;
  svg: SVGSVGElement;
  text: string;
  x: number;
  y: number;
}) {
  const textElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'text',
  );

  textElement.classList.add(className);
  textElement.setAttribute('x', x.toFixed(2));
  textElement.setAttribute('y', y.toFixed(2));
  textElement.textContent = text;

  Object.entries(dataset ?? {}).forEach(([key, value]) => {
    textElement.setAttribute(key, value);
  });

  svg.appendChild(textElement);

  return textElement;
}

function drawTextAnnotations(
  container: HTMLDivElement,
  score: StaffRendererProps['score'],
  eventLayouts: Record<string, RenderedEventLayout>,
) {
  const svg = container.querySelector('svg');

  if (!svg) {
    return;
  }

  svg
    .querySelectorAll(
      [
        '.sheetlab-chord-symbol',
        '.sheetlab-lyric',
        '.sheetlab-section-marker',
        '.sheetlab-dynamic',
        '.sheetlab-fermata',
        '.sheetlab-pedal',
        '.sheetlab-glissando',
      ].join(', '),
    )
    .forEach((element) => element.remove());

  const staves = score.parts[0]?.staves ?? [];
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);

  staves.forEach((staff, staffIndex) => {
    staff.measures.forEach((measure) => {
      const staffTop = getStaffTop(staffIndex, staffGap, measure.index, systemGap);

      if (staffIndex === 0 && measure.sectionMarker) {
        const markerX = getMeasureContentLeft(measure.index, score) + 12;
        const markerY = staffTop - 42;
        const markerWidth = Math.max(34, measure.sectionMarker.length * 8 + 18);
        const markerGroup = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'g',
        );
        const markerRect = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'rect',
        );

        markerGroup.classList.add('sheetlab-section-marker');
        markerGroup.setAttribute('data-testid', 'rendered-section-marker');
        markerGroup.setAttribute('data-measure-index', String(measure.index));
        markerRect.setAttribute('x', (markerX - 9).toFixed(2));
        markerRect.setAttribute('y', (markerY - 15).toFixed(2));
        markerRect.setAttribute('width', markerWidth.toFixed(2));
        markerRect.setAttribute('height', '20');
        markerRect.setAttribute('rx', '3');
        markerGroup.appendChild(markerRect);
        markerGroup.appendChild(
          appendSvgText({
            className: 'sheetlab-section-marker-text',
            svg,
            text: measure.sectionMarker,
            x: markerX,
            y: markerY,
          }),
        );
        svg.appendChild(markerGroup);
      }

      measure.voices.forEach((voice) => {
        const sortedEvents = [...voice.events].sort((a, b) => a.beat - b.beat);

        sortedEvents.forEach((event, eventIndex) => {
          const layout = eventLayouts[event.id];

          if (!layout || isGeneratedRestEvent(event)) {
            return;
          }

          if (event.chordSymbol) {
            appendSvgText({
              className: 'sheetlab-chord-symbol',
              dataset: {
                'data-event-id': event.id,
                'data-testid': 'rendered-chord-symbol',
              },
              svg,
              text: event.chordSymbol,
              x: layout.x,
              y: staffTop - 18,
            });
          }

          if (event.lyric) {
            appendSvgText({
              className: 'sheetlab-lyric',
              dataset: {
                'data-event-id': event.id,
                'data-testid': 'rendered-lyric',
              },
              svg,
              text: event.lyric,
              x: layout.x,
              y: staffTop + STAFF_LINE_SPACING * 4 + 30,
            });
          }

          if (event.dynamic) {
            appendSvgText({
              className: 'sheetlab-dynamic',
              dataset: {
                'data-event-id': event.id,
                'data-testid': 'rendered-dynamic',
              },
              svg,
              text: event.dynamic,
              x: layout.x,
              y: staffTop + STAFF_LINE_SPACING * 4 + 50,
            });
          }

          if (event.fermata) {
            appendSvgText({
              className: 'sheetlab-fermata',
              dataset: {
                'data-event-id': event.id,
                'data-testid': 'rendered-fermata',
              },
              svg,
              text: FERMATA_SYMBOL,
              x: layout.x,
              y: Math.min(staffTop - 30, layout.minY - 18),
            });
          }

          if (event.pedal) {
            appendSvgText({
              className: 'sheetlab-pedal',
              dataset: {
                'data-event-id': event.id,
                'data-testid': 'rendered-pedal',
              },
              svg,
              text: PEDAL_MARK_TEXT[event.pedal],
              x: layout.x,
              y: staffTop + STAFF_LINE_SPACING * 4 + 70,
            });
          }

          if (event.glissando) {
            const nextEvent = sortedEvents
              .slice(eventIndex + 1)
              .find((candidate) => !isGeneratedRestEvent(candidate));
            const nextLayout = nextEvent ? eventLayouts[nextEvent.id] : null;

            if (nextLayout) {
              const glissando = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'line',
              );

              glissando.classList.add('sheetlab-glissando');
              glissando.setAttribute('data-event-id', event.id);
              glissando.setAttribute('data-testid', 'rendered-glissando');
              glissando.setAttribute('x1', (layout.x + 12).toFixed(2));
              glissando.setAttribute('y1', layout.y.toFixed(2));
              glissando.setAttribute('x2', (nextLayout.x - 12).toFixed(2));
              glissando.setAttribute('y2', nextLayout.y.toFixed(2));
              svg.appendChild(glissando);
            }
          }
        });
      });
    });
  });
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
        onMeasureContextMenu={props.onMeasureContextMenu}
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
        svgHeight={height}
        voiceIndex={props.voiceIndex}
      />
    </div>
  );
}
