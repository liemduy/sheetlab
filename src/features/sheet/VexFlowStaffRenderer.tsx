import { useEffect, useRef, useState } from 'react';
import {
  Beam,
  ClefNote,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Stem,
  Voice as VexFlowVoice,
} from 'vexflow';
import type {
  Clef,
  Staff,
} from '../../domain/score/types';
import {
  getActiveClef,
  getMeasureClefChanges,
} from '../../domain/score/clefChanges';
import {
  getActiveKeySignature,
  measureStartsKeySignatureChange,
} from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { StaffRendererProps } from './StaffRenderer';
import { NotationOverlay } from './NotationOverlay';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
  RenderedVoiceZoneLayout,
} from './renderedEventLayout';
import {
  SVG_WIDTH,
  VEXFLOW_STAVE_TOP_LINE_OFFSET,
  getLocalMeasureIndex,
  getMeasureContentLeft,
  getMeasureX,
  getMeasureWidth,
  getScoreSystemMeasureIndexes,
  getScoreStaffTop,
  getScoreSvgHeight,
  getScoreSvgWidth,
  getSystemIndex,
} from './layout';
import {
  createEmptyMeasureDisplayRests,
  createVexFlowNote,
} from './vexflowNoteFactory';
import { getBeatX } from './notationGeometry';
import { getMeasureKey } from './measureKey';
import { drawTextAnnotations } from './vexflowAnnotationRenderer';
import { drawFingeringHints } from './vexflowFingeringRenderer';
import { computeRenderedVoiceZones } from './renderedVoiceZones';
import {
  getInsertPreviewItems,
  resolveInsertDisplayPosition,
} from './insertPreview';
import { getEffectiveStemDirection } from '../../domain/score/stemDirection';
import {
  drawVexFlowConnectionMarks,
  type RenderedNoteRef,
} from './vexflowConnectionRenderer';
import { drawVexFlowExpressionMarks } from './vexflowExpressionRenderer';
import { createVexFlowTuplets } from './vexflowTupletRenderer';
import { drawKeySignatureSymbols } from './vexflowKeySignatureRenderer';
import { applyRepeatJumpToStave } from './vexflowRepeatRenderer';
import {
  CLEF_CHANGE_BEAT_EPSILON,
  SVG_NAMESPACE,
  drawSystemStartClefChangeMarkers,
  tagRenderedClefChangeElement,
} from './vexflowSvgTagging';
import { collectRenderedMeasureEventLayouts } from './vexflowLayoutCollector';

const CLEF_CHANGE_GLYPH_CODEPOINT = {
  bass: 0xe062,
  treble: 0xe050,
} satisfies Record<Clef, number>;
const CLEF_CHANGE_STAVE_LINE = {
  bass: 1,
  treble: 3,
} satisfies Record<Clef, number>;

function drawVexFlowMeasureEvents({
  beatsPerMeasure,
  context,
  measureIndex,
  noteRefs,
  score,
  staff,
  staffIndex,
  stave,
}: {
  beatsPerMeasure: number;
  context: ReturnType<Renderer['getContext']>;
  measureIndex: number;
  noteRefs: Map<string, RenderedNoteRef>;
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
  const inlineClefChanges = getMeasureClefChanges(
    score,
    staff.id,
    measureIndex,
  ).filter(
    (change) =>
      !(
        getLocalMeasureIndex(measureIndex, score) === 0 &&
        Math.abs(change.beat) <= CLEF_CHANGE_BEAT_EPSILON
      ),
  );
  const renderedVoices = renderGroups.map((voiceGroup, renderGroupIndex) => {
    const clefNotes =
      renderGroupIndex === 0
        ? inlineClefChanges.map((change) => ({
            change,
            note: new ClefNote(change.clef, 'small'),
          }))
        : [];
    const notes = voiceGroup.events.map((event) => {
      const activeClef = getActiveClef(score, staff.id, measureIndex, event.beat);
      const effectiveStemDirection = getEffectiveStemDirection({
        clef: activeClef,
        event,
        hasMultipleVoices,
        voiceIndex: voiceGroup.voiceIndex,
      });
      const manualOrVoiceStemDirection =
        event.stemDirection ?? (hasMultipleVoices ? effectiveStemDirection : null);

      return createVexFlowNote(event, staff, {
        clef: activeClef,
        modifierDirection: effectiveStemDirection,
        stemDirection:
          manualOrVoiceStemDirection === 'up'
            ? Stem.UP
            : manualOrVoiceStemDirection === 'down'
              ? Stem.DOWN
              : undefined,
      });
    });
    const tuplets = createVexFlowTuplets(
      voiceGroup.events,
      notes,
      score,
      staff,
      measureIndex,
      hasMultipleVoices,
      voiceGroup.voiceIndex,
    );
    const pendingClefNotes = [...clefNotes];
    const tickables: Array<StaveNote | ClefNote> = [];

    voiceGroup.events.forEach((event, eventIndex) => {
      const clefNotesBeforeEvent = pendingClefNotes.filter(
        ({ change }) => change.beat <= event.beat + 0.0001,
      );

      tickables.push(...clefNotesBeforeEvent.map(({ note }) => note));
      pendingClefNotes.splice(0, clefNotesBeforeEvent.length);

      const note = notes[eventIndex];

      if (note) {
        tickables.push(note);
      }
    });
    tickables.push(...pendingClefNotes.map(({ note }) => note));

    return {
      ...voiceGroup,
      clefNotes,
      notes,
      tuplets,
      vexFlowVoice: new VexFlowVoice({
        beatValue: score.timeSignature.beatUnit,
        numBeats: score.timeSignature.beats,
      })
        .setMode(VexFlowVoice.Mode.SOFT)
        .addTickables(tickables),
    };
  });
  const shouldMaintainStemDirections =
    hasMultipleVoices ||
    renderedVoices.some(({ events }) =>
      events.some((event) => Boolean(event.stemDirection)),
    );
  const beams = renderedVoices.flatMap(({ notes }) =>
    Beam.generateBeams(notes, {
      beamRests: false,
      groups: Beam.getDefaultBeamGroups(
        `${score.timeSignature.beats}/${score.timeSignature.beatUnit}`,
      ),
      maintainStemDirections: shouldMaintainStemDirections,
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
  renderedVoices
    .flatMap(({ clefNotes }) => clefNotes)
    .forEach(({ change, note }) => {
      const svgElement = note.getClef().getSVGElement();

      if (svgElement) {
        tagRenderedClefChangeElement({
          change,
          element: svgElement,
          measureIndex,
          staffId: staff.id,
        });

        return;
      }

      const svg = (context as { svg?: SVGSVGElement }).svg;

      if (!svg) {
        return;
      }

      const clefText = document.createElementNS(SVG_NAMESPACE, 'text');
      const absoluteX = note.getAbsoluteX();
      const fallbackX = getBeatX(
        measureIndex,
        change.beat,
        beatsPerMeasure,
        score,
      );
      const x =
        Number.isFinite(absoluteX) && absoluteX > 0
          ? absoluteX
          : Math.max(getMeasureContentLeft(measureIndex, score), fallbackX - 14);

      clefText.textContent = String.fromCodePoint(
        CLEF_CHANGE_GLYPH_CODEPOINT[change.clef],
      );
      clefText.setAttribute('font-family', 'Bravura, Academico');
      clefText.setAttribute('font-size', '24pt');
      clefText.setAttribute('stroke', 'none');
      clefText.setAttribute('x', x.toFixed(2));
      clefText.setAttribute(
        'y',
        stave.getYForLine(CLEF_CHANGE_STAVE_LINE[change.clef]).toFixed(2),
      );
      tagRenderedClefChangeElement({
        change,
        element: clefText,
        measureIndex,
        staffId: staff.id,
      });
      svg.appendChild(clefText);
    });
  beams.forEach((beam) => beam.setContext(context).draw());
  renderedVoices
    .flatMap((voice) => voice.tuplets)
    .forEach(({ id, tuplet }) => {
      tuplet.setContext(context).draw();
      const svgElement = tuplet.getSVGElement();

      if (svgElement) {
        svgElement.setAttribute('data-testid', 'rendered-tuplet');
        svgElement.setAttribute('data-tuplet-id', id);
      }
    });

  return collectRenderedMeasureEventLayouts({
    beatsPerMeasure,
    measureIndex,
    noteRefs,
    renderedVoices,
    score,
    staff,
    staffIndex,
  });
}

function drawVexFlowStaves(
  container: HTMLDivElement,
  score: StaffRendererProps['score'],
  {
    fingeringHints,
    pageViewport,
  }: {
    fingeringHints?: StaffRendererProps['fingeringHints'];
    pageViewport?: StaffRendererProps['pageViewport'];
  } = {},
) {
  const staves = score.parts[0]?.staves ?? [];
  const height = pageViewport?.height ?? getScoreSvgHeight(score);
  const width = getScoreSvgWidth(score);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const visibleMeasureIndexes = pageViewport
    ? new Set(pageViewport.measureIndexes)
    : null;

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  const eventLayouts: Record<string, RenderedEventLayout> = {};
  const noteRefs = new Map<string, RenderedNoteRef>();
  const renderedStaves = staves.map((staff, staffIndex) =>
    staff.measures.map((measure) => {
      if (visibleMeasureIndexes && !visibleMeasureIndexes.has(measure.index)) {
        return null;
      }

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
        stave.addClef(getActiveClef(score, staff.id, measure.index, 0));
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
    svg.setAttribute('viewBox', `0 ${pageViewport?.y ?? 0} ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  }

  if (score.type === 'grand' && renderedStaves.length >= 2) {
    renderedStaves[0].forEach((trebleStave, measureIndex) => {
      if (!trebleStave) {
        return;
      }

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
      if (!stave) {
        return;
      }

      Object.assign(
        eventLayouts,
        drawVexFlowMeasureEvents({
          beatsPerMeasure,
          context,
          measureIndex,
          noteRefs,
          score,
          staff,
          staffIndex,
          stave,
        }),
      );
    });
  });

  drawVexFlowConnectionMarks(context, score, noteRefs);
  drawVexFlowExpressionMarks({ context, noteRefs, score });
  drawKeySignatureSymbols(container, score, visibleMeasureIndexes);
  drawSystemStartClefChangeMarkers(container, score, visibleMeasureIndexes);
  const annotationLayouts = drawTextAnnotations(
    container,
    score,
    eventLayouts,
    visibleMeasureIndexes,
  );
  drawFingeringHints(
    container,
    score,
    eventLayouts,
    annotationLayouts,
    fingeringHints ?? [],
    visibleMeasureIndexes,
  );
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

function syncVexFlowSelection(
  container: HTMLDivElement,
  selectedEventId?: string | null,
  selectedPitchIndex?: number | null,
  selectedClefChangeId?: string | null,
  activeEventId?: string | null,
  activeEventIds: readonly string[] = [],
  invalidMeasureKeys: readonly string[] = [],
  practiceFeedbackByEventId: StaffRendererProps['practiceFeedbackByEventId'] = {},
) {
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);
  const activeEventIdSet = new Set([
    ...activeEventIds,
    ...(activeEventId ? [activeEventId] : []),
  ]);

  container.querySelectorAll('.vf-user-event').forEach((element) => {
    const eventId = element.getAttribute('data-event-id');
    const practiceFeedbackStatus = eventId
      ? practiceFeedbackByEventId[eventId]
      : undefined;
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
    element.classList.toggle(
      'is-practice-correct',
      practiceFeedbackStatus === 'correct',
    );
    element.classList.toggle(
      'is-practice-partial',
      practiceFeedbackStatus === 'partial',
    );
    element.classList.toggle(
      'is-practice-wrong',
      practiceFeedbackStatus === 'wrong',
    );
    element.classList.toggle(
      'is-practice-missed',
      practiceFeedbackStatus === 'missed',
    );
    element.classList.toggle('is-invalid-measure', isInvalidMeasure);
  });

  container.querySelectorAll('.vf-user-notehead').forEach((element) => {
    const eventId = element.getAttribute('data-event-id');
    const practiceFeedbackStatus = eventId
      ? practiceFeedbackByEventId[eventId]
      : undefined;
    const pitchIndex = Number(element.getAttribute('data-pitch-index'));
    const isSelectedPitch =
      eventId === selectedEventId &&
      selectedPitchIndex !== null &&
      selectedPitchIndex !== undefined &&
      Number.isFinite(pitchIndex) &&
      pitchIndex === selectedPitchIndex;

    element.classList.toggle('is-selected-notehead', isSelectedPitch);
    element.classList.toggle(
      'is-practice-correct',
      practiceFeedbackStatus === 'correct',
    );
    element.classList.toggle(
      'is-practice-partial',
      practiceFeedbackStatus === 'partial',
    );
    element.classList.toggle(
      'is-practice-wrong',
      practiceFeedbackStatus === 'wrong',
    );
    element.classList.toggle(
      'is-practice-missed',
      practiceFeedbackStatus === 'missed',
    );
  });

  container.querySelectorAll('.sheetlab-clef-change').forEach((element) => {
    element.classList.toggle(
      'is-selected',
      element.getAttribute('data-clef-change-id') === selectedClefChangeId,
    );
  });
}

function escapeDataAttributeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function clearInsertPreviewNudge(container: HTMLDivElement) {
  container.querySelectorAll('.vf-insert-preview-nudge').forEach((element) => {
    if (!(element instanceof SVGElement)) {
      return;
    }

    element.classList.remove('vf-insert-preview-nudge');
    element.style.removeProperty('transform');
    element.style.removeProperty('transform-box');
    element.style.removeProperty('transform-origin');
  });
}

function syncInsertPreviewNudge(
  container: HTMLDivElement,
  props: StaffRendererProps,
  eventLayouts: Record<string, RenderedEventLayout>,
) {
  clearInsertPreviewNudge(container);

  if (props.placementMode !== 'insert' || !props.hoverPosition) {
    return;
  }

  const voiceIndex = props.voiceIndex ?? 0;
  const insertPosition = resolveInsertDisplayPosition({
    dots: props.dots ?? 0,
    duration: props.duration ?? 'quarter',
    eventLayouts,
    position: props.hoverPosition,
    score: props.score,
    voiceIndex,
  });
  const previewItems = getInsertPreviewItems({
    dots: props.dots ?? 0,
    duration: props.duration ?? 'quarter',
    eventLayouts,
    insertPosition,
    score: props.score,
    voiceIndex,
  });

  previewItems.forEach(({ event, shiftX }) => {
    container
      .querySelectorAll(
        `.vf-score-event[data-event-id="${escapeDataAttributeValue(event.id)}"]`,
      )
      .forEach((element) => {
        if (!(element instanceof SVGElement)) {
          return;
        }

        element.classList.add('vf-insert-preview-nudge');
        element.style.transform = `translateX(${shiftX}px)`;
        element.style.transformBox = 'fill-box';
        element.style.transformOrigin = 'center';
      });
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
  const pageHeight = props.pageViewport?.height ?? height;
  const width = getScoreSvgWidth(props.score);
  const isOverfullWidth = width > SVG_WIDTH;

  useEffect(() => {
    if (containerRef.current) {
      const {
        annotationLayouts: nextAnnotationLayouts,
        eventLayouts: nextEventLayouts,
        voiceZoneLayouts: nextVoiceZoneLayouts,
      } = drawVexFlowStaves(
        containerRef.current,
        props.score,
        {
          fingeringHints: props.showFingeringHints
            ? props.fingeringHints
            : [],
          pageViewport: props.pageViewport,
        },
      );
      setEventLayouts(nextEventLayouts);
      setAnnotationLayouts(nextAnnotationLayouts);
      setVoiceZoneLayouts(nextVoiceZoneLayouts);
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.selectedPitchIndex,
        props.selectedClefChangeId,
        props.activeEventId,
        props.activeEventIds,
        props.invalidMeasureKeys,
        props.practiceFeedbackByEventId,
      );
    }
  }, [
    props.fingeringHints,
    props.pageViewport,
    props.practiceFeedbackByEventId,
    props.score,
    props.showFingeringHints,
  ]);

  useEffect(() => {
    if (containerRef.current) {
      syncVexFlowSelection(
        containerRef.current,
        props.selectedEventId,
        props.selectedPitchIndex,
        props.selectedClefChangeId,
        props.activeEventId,
        props.activeEventIds,
        props.invalidMeasureKeys,
        props.practiceFeedbackByEventId,
      );
    }
  }, [
    eventLayouts,
    props.activeEventId,
    props.invalidMeasureKeys,
    props.practiceFeedbackByEventId,
    props.selectedClefChangeId,
    props.selectedEventId,
    props.selectedPitchIndex,
    props.activeEventIds,
  ]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    syncInsertPreviewNudge(containerRef.current, props, eventLayouts);

    return () => {
      if (containerRef.current) {
        clearInsertPreviewNudge(containerRef.current);
      }
    };
  }, [
    eventLayouts,
    props.dots,
    props.duration,
    props.hoverPosition,
    props.placementMode,
    props.score,
    props.voiceIndex,
  ]);

  return (
    <div
      className="vexflow-stage"
      data-testid="vexflow-renderer"
      style={{
        aspectRatio: `${width} / ${pageHeight}`,
        ...(isOverfullWidth
          ? {
              maxWidth: 'none',
              width: `${width}px`,
            }
          : null),
      }}
    >
      <div
        aria-hidden="true"
        className="vexflow-stage-spacer"
        style={{ paddingBottom: `${(pageHeight / width) * 100}%` }}
      />
      <div ref={containerRef} className="vexflow-output" aria-hidden="true" />
      <NotationOverlay
        activeEventId={props.activeEventId}
        activeEventIds={props.activeEventIds}
        rangeEventIds={props.rangeEventIds}
        clefChange={props.clefChange}
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
        onAnnotationOffsetChange={props.onAnnotationOffsetChange}
        onSelectAnnotation={props.onSelectAnnotation}
        onMoveEvent={props.onMoveEvent}
        onMoveClefChange={props.onMoveClefChange}
        onMoveKeySignatureSymbol={props.onMoveKeySignatureSymbol}
        onPlaceAtPosition={props.onPlaceAtPosition}
        onSelectMeasure={props.onSelectMeasure}
        onSelectEvent={props.onSelectEvent}
        onRangeEventPick={props.onRangeEventPick}
        onSelectClefChange={props.onSelectClefChange}
        playbackBeat={props.playbackBeat}
        pageViewport={props.pageViewport}
        placementMode={props.placementMode}
        score={props.score}
        selectedAnnotation={props.selectedAnnotation}
        selectedEventId={props.selectedEventId}
        selectedClefChangeId={props.selectedClefChangeId}
        selectedMeasure={props.selectedMeasure}
        selectedPitchIndex={props.selectedPitchIndex}
        showLayoutZones={props.showLayoutZones ?? false}
        showLyricMap={props.showLyricMap ?? false}
        svgHeight={pageHeight}
        svgWidth={width}
        voiceIndex={props.voiceIndex}
      />
    </div>
  );
}
