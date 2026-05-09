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
      const noteBounds = getRenderedNoteBounds(note, svgElement);
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
      const pitchLayouts = eventPitches.map((_, pitchIndex) => {
        const noteHead = note.noteHeads[pitchIndex];
        const noteHeadMinX = noteHead?.getAbsoluteX();
        const noteHeadWidth = noteHead?.getWidth();
        const pitchY =
          pitchYs[pitchIndex] ??
          getStaffTop(staffIndex, staffGap, measureIndex, systemGap) +
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
      const minY = Math.min(
        ...pitchYs,
        noteBounds?.minY ?? Number.POSITIVE_INFINITY,
      );
      const maxY = Math.max(
        ...pitchYs,
        noteBounds?.maxY ?? Number.NEGATIVE_INFINITY,
      );

      eventLayouts[event.id] = {
        beat: event.beat,
        isGeneratedRest: isGeneratedRestEvent(event),
        kind: event.kind,
        maxX: Math.max(
          Number.isFinite(maxX) ? maxX : renderedX + 10,
          noteBounds?.maxX ?? Number.NEGATIVE_INFINITY,
        ),
        maxY,
        measureIndex,
        minX: Math.min(
          Number.isFinite(minX) ? minX : renderedX - 10,
          noteBounds?.minX ?? Number.POSITIVE_INFINITY,
        ),
        minY,
        pitchLayouts,
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

type AnnotationKind =
  | 'chordSymbol'
  | 'dynamic'
  | 'fermata'
  | 'lyric'
  | 'pedal'
  | 'sectionMarker';

interface AnnotationBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface AnnotationPlacement extends AnnotationBounds {
  row: number;
}

const BELOW_STAFF_ANNOTATION_BASELINE = STAFF_LINE_SPACING * 4 + 30;
const BELOW_STAFF_INK_GAP = 10;
const BELOW_STAFF_ROW_GAP = 26;
const ABOVE_STAFF_INK_GAP = 10;
const ABOVE_STAFF_ROW_GAP = 26;
const ANNOTATION_HORIZONTAL_GAP = 6;
const MAX_ANNOTATION_ROW_ATTEMPTS = 8;

const BELOW_STAFF_ROW_BY_ANNOTATION = {
  dynamic: 1,
  lyric: 0,
  pedal: 2,
} satisfies Record<'dynamic' | 'lyric' | 'pedal', number>;

const ANNOTATION_METRICS = {
  chordSymbol: { charWidth: 9.5, descent: 5, height: 20, minWidth: 22 },
  dynamic: { charWidth: 9, descent: 5, height: 21, minWidth: 18 },
  fermata: { charWidth: 14, descent: 5, height: 26, minWidth: 18 },
  lyric: { charWidth: 8.2, descent: 5, height: 18, minWidth: 18 },
  pedal: { charWidth: 8.5, descent: 5, height: 19, minWidth: 20 },
  sectionMarker: { charWidth: 8, descent: 5, height: 20, minWidth: 34 },
} satisfies Record<
  AnnotationKind,
  { charWidth: number; descent: number; height: number; minWidth: number }
>;

function getAnnotationBounds({
  kind,
  text,
  x,
  y,
}: {
  kind: AnnotationKind;
  text: string;
  x: number;
  y: number;
}): AnnotationBounds {
  const metrics = ANNOTATION_METRICS[kind];
  const width =
    Math.max(metrics.minWidth, text.length * metrics.charWidth) +
    ANNOTATION_HORIZONTAL_GAP * 2;

  return {
    maxX: x + width / 2,
    maxY: y + metrics.descent,
    minX: x - width / 2,
    minY: y - metrics.height,
  };
}

function doAnnotationBoundsOverlap(
  first: AnnotationBounds,
  second: AnnotationBounds,
) {
  return (
    first.minX < second.maxX &&
    first.maxX > second.minX &&
    first.minY < second.maxY &&
    first.maxY > second.minY
  );
}

function moveAnnotationBoundsY(bounds: AnnotationBounds, deltaY: number) {
  return {
    ...bounds,
    maxY: bounds.maxY + deltaY,
    minY: bounds.minY + deltaY,
  };
}

function placeAnnotationInRows({
  direction,
  placements,
  preferredBounds,
  preferredRow,
}: {
  direction: 'above' | 'below';
  placements: AnnotationPlacement[];
  preferredBounds: AnnotationBounds;
  preferredRow: number;
}) {
  const rowGap =
    direction === 'below' ? BELOW_STAFF_ROW_GAP : ABOVE_STAFF_ROW_GAP;
  const rowDirection = direction === 'below' ? 1 : -1;

  for (let offset = 0; offset < MAX_ANNOTATION_ROW_ATTEMPTS; offset += 1) {
    const row = preferredRow + offset;
    const bounds = moveAnnotationBoundsY(
      preferredBounds,
      rowDirection * offset * rowGap,
    );
    const hasCollision = placements.some((placement) =>
      doAnnotationBoundsOverlap(bounds, placement),
    );

    if (!hasCollision) {
      placements.push({ ...bounds, row });
      return {
        bounds,
        row,
      };
    }
  }

  const fallbackOffset = MAX_ANNOTATION_ROW_ATTEMPTS;
  const fallbackRow = preferredRow + fallbackOffset;
  const fallbackBounds = moveAnnotationBoundsY(
    preferredBounds,
    rowDirection * fallbackOffset * rowGap,
  );

  placements.push({ ...fallbackBounds, row: fallbackRow });

  return {
    bounds: fallbackBounds,
    row: fallbackRow,
  };
}

function getMeasureEventLayoutBounds(
  eventLayouts: Record<string, RenderedEventLayout>,
  staffId: string,
  measureIndex: number,
) {
  return combineRenderedBounds(
    Object.values(eventLayouts)
      .filter(
        (layout) =>
          layout.staffId === staffId &&
          layout.measureIndex === measureIndex &&
          !layout.isGeneratedRest,
      )
      .map((layout) => ({
        maxX: layout.maxX,
        maxY: layout.maxY,
        minX: layout.minX,
        minY: layout.minY,
      })),
  );
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
      const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
      const measureInkBounds = getMeasureEventLayoutBounds(
        eventLayouts,
        staff.id,
        measure.index,
      );
      const belowStaffBaseline = Math.max(
        staffTop + BELOW_STAFF_ANNOTATION_BASELINE,
        (measureInkBounds?.maxY ?? staffBottom) +
          BELOW_STAFF_INK_GAP +
          ANNOTATION_METRICS.lyric.height,
      );
      const chordSymbolBaseline = Math.min(
        staffTop - 18,
        (measureInkBounds?.minY ?? staffTop) -
          ABOVE_STAFF_INK_GAP -
          ANNOTATION_METRICS.chordSymbol.descent,
      );
      const aboveStaffPlacements: AnnotationPlacement[] = [];
      const belowStaffPlacements: AnnotationPlacement[] = [];

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
        aboveStaffPlacements.push({
          ...getAnnotationBounds({
            kind: 'sectionMarker',
            text: measure.sectionMarker,
            x: markerX,
            y: markerY,
          }),
          row: 0,
        });
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
            const placement = placeAnnotationInRows({
              direction: 'above',
              placements: aboveStaffPlacements,
              preferredBounds: getAnnotationBounds({
                kind: 'chordSymbol',
                text: event.chordSymbol,
                x: layout.x,
                y: chordSymbolBaseline,
              }),
              preferredRow: 0,
            });

            appendSvgText({
              className: 'sheetlab-chord-symbol',
              dataset: {
                'data-annotation-row': String(placement.row),
                'data-event-id': event.id,
                'data-testid': 'rendered-chord-symbol',
              },
              svg,
              text: event.chordSymbol,
              x: layout.x,
              y: placement.bounds.maxY - ANNOTATION_METRICS.chordSymbol.descent,
            });
          }

          if (event.lyric) {
            const placement = placeAnnotationInRows({
              direction: 'below',
              placements: belowStaffPlacements,
              preferredBounds: getAnnotationBounds({
                kind: 'lyric',
                text: event.lyric,
                x: layout.x,
                y:
                  belowStaffBaseline +
                  BELOW_STAFF_ROW_BY_ANNOTATION.lyric * BELOW_STAFF_ROW_GAP,
              }),
              preferredRow: BELOW_STAFF_ROW_BY_ANNOTATION.lyric,
            });

            appendSvgText({
              className: 'sheetlab-lyric',
              dataset: {
                'data-annotation-row': String(placement.row),
                'data-event-id': event.id,
                'data-testid': 'rendered-lyric',
              },
              svg,
              text: event.lyric,
              x: layout.x,
              y: placement.bounds.maxY - ANNOTATION_METRICS.lyric.descent,
            });
          }

          if (event.dynamic) {
            const placement = placeAnnotationInRows({
              direction: 'below',
              placements: belowStaffPlacements,
              preferredBounds: getAnnotationBounds({
                kind: 'dynamic',
                text: event.dynamic,
                x: layout.x,
                y:
                  belowStaffBaseline +
                  BELOW_STAFF_ROW_BY_ANNOTATION.dynamic * BELOW_STAFF_ROW_GAP,
              }),
              preferredRow: BELOW_STAFF_ROW_BY_ANNOTATION.dynamic,
            });

            appendSvgText({
              className: 'sheetlab-dynamic',
              dataset: {
                'data-annotation-row': String(placement.row),
                'data-event-id': event.id,
                'data-testid': 'rendered-dynamic',
              },
              svg,
              text: event.dynamic,
              x: layout.x,
              y: placement.bounds.maxY - ANNOTATION_METRICS.dynamic.descent,
            });
          }

          if (event.fermata) {
            const preferredY = Math.min(staffTop - 30, layout.minY - 18);
            const placement = placeAnnotationInRows({
              direction: 'above',
              placements: aboveStaffPlacements,
              preferredBounds: getAnnotationBounds({
                kind: 'fermata',
                text: FERMATA_SYMBOL,
                x: layout.x,
                y: preferredY,
              }),
              preferredRow: Math.max(
                0,
                Math.ceil((staffTop - 18 - preferredY) / ABOVE_STAFF_ROW_GAP),
              ),
            });

            appendSvgText({
              className: 'sheetlab-fermata',
              dataset: {
                'data-annotation-row': String(placement.row),
                'data-event-id': event.id,
                'data-testid': 'rendered-fermata',
              },
              svg,
              text: FERMATA_SYMBOL,
              x: layout.x,
              y: placement.bounds.maxY - ANNOTATION_METRICS.fermata.descent,
            });
          }

          if (event.pedal) {
            const pedalText = PEDAL_MARK_TEXT[event.pedal];
            const placement = placeAnnotationInRows({
              direction: 'below',
              placements: belowStaffPlacements,
              preferredBounds: getAnnotationBounds({
                kind: 'pedal',
                text: pedalText,
                x: layout.x,
                y:
                  belowStaffBaseline +
                  BELOW_STAFF_ROW_BY_ANNOTATION.pedal * BELOW_STAFF_ROW_GAP,
              }),
              preferredRow: BELOW_STAFF_ROW_BY_ANNOTATION.pedal,
            });

            appendSvgText({
              className: 'sheetlab-pedal',
              dataset: {
                'data-annotation-row': String(placement.row),
                'data-event-id': event.id,
                'data-testid': 'rendered-pedal',
              },
              svg,
              text: pedalText,
              x: layout.x,
              y: placement.bounds.maxY - ANNOTATION_METRICS.pedal.descent,
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
