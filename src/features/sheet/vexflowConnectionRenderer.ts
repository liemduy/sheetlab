import {
  Curve,
  Renderer,
  StaveNote,
  StaveTie,
  Stem,
} from 'vexflow';
import { findScoreEventContext } from '../../domain/score/eventLookup';
import { isValidTieMark } from '../../domain/score/noteConnections';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import { getSystemIndex } from './layout';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SLUR_CONTROL_POINT_OFFSET = 16;
const SLUR_HEAD_X_SHIFT = 8;
const SLUR_HEAD_Y_SHIFT = 18;
const TIE_CONTROL_POINT_NEAR = 10;
const TIE_CONTROL_POINT_FAR = 14;
const TIE_HEAD_Y_SHIFT = 12;

export interface RenderedNoteRef {
  event: ScoreEvent;
  measureIndex: number;
  note: StaveNote;
  staffId: Staff['id'];
  staffIndex: number;
  voiceIndex: number;
}

function getScoreEventsById(score: Score) {
  const events = new Map<string, ScoreEvent>();

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          voice.events.forEach((event) => {
            events.set(event.id, event);
          });
        });
      });
    });
  });

  return events;
}

function getTieSideFromNote(note: StaveNote, voiceIndex: number) {
  const stemDirection = note.getStemDirection();

  if (stemDirection === Stem.DOWN) {
    return 'above';
  }

  if (stemDirection === Stem.UP) {
    return 'below';
  }

  return voiceIndex === 1 ? 'above' : 'below';
}

function getSlurSideFromNote(note: StaveNote, voiceIndex: number) {
  const stemDirection = note.getStemDirection();

  if (stemDirection === Stem.DOWN) {
    return 'above';
  }

  if (stemDirection === Stem.UP) {
    return 'below';
  }

  return voiceIndex === 1 ? 'below' : 'above';
}

function getVexFlowConnectionDirection(side: 'above' | 'below') {
  return side === 'above' ? Stem.DOWN : Stem.UP;
}

function getVexFlowCurveOpeningDirection(side: 'above' | 'below') {
  return side === 'above' ? 'down' : 'up';
}

function tagVexFlowConnectionElement({
  className,
  element,
  side,
  sourceId,
  targetId,
  testId,
}: {
  className: string;
  element: SVGElement | undefined;
  side: 'above' | 'below';
  sourceId: string;
  targetId: string;
  testId: string;
}) {
  if (!element) {
    return;
  }

  element.classList.add('sheetlab-connection-mark', className);
  element.setAttribute('data-connection-side', side);
  element.setAttribute('data-source-id', sourceId);
  element.setAttribute('data-target-id', targetId);
  element.setAttribute('data-testid', testId);
}

function drawVexFlowTie({
  context,
  firstIndexes,
  firstNote,
  lastIndexes,
  lastNote,
  side,
  sourceId,
  targetId,
}: {
  context: ReturnType<Renderer['getContext']>;
  firstIndexes: number[];
  firstNote?: StaveNote | null;
  lastIndexes: number[];
  lastNote?: StaveNote | null;
  side: 'above' | 'below';
  sourceId: string;
  targetId: string;
}) {
  try {
    const tie = new StaveTie({
      firstIndexes,
      firstNote,
      lastIndexes,
      lastNote,
    }).setDirection(getVexFlowConnectionDirection(side));

    tie.renderOptions.cp1 = TIE_CONTROL_POINT_NEAR;
    tie.renderOptions.cp2 = TIE_CONTROL_POINT_FAR;
    tie.renderOptions.yShift = TIE_HEAD_Y_SHIFT;
    tie.setContext(context).draw();
    tagVexFlowConnectionElement({
      className: 'connection-mark-tie',
      element: tie.getSVGElement(),
      side,
      sourceId,
      targetId,
      testId: 'rendered-tie',
    });
  } catch {
    // Invalid stale connection data should not take down the whole sheet render.
  }
}

function drawVexFlowSlur({
  context,
  from,
  side,
  sourceId,
  targetId,
  to,
}: {
  context: ReturnType<Renderer['getContext']>;
  from?: StaveNote;
  side: 'above' | 'below';
  sourceId: string;
  targetId: string;
  to?: StaveNote;
}) {
  try {
    const svg = (context as { svg?: SVGSVGElement }).svg;
    const existingChildren = svg ? new Set([...svg.children]) : null;
    const slur = new Curve(from, to, {
      cps: [
        { x: 0, y: SLUR_CONTROL_POINT_OFFSET },
        { x: 0, y: SLUR_CONTROL_POINT_OFFSET },
      ],
      openingDirection: getVexFlowCurveOpeningDirection(side),
      position: Curve.Position.NEAR_HEAD,
      positionEnd: Curve.Position.NEAR_HEAD,
      thickness: 2,
      xShift: SLUR_HEAD_X_SHIFT,
      yShift: SLUR_HEAD_Y_SHIFT,
    });

    slur.setContext(context).draw();
    const slurElement = slur.getSVGElement();

    if (slurElement) {
      tagVexFlowConnectionElement({
        className: 'connection-mark-slur',
        element: slurElement,
        side,
        sourceId,
        targetId,
        testId: 'rendered-slur',
      });
      return;
    }

    const curveElements =
      svg && existingChildren
        ? [...svg.children].filter(
            (element): element is SVGElement =>
              element instanceof SVGElement && !existingChildren.has(element),
          )
        : [];

    if (svg && curveElements.length > 0) {
      const group = document.createElementNS(SVG_NAMESPACE, 'g');

      svg.insertBefore(group, curveElements[0]);
      curveElements.forEach((element) => group.appendChild(element));
      tagVexFlowConnectionElement({
        className: 'connection-mark-slur',
        element: group,
        side,
        sourceId,
        targetId,
        testId: 'rendered-slur',
      });
    }
  } catch {
    // Invalid stale connection data should not take down the whole sheet render.
  }
}

export function drawVexFlowConnectionMarks(
  context: ReturnType<Renderer['getContext']>,
  score: Score,
  noteRefs: Map<string, RenderedNoteRef>,
) {
  const eventsById = getScoreEventsById(score);

  eventsById.forEach((event) => {
    const sourceRef = noteRefs.get(event.id);

    if (!sourceRef) {
      return;
    }

    (event.ties ?? []).forEach((tieMark) => {
      const sourceContext = findScoreEventContext(score, event.id);
      const targetRef = noteRefs.get(tieMark.targetEventId);

      if (
        !sourceContext ||
        !targetRef ||
        !isValidTieMark(score, sourceContext, tieMark)
      ) {
        return;
      }

      const side = getTieSideFromNote(sourceRef.note, sourceRef.voiceIndex);
      const sourceSystemIndex = getSystemIndex(sourceRef.measureIndex, score);
      const targetSystemIndex = getSystemIndex(targetRef.measureIndex, score);

      if (sourceSystemIndex === targetSystemIndex) {
        drawVexFlowTie({
          context,
          firstIndexes: [tieMark.pitchIndex],
          firstNote: sourceRef.note,
          lastIndexes: [tieMark.targetPitchIndex],
          lastNote: targetRef.note,
          side,
          sourceId: event.id,
          targetId: tieMark.targetEventId,
        });
        return;
      }

      drawVexFlowTie({
        context,
        firstIndexes: [tieMark.pitchIndex],
        firstNote: sourceRef.note,
        lastIndexes: [tieMark.pitchIndex],
        lastNote: null,
        side,
        sourceId: event.id,
        targetId: tieMark.targetEventId,
      });
      drawVexFlowTie({
        context,
        firstIndexes: [tieMark.targetPitchIndex],
        firstNote: null,
        lastIndexes: [tieMark.targetPitchIndex],
        lastNote: targetRef.note,
        side,
        sourceId: event.id,
        targetId: tieMark.targetEventId,
      });
    });

    (event.slurs ?? []).forEach((slurMark) => {
      const targetRef = noteRefs.get(slurMark.targetEventId);

      if (!targetRef) {
        return;
      }

      const side = getSlurSideFromNote(sourceRef.note, sourceRef.voiceIndex);
      const sourceSystemIndex = getSystemIndex(sourceRef.measureIndex, score);
      const targetSystemIndex = getSystemIndex(targetRef.measureIndex, score);

      if (sourceSystemIndex === targetSystemIndex) {
        drawVexFlowSlur({
          context,
          from: sourceRef.note,
          side,
          sourceId: event.id,
          targetId: slurMark.targetEventId,
          to: targetRef.note,
        });
        return;
      }

      drawVexFlowSlur({
        context,
        from: sourceRef.note,
        side,
        sourceId: event.id,
        targetId: slurMark.targetEventId,
      });
      drawVexFlowSlur({
        context,
        side,
        sourceId: event.id,
        targetId: slurMark.targetEventId,
        to: targetRef.note,
      });
    });
  });
}
