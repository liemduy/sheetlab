import {
  ModifierPosition,
  PedalMarking,
  Renderer,
  StaveHairpin,
  StaveLine,
  TextBracket,
} from 'vexflow';
import { isGeneratedRestEvent } from '../../domain/score/events';
import type {
  HairpinMark,
  RangeNotationMark,
  Score,
} from '../../domain/score/types';
import { getOttavaMarks } from '../../domain/score/ottava';
import {
  getMeasureCountForSystem,
  getMeasureWidth,
  getMeasureX,
  getSystemFirstMeasureIndex,
  getSystemIndex,
} from './layout';
import type { RenderedNoteRef } from './vexflowConnectionRenderer';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CROSS_SYSTEM_PEDAL_BRACKET_HEIGHT = 10;
const CROSS_SYSTEM_PEDAL_EDGE_PADDING = 12;
const ARPEGGIO_MIN_HEIGHT = 28;
const ARPEGGIO_NOTEHEAD_GAP = 10;
const ARPEGGIO_WAVE_STEP = 5;
const ARPEGGIO_WAVE_WIDTH = 4;

function tagGroupedVexFlowElements({
  className,
  context,
  dataset,
  draw,
}: {
  className: string;
  context: ReturnType<Renderer['getContext']>;
  dataset: Record<string, string>;
  draw: () => void;
}) {
  const svg = (context as { svg?: SVGSVGElement }).svg;
  const existingChildren = svg ? new Set([...svg.children]) : null;

  try {
    draw();
  } catch {
    return;
  }

  const elements =
    svg && existingChildren
      ? [...svg.children].filter(
          (element): element is SVGElement =>
            element instanceof SVGElement && !existingChildren.has(element),
        )
      : [];

  if (!svg || elements.length === 0) {
    return;
  }

  const group = document.createElementNS(SVG_NAMESPACE, 'g');

  group.classList.add(className);
  Object.entries(dataset).forEach(([key, value]) => {
    group.setAttribute(key, value);
  });
  svg.insertBefore(group, elements[0]);
  elements.forEach((element) => group.appendChild(element));
}

function getPlayableNoteRefsByVoice(noteRefs: Map<string, RenderedNoteRef>) {
  const groups = new Map<string, RenderedNoteRef[]>();

  noteRefs.forEach((ref) => {
    if (ref.event.kind === 'rest' || isGeneratedRestEvent(ref.event)) {
      return;
    }

    const key = `${ref.staffId}:${ref.voiceIndex}`;
    const refs = groups.get(key) ?? [];

    refs.push(ref);
    groups.set(key, refs);
  });

  groups.forEach((refs) => {
    refs.sort(
      (first, second) =>
        first.measureIndex - second.measureIndex ||
        first.event.beat - second.event.beat,
    );
  });

  return groups;
}

function getNextPlayableRef(refs: RenderedNoteRef[], sourceIndex: number) {
  return refs[sourceIndex + 1] ?? null;
}

function getHairpinType(hairpin: HairpinMark | undefined) {
  if (!hairpin) {
    return null;
  }

  return hairpin === 'crescendo'
    ? StaveHairpin.type.CRESC
    : StaveHairpin.type.DECRESC;
}

function drawHairpin({
  context,
  hairpin,
  sourceRef,
  targetRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  hairpin?: HairpinMark;
  sourceRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
}) {
  const activeHairpin = hairpin ?? sourceRef.event.hairpin;
  const hairpinType = getHairpinType(activeHairpin);

  if (!activeHairpin || !hairpinType) {
    return;
  }

  tagGroupedVexFlowElements({
    className: 'sheetlab-hairpin',
    context,
    dataset: {
      'data-event-id': sourceRef.event.id,
      'data-hairpin': activeHairpin,
      'data-source-id': sourceRef.event.id,
      'data-target-id': targetRef.event.id,
      'data-testid': 'rendered-hairpin',
    },
    draw: () => {
      new StaveHairpin(
        {
          firstNote: sourceRef.note,
          lastNote: targetRef.note,
        },
        hairpinType,
      )
        .setPosition(ModifierPosition.BELOW)
        .setRenderOptions({
          height: 10,
          leftShiftPx: 8,
          rightShiftPx: -8,
          yShift: 12,
        })
        .setContext(context)
        .draw();
    },
  });
}

function getHairpinAnchorX(ref: RenderedNoteRef) {
  return ref.note.getModifierStartXY(ModifierPosition.BELOW, 0).x;
}

function drawHairpinSegment({
  context,
  continuation,
  firstX,
  hairpin,
  lastX,
  sourceRef,
  systemRef,
  targetRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  continuation: 'start' | 'end';
  firstX: number;
  hairpin?: HairpinMark;
  lastX: number;
  sourceRef: RenderedNoteRef;
  systemRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
}) {
  const activeHairpin = hairpin ?? sourceRef.event.hairpin;
  const hairpinType = getHairpinType(activeHairpin);

  if (!activeHairpin || !hairpinType || lastX - firstX < 4) {
    return;
  }

  const stave = systemRef.note.checkStave();

  tagGroupedVexFlowElements({
    className: 'sheetlab-hairpin',
    context,
    dataset: {
      'data-continuation': continuation,
      'data-event-id': sourceRef.event.id,
      'data-hairpin': activeHairpin,
      'data-source-id': sourceRef.event.id,
      'data-target-id': targetRef.event.id,
      'data-testid': 'rendered-hairpin',
    },
    draw: () => {
      new StaveHairpin(
        {
          firstNote: systemRef.note,
          lastNote: systemRef.note,
        },
        hairpinType,
      )
        .setPosition(ModifierPosition.BELOW)
        .setRenderOptions({
          height: 10,
          leftShiftPx: 0,
          rightShiftPx: 0,
          yShift: 12,
        })
        .setContext(context)
        .renderHairpin({
          firstX,
          firstY: stave.getY() + stave.getHeight(),
          lastX,
          lastY: stave.getY() + stave.getHeight(),
          staffHeight: stave.getHeight(),
        });
    },
  });
}

function drawCrossSystemHairpin({
  context,
  hairpin,
  sourceRef,
  targetRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  hairpin?: HairpinMark;
  sourceRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
}) {
  const sourceStave = sourceRef.note.checkStave();
  const targetStave = targetRef.note.checkStave();
  const sourceStartX = getHairpinAnchorX(sourceRef) + 8;
  const sourceEndX = sourceStave.getX() + sourceStave.getWidth() - 14;
  const targetStartX = targetStave.getX() + 14;
  const targetEndX = getHairpinAnchorX(targetRef) - 8;

  drawHairpinSegment({
    context,
    continuation: 'start',
    firstX: sourceStartX,
    hairpin,
    lastX: sourceEndX,
    sourceRef,
    systemRef: sourceRef,
    targetRef,
  });
  drawHairpinSegment({
    context,
    continuation: 'end',
    firstX: targetStartX,
    hairpin,
    lastX: targetEndX,
    sourceRef,
    systemRef: targetRef,
    targetRef,
  });
}

function drawGlissando({
  context,
  sourceRef,
  targetRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  sourceRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
}) {
  if (!sourceRef.event.glissando) {
    return;
  }

  tagGroupedVexFlowElements({
    className: 'sheetlab-glissando',
    context,
    dataset: {
      'data-event-id': sourceRef.event.id,
      'data-testid': 'rendered-glissando',
    },
    draw: () => {
      const line = new StaveLine({
        firstIndexes: [0],
        firstNote: sourceRef.note,
        lastIndexes: [0],
        lastNote: targetRef.note,
      });

      line.renderOptions.color = '#111111';
      line.renderOptions.lineDash = [3, 3];
      line.renderOptions.lineWidth = 1.1;
      line.renderOptions.paddingLeft = 8;
      line.renderOptions.paddingRight = 8;
      line.setContext(context).draw();
    },
  });
}

function formatSvgNumber(value: number) {
  return Number(value.toFixed(2));
}

function createArpeggioPathData({
  bottomY,
  topY,
  x,
}: {
  bottomY: number;
  topY: number;
  x: number;
}) {
  const commands = [`M ${formatSvgNumber(x)} ${formatSvgNumber(topY)}`];
  let direction = 1;
  let y = topY;

  while (y < bottomY) {
    const nextY = Math.min(y + ARPEGGIO_WAVE_STEP, bottomY);
    const firstControlY = y + (nextY - y) / 3;
    const secondControlY = y + ((nextY - y) * 2) / 3;
    const controlX = x + direction * ARPEGGIO_WAVE_WIDTH;

    commands.push(
      [
        'C',
        formatSvgNumber(controlX),
        formatSvgNumber(firstControlY),
        formatSvgNumber(controlX),
        formatSvgNumber(secondControlY),
        formatSvgNumber(x),
        formatSvgNumber(nextY),
      ].join(' '),
    );
    y = nextY;
    direction *= -1;
  }

  return commands.join(' ');
}

function getArpeggioYRange(ref: RenderedNoteRef) {
  const noteYs = ref.note.getYs().filter((value) => Number.isFinite(value));

  if (noteYs.length === 0) {
    const stave = ref.note.checkStave();
    const centerY = stave.getYForLine(2);

    return {
      bottomY: centerY + ARPEGGIO_MIN_HEIGHT / 2,
      topY: centerY - ARPEGGIO_MIN_HEIGHT / 2,
    };
  }

  const minY = Math.min(...noteYs);
  const maxY = Math.max(...noteYs);
  const centerY = (minY + maxY) / 2;
  const halfHeight = Math.max(
    ARPEGGIO_MIN_HEIGHT / 2,
    (maxY - minY) / 2 + ARPEGGIO_NOTEHEAD_GAP,
  );

  return {
    bottomY: centerY + halfHeight,
    topY: centerY - halfHeight,
  };
}

function getArpeggioX(ref: RenderedNoteRef) {
  const noteHeadBeginX = ref.note.getNoteHeadBeginX();

  if (Number.isFinite(noteHeadBeginX)) {
    return noteHeadBeginX - ARPEGGIO_NOTEHEAD_GAP;
  }

  return ref.note.getAbsoluteX() - ARPEGGIO_NOTEHEAD_GAP;
}

function drawArpeggios({
  context,
  noteRefs,
}: {
  context: ReturnType<Renderer['getContext']>;
  noteRefs: Map<string, RenderedNoteRef>;
}) {
  const svg = (context as { svg?: SVGSVGElement }).svg;

  if (!svg) {
    return;
  }

  noteRefs.forEach((ref) => {
    if (ref.event.kind === 'rest' || !ref.event.arpeggio) {
      return;
    }

    const { bottomY, topY } = getArpeggioYRange(ref);
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    const path = document.createElementNS(SVG_NAMESPACE, 'path');

    group.classList.add('sheetlab-arpeggio');
    group.setAttribute('data-event-id', ref.event.id);
    group.setAttribute('data-testid', 'rendered-arpeggio');
    path.setAttribute(
      'd',
      createArpeggioPathData({
        bottomY,
        topY,
        x: getArpeggioX(ref),
      }),
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#111111');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-width', '1.15');
    group.appendChild(path);
    svg.appendChild(group);
  });
}

function appendPedalContinuationSegment({
  context,
  continuation,
  firstX,
  lastX,
  sourceRef,
  targetRef,
  systemRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  continuation: 'start' | 'end';
  firstX: number;
  lastX: number;
  sourceRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
  systemRef: RenderedNoteRef;
}) {
  const svg = (context as { svg?: SVGSVGElement }).svg;

  if (!svg || lastX - firstX < 8) {
    return;
  }

  const stave = systemRef.note.checkStave();
  const y = stave.getYForBottomText(3);
  const topY = y - CROSS_SYSTEM_PEDAL_BRACKET_HEIGHT;
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');

  group.classList.add('sheetlab-pedal-line');
  group.setAttribute('data-continuation', continuation);
  group.setAttribute('data-source-id', sourceRef.event.id);
  group.setAttribute('data-target-id', targetRef.event.id);
  group.setAttribute('data-testid', 'rendered-pedal-line');
  path.setAttribute(
    'd',
    [
      `M ${formatSvgNumber(firstX)} ${formatSvgNumber(topY)}`,
      `L ${formatSvgNumber(firstX)} ${formatSvgNumber(y)}`,
      `L ${formatSvgNumber(lastX)} ${formatSvgNumber(y)}`,
      `L ${formatSvgNumber(lastX)} ${formatSvgNumber(topY)}`,
    ].join(' '),
  );
  group.appendChild(path);
  svg.appendChild(group);
}

function getPedalAnchorX(ref: RenderedNoteRef) {
  return ref.note.getModifierStartXY(ModifierPosition.BELOW, 0).x;
}

function getScoreMeasureCount(score: Score) {
  return score.parts[0]?.staves[0]?.measures.length ?? 0;
}

function getSystemContinuationStartX(measureIndex: number, score: Score) {
  return (
    getMeasureX(getSystemFirstMeasureIndex(measureIndex, score), score) +
    CROSS_SYSTEM_PEDAL_EDGE_PADDING
  );
}

function getSystemContinuationEndX(measureIndex: number, score: Score) {
  const systemIndex = getSystemIndex(measureIndex, score);
  const firstMeasureIndex = getSystemFirstMeasureIndex(measureIndex, score);
  const measureCount = getMeasureCountForSystem(
    getScoreMeasureCount(score),
    systemIndex,
    score,
  );
  const lastMeasureIndex = firstMeasureIndex + Math.max(0, measureCount - 1);

  return (
    getMeasureX(lastMeasureIndex, score) +
    getMeasureWidth(lastMeasureIndex, score) -
    CROSS_SYSTEM_PEDAL_EDGE_PADDING
  );
}

function drawCrossSystemPedalBracket({
  context,
  score,
  sourceRef,
  targetRef,
}: {
  context: ReturnType<Renderer['getContext']>;
  score: Score;
  sourceRef: RenderedNoteRef;
  targetRef: RenderedNoteRef;
}) {
  appendPedalContinuationSegment({
    context,
    continuation: 'start',
    firstX: getPedalAnchorX(sourceRef),
    lastX: getSystemContinuationEndX(sourceRef.measureIndex, score),
    sourceRef,
    systemRef: sourceRef,
    targetRef,
  });
  appendPedalContinuationSegment({
    context,
    continuation: 'end',
    firstX: getSystemContinuationStartX(targetRef.measureIndex, score),
    lastX: getPedalAnchorX(targetRef),
    sourceRef,
    systemRef: targetRef,
    targetRef,
  });
}

function drawPedalBrackets({
  context,
  refs,
  score,
}: {
  context: ReturnType<Renderer['getContext']>;
  refs: RenderedNoteRef[];
  score: Score;
}) {
  let activeStartRef: RenderedNoteRef | null = null;
  const usesPedalLine = (ref: RenderedNoteRef) => ref.event.pedalLine !== false;

  refs.forEach((ref) => {
    const pedal = ref.event.pedal;

    if (!pedal) {
      return;
    }

    if (pedal === 'start') {
      activeStartRef = usesPedalLine(ref) ? ref : null;
      return;
    }

    if (
      (pedal === 'release' || pedal === 'start-release') &&
      activeStartRef &&
      usesPedalLine(ref)
    ) {
      const sourceSystemIndex = getSystemIndex(activeStartRef.measureIndex, score);
      const targetSystemIndex = getSystemIndex(ref.measureIndex, score);

      if (sourceSystemIndex === targetSystemIndex) {
        const sourceRef = activeStartRef;

        tagGroupedVexFlowElements({
          className: 'sheetlab-pedal-line',
          context,
          dataset: {
            'data-source-id': sourceRef.event.id,
            'data-target-id': ref.event.id,
            'data-testid': 'rendered-pedal-line',
          },
          draw: () => {
            PedalMarking.createSustain([sourceRef.note, ref.note])
              .setType(PedalMarking.type.BRACKET)
              .setLine(0)
              .setContext(context)
              .draw();
          },
        });
      } else {
        drawCrossSystemPedalBracket({
          context,
          score,
          sourceRef: activeStartRef,
          targetRef: ref,
        });
      }
    }

    activeStartRef = pedal === 'start-release' && usesPedalLine(ref) ? ref : null;
  });
}

function getRangeHairpinMarks(score: Score) {
  return (score.marks ?? []).filter(
    (mark): mark is RangeNotationMark =>
      mark.scope === 'range' && mark.kind === 'hairpin' && Boolean(mark.hairpin),
  );
}

function drawRangeHairpins({
  context,
  noteRefs,
  score,
}: {
  context: ReturnType<Renderer['getContext']>;
  noteRefs: Map<string, RenderedNoteRef>;
  score: Score;
}) {
  getRangeHairpinMarks(score).forEach((mark) => {
    if (!mark.sourceEventId || !mark.targetEventId || !mark.hairpin) {
      return;
    }

    const sourceRef = noteRefs.get(mark.sourceEventId);
    const targetRef = noteRefs.get(mark.targetEventId);

    if (!sourceRef || !targetRef) {
      return;
    }

    if (getSystemIndex(sourceRef.measureIndex, score) === getSystemIndex(targetRef.measureIndex, score)) {
      drawHairpin({
        context,
        hairpin: mark.hairpin,
        sourceRef,
        targetRef,
      });
      return;
    }

    drawCrossSystemHairpin({
      context,
      hairpin: mark.hairpin,
      sourceRef,
      targetRef,
    });
  });
}

function getRangeHairpinSourceIds(score: Score) {
  return new Set(
    getRangeHairpinMarks(score).flatMap((mark) =>
      mark.sourceEventId ? [mark.sourceEventId] : [],
    ),
  );
}

function drawOttavaBrackets({
  context,
  noteRefs,
  score,
}: {
  context: ReturnType<Renderer['getContext']>;
  noteRefs: Map<string, RenderedNoteRef>;
  score: Score;
}) {
  getOttavaMarks(score).forEach((mark) => {
    if (!mark.sourceEventId || !mark.targetEventId || !mark.ottava) {
      return;
    }

    const sourceRef = noteRefs.get(mark.sourceEventId);
    const targetRef = noteRefs.get(mark.targetEventId);

    if (!sourceRef || !targetRef) {
      return;
    }

    if (getSystemIndex(sourceRef.measureIndex, score) !== getSystemIndex(targetRef.measureIndex, score)) {
      return;
    }

    tagGroupedVexFlowElements({
      className: 'sheetlab-ottava',
      context,
      dataset: {
        'data-ottava': mark.ottava,
        'data-source-id': sourceRef.event.id,
        'data-target-id': targetRef.event.id,
        'data-testid': 'rendered-ottava',
      },
      draw: () => {
        const textBracket = new TextBracket({
          position:
            mark.placement === 'below'
              ? TextBracket.Position.BOTTOM
              : TextBracket.Position.TOP,
          start: sourceRef.note,
          stop: targetRef.note,
          text: mark.ottava,
        });

        textBracket
          .setDashed(true, [4, 3])
          .setLine(mark.placement === 'below' ? 2 : 1)
          .setContext(context)
          .draw();
      },
    });
  });
}

export function drawVexFlowExpressionMarks({
  context,
  noteRefs,
  score,
}: {
  context: ReturnType<Renderer['getContext']>;
  noteRefs: Map<string, RenderedNoteRef>;
  score: Score;
}) {
  const refsByVoice = getPlayableNoteRefsByVoice(noteRefs);
  const rangeHairpinSourceIds = getRangeHairpinSourceIds(score);

  drawArpeggios({ context, noteRefs });
  drawRangeHairpins({ context, noteRefs, score });

  refsByVoice.forEach((refs) => {
    refs.forEach((ref, refIndex) => {
      if (rangeHairpinSourceIds.has(ref.event.id)) {
        return;
      }

      const targetRef = getNextPlayableRef(refs, refIndex);

      if (targetRef) {
        if (
          getSystemIndex(ref.measureIndex, score) ===
          getSystemIndex(targetRef.measureIndex, score)
        ) {
          drawHairpin({ context, sourceRef: ref, targetRef });
          drawGlissando({ context, sourceRef: ref, targetRef });
          return;
        }

        drawCrossSystemHairpin({ context, sourceRef: ref, targetRef });
      }
    });

    drawPedalBrackets({ context, refs, score });
  });

  drawOttavaBrackets({ context, noteRefs, score });
}
