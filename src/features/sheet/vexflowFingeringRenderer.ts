import type { Score, StaffId } from '../../domain/score/types';
import type { FingeringHint } from '../fingering/fingeringHints';
import {
  STAFF_OUTSIDE_ANNOTATION_GAP,
  type AnnotationBounds,
  type AnnotationPlacement,
  doAnnotationBoundsOverlap,
  moveAnnotationBounds,
  moveAnnotationBoundsY,
} from './annotationLayoutPolicy';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
  getSystemIndex,
} from './layout';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';
import {
  getRenderedEventInkBounds,
  getRenderedSystemStaffSymbolInkBounds,
} from './renderedVoiceZones';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FINGERING_RADIUS = 7.2;
const FINGERING_BOUNDS_PADDING = 1.6;
const FINGERING_LEADER_NOTE_INSET = 6;
const FINGERING_LEADER_MIN_LENGTH = 7;
const FINGERING_NOTE_GAP = 20;
const FINGERING_STAFF_GAP_ABOVE = 19;
const FINGERING_STAFF_GAP_BELOW = 19;
const FINGERING_CLUSTER_SPACING = 18;
const FINGERING_ROW_GAP = 18;
const MAX_FINGERING_ROW_ATTEMPTS = 3;
const FINGERING_DODGE_X_OFFSETS = [0, -18, 18, -36, 36, -54, 54];

type FingeringSide = 'above' | 'below';

interface FingeringSystemState {
  abovePlacements: AnnotationPlacement[];
  belowPlacements: AnnotationPlacement[];
  blockers: AnnotationBounds[];
  staffBounds: Pick<AnnotationBounds, 'maxY' | 'minY'>;
}

interface FingeringRenderItem {
  anchorX: number;
  anchorY: number;
  centerX: number;
  centerY: number;
  hint: FingeringHint;
}

function getStaffIndex(score: Score, staffId: StaffId) {
  const staves = score.parts[0]?.staves ?? [];
  const staffIndex = staves.findIndex((staff) => staff.id === staffId);

  return staffIndex >= 0 ? staffIndex : 0;
}

function getHintCenterY({
  hint,
  layout,
  score,
}: {
  hint: FingeringHint;
  layout: RenderedEventLayout;
  score: Score;
}) {
  const pitchLayout = layout.pitchLayouts[hint.pitchIndex];
  const pitchY = pitchLayout?.y ?? layout.y;
  const staffIndex = getStaffIndex(score, hint.staffId);
  const staffTop = getScoreStaffTop(score, staffIndex, hint.measureIndex);
  const staffBottom = staffTop + STAFF_LINE_SPACING * 4;

  if (hint.hand === 'right') {
    return Math.min(
      pitchY - FINGERING_NOTE_GAP,
      staffTop - FINGERING_STAFF_GAP_ABOVE,
    );
  }

  return Math.max(
    pitchY + FINGERING_NOTE_GAP,
    staffBottom + FINGERING_STAFF_GAP_BELOW,
  );
}

function getFingeringBounds({
  centerX,
  centerY,
}: Pick<FingeringRenderItem, 'centerX' | 'centerY'>): AnnotationBounds {
  const radius = FINGERING_RADIUS + FINGERING_BOUNDS_PADDING;

  return {
    maxX: centerX + radius,
    maxY: centerY + radius,
    minX: centerX - radius,
    minY: centerY - radius,
  };
}

function combineBounds(bounds: readonly AnnotationBounds[]) {
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce<AnnotationBounds>(
    (combined, candidate) => ({
      maxX: Math.max(combined.maxX, candidate.maxX),
      maxY: Math.max(combined.maxY, candidate.maxY),
      minX: Math.min(combined.minX, candidate.minX),
      minY: Math.min(combined.minY, candidate.minY),
    }),
    bounds[0],
  );
}

function getSideForHint(hint: FingeringHint): FingeringSide {
  return hint.hand === 'right' ? 'above' : 'below';
}

function keepFingeringOutsideStaff(
  placement: AnnotationPlacement,
  staffBounds: Pick<AnnotationBounds, 'maxY' | 'minY'>,
) {
  if (placement.side === 'above') {
    const maxAllowedY = staffBounds.minY - STAFF_OUTSIDE_ANNOTATION_GAP;

    return placement.maxY > maxAllowedY
      ? moveAnnotationBounds(placement, {
          x: 0,
          y: maxAllowedY - placement.maxY,
        })
      : placement;
  }

  const minAllowedY = staffBounds.maxY + STAFF_OUTSIDE_ANNOTATION_GAP;

  return placement.minY < minAllowedY
    ? moveAnnotationBounds(placement, {
        x: 0,
        y: minAllowedY - placement.minY,
      })
    : placement;
}

function getPlacementBucket(
  state: FingeringSystemState,
  side: FingeringSide,
) {
  return side === 'above' ? state.abovePlacements : state.belowPlacements;
}

function placeFingeringGroup({
  preferredBounds,
  side,
  state,
}: {
  preferredBounds: AnnotationBounds;
  side: FingeringSide;
  state: FingeringSystemState;
}) {
  const placements = getPlacementBucket(state, side);
  const rowDirection = side === 'below' ? 1 : -1;

  for (let row = 0; row < MAX_FINGERING_ROW_ATTEMPTS; row += 1) {
    for (const dodgeX of FINGERING_DODGE_X_OFFSETS) {
      const rowBounds = moveAnnotationBounds(
        moveAnnotationBoundsY(
          preferredBounds,
          rowDirection * row * FINGERING_ROW_GAP,
        ),
        { x: dodgeX, y: 0 },
      );
      const placement = keepFingeringOutsideStaff(
        {
          ...rowBounds,
          row,
          side,
        },
        state.staffBounds,
      );
      const hasCollision = [...state.blockers, ...placements].some((blocker) =>
        doAnnotationBoundsOverlap(placement, blocker),
      );

      if (!hasCollision) {
        placements.push(placement);
        return placement;
      }
    }
  }

  const fallbackBounds = moveAnnotationBoundsY(
    preferredBounds,
    rowDirection * MAX_FINGERING_ROW_ATTEMPTS * FINGERING_ROW_GAP,
  );
  const fallbackPlacement = keepFingeringOutsideStaff(
    {
      ...fallbackBounds,
      row: MAX_FINGERING_ROW_ATTEMPTS,
      side,
    },
    state.staffBounds,
  );

  placements.push(fallbackPlacement);
  return fallbackPlacement;
}

function getSvgRectBounds(rect: Element): AnnotationBounds | null {
  const x = Number(rect.getAttribute('x'));
  const y = Number(rect.getAttribute('y'));
  const width = Number(rect.getAttribute('width'));
  const height = Number(rect.getAttribute('height'));

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    maxX: x + width,
    maxY: y + height,
    minX: x,
    minY: y,
  };
}

function getExistingSvgBlockers(svg: SVGSVGElement): AnnotationBounds[] {
  const sectionMarkerBounds = [
    ...svg.querySelectorAll('.sheetlab-section-marker rect'),
  ]
    .map(getSvgRectBounds)
    .filter((bounds): bounds is AnnotationBounds => Boolean(bounds));
  const tempoBounds = [...svg.querySelectorAll('.sheetlab-tempo-mark')]
    .map((element) => {
      const x = Number(element.getAttribute('x'));
      const y = Number(element.getAttribute('y'));
      const text = element.textContent ?? '';

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return {
        maxX: x + Math.max(78, text.length * 7.4),
        maxY: y + 5,
        minX: x - 3,
        minY: y - 18,
      } satisfies AnnotationBounds;
    })
    .filter((bounds): bounds is AnnotationBounds => Boolean(bounds));

  return [...sectionMarkerBounds, ...tempoBounds];
}

function createFingeringTitle(hint: FingeringHint) {
  const handLabel = hint.hand === 'right' ? 'Right hand' : 'Left hand';

  return `${handLabel} ${hint.finger} (${hint.confidence})`;
}

function appendFingeringHint({
  anchorX,
  anchorY,
  centerX,
  centerY,
  hint,
  svg,
}: {
  anchorX: number;
  anchorY: number;
  centerX: number;
  centerY: number;
  hint: FingeringHint;
  svg: SVGSVGElement;
}) {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  const leader = document.createElementNS(SVG_NAMESPACE, 'line');
  const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  const title = document.createElementNS(SVG_NAMESPACE, 'title');
  const leaderVectorX = anchorX - centerX;
  const leaderVectorY = anchorY - centerY;
  const leaderLength = Math.hypot(leaderVectorX, leaderVectorY);

  group.classList.add(
    'sheetlab-fingering-hint',
    `sheetlab-fingering-hint-${hint.hand}`,
  );
  group.setAttribute('data-confidence', hint.confidence);
  group.setAttribute('data-event-id', hint.eventId);
  group.setAttribute('data-finger', String(hint.finger));
  group.setAttribute('data-hand', hint.hand);
  group.setAttribute('data-midi-note', String(hint.midiNote));
  group.setAttribute('data-pitch-index', String(hint.pitchIndex));
  group.setAttribute('data-reason-codes', hint.reasonCodes.join(' '));
  group.setAttribute('data-testid', 'rendered-fingering-hint');
  title.textContent = createFingeringTitle(hint);

  if (leaderLength > FINGERING_LEADER_MIN_LENGTH) {
    const unitX = leaderVectorX / leaderLength;
    const unitY = leaderVectorY / leaderLength;

    leader.classList.add('sheetlab-fingering-leader');
    leader.setAttribute('data-testid', 'rendered-fingering-leader');
    leader.setAttribute(
      'x1',
      (centerX + unitX * FINGERING_RADIUS).toFixed(2),
    );
    leader.setAttribute(
      'y1',
      (centerY + unitY * FINGERING_RADIUS).toFixed(2),
    );
    leader.setAttribute(
      'x2',
      (anchorX - unitX * FINGERING_LEADER_NOTE_INSET).toFixed(2),
    );
    leader.setAttribute(
      'y2',
      (anchorY - unitY * FINGERING_LEADER_NOTE_INSET).toFixed(2),
    );
  }

  circle.setAttribute('cx', centerX.toFixed(2));
  circle.setAttribute('cy', centerY.toFixed(2));
  circle.setAttribute('r', String(FINGERING_RADIUS));

  text.setAttribute('x', centerX.toFixed(2));
  text.setAttribute('y', (centerY + 3.55).toFixed(2));
  text.textContent = String(hint.finger);

  group.appendChild(title);
  if (leaderLength > FINGERING_LEADER_MIN_LENGTH) {
    group.appendChild(leader);
  }
  group.appendChild(circle);
  group.appendChild(text);
  svg.appendChild(group);
}

export function drawFingeringHints(
  container: HTMLDivElement,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
  annotationLayouts: readonly RenderedAnnotationLayout[],
  fingeringHints: readonly FingeringHint[],
  visibleMeasureIndexes?: ReadonlySet<number> | null,
) {
  const svg = container.querySelector('svg');

  if (!svg || fingeringHints.length === 0) {
    return;
  }

  const hintsByEventId = new Map<string, FingeringHint[]>();
  const systemStates = new Map<string, FingeringSystemState>();
  const svgBlockers = getExistingSvgBlockers(svg);

  const getSystemState = (
    staffId: StaffId,
    measureIndex: number,
  ): FingeringSystemState => {
    const staffIndex = getStaffIndex(score, staffId);
    const systemIndex = getSystemIndex(measureIndex, score);
    const key = `${staffId}:${systemIndex}`;
    const existingState = systemStates.get(key);

    if (existingState) {
      return existingState;
    }

    const staffTop = getScoreStaffTop(score, staffIndex, measureIndex);
    const staffBounds = {
      maxY: staffTop + STAFF_LINE_SPACING * 4,
      minY: staffTop,
    };
    const annotationBlockers = annotationLayouts
      .filter(
        (layout) =>
          layout.staffId === staffId &&
          getSystemIndex(layout.measureIndex, score) === systemIndex,
      )
      .map((layout) => ({
        maxX: layout.maxX,
        maxY: layout.maxY,
        minX: layout.minX,
        minY: layout.minY,
      }));
    const eventInkBlockers = Object.values(eventLayouts)
      .filter(
        (layout) =>
          layout.staffId === staffId &&
          getSystemIndex(layout.measureIndex, score) === systemIndex &&
          !layout.isGeneratedRest,
      )
      .map(getRenderedEventInkBounds);
    const nextState = {
      abovePlacements: [],
      belowPlacements: [],
      blockers: [
        ...eventInkBlockers,
        ...annotationBlockers,
        ...getRenderedSystemStaffSymbolInkBounds(score, staffIndex, systemIndex),
        ...svgBlockers,
      ],
      staffBounds,
    } satisfies FingeringSystemState;

    systemStates.set(key, nextState);
    return nextState;
  };

  fingeringHints.forEach((hint) => {
    if (
      visibleMeasureIndexes &&
      !visibleMeasureIndexes.has(hint.measureIndex)
    ) {
      return;
    }

    const layout = eventLayouts[hint.eventId];

    if (!layout || getSystemIndex(layout.measureIndex, score) !== getSystemIndex(hint.measureIndex, score)) {
      return;
    }

    const hints = hintsByEventId.get(hint.eventId) ?? [];

    hints.push(hint);
    hintsByEventId.set(hint.eventId, hints);
  });

  [...hintsByEventId.entries()]
    .sort(([firstEventId], [secondEventId]) => {
      const firstLayout = eventLayouts[firstEventId];
      const secondLayout = eventLayouts[secondEventId];

      if (!firstLayout || !secondLayout) {
        return firstEventId.localeCompare(secondEventId);
      }

      if (firstLayout.measureIndex !== secondLayout.measureIndex) {
        return firstLayout.measureIndex - secondLayout.measureIndex;
      }

      if (firstLayout.staffId !== secondLayout.staffId) {
        return firstLayout.staffId.localeCompare(secondLayout.staffId);
      }

      return firstLayout.beat - secondLayout.beat;
    })
    .forEach(([eventId, eventHints]) => {
    const layout = eventLayouts[eventId];

    if (!layout) {
      return;
    }

    const sortedHints = [...eventHints].sort((a, b) => {
      if (a.midiNote !== b.midiNote) {
        return a.midiNote - b.midiNote;
      }

      return a.pitchIndex - b.pitchIndex;
    });
    const pitchXs = sortedHints
      .map((hint) => layout.pitchLayouts[hint.pitchIndex]?.x)
      .filter((x): x is number => Number.isFinite(x));
    const shouldFanCluster =
      sortedHints.length > 1 &&
      (pitchXs.length === 0 || Math.max(...pitchXs) - Math.min(...pitchXs) < 10);
    const items = sortedHints.map((hint, hintIndex) => {
      const pitchLayout = layout.pitchLayouts[hint.pitchIndex];
      const fanOffset = shouldFanCluster
        ? (hintIndex - (sortedHints.length - 1) / 2) * FINGERING_CLUSTER_SPACING
        : 0;

      return {
        anchorX: pitchLayout?.x ?? layout.x,
        anchorY: pitchLayout?.y ?? layout.y,
        centerX: (pitchLayout?.x ?? layout.x) + fanOffset,
        centerY: getHintCenterY({ hint, layout, score }),
        hint,
      } satisfies FingeringRenderItem;
    });
    const preferredBounds = combineBounds(items.map(getFingeringBounds));

    if (!preferredBounds) {
      return;
    }

    const side = getSideForHint(items[0]?.hint ?? sortedHints[0]);
    const placement = placeFingeringGroup({
      preferredBounds,
      side,
      state: getSystemState(layout.staffId as StaffId, layout.measureIndex),
    });
    const deltaX = placement.minX - preferredBounds.minX;
    const deltaY = placement.minY - preferredBounds.minY;

    items.forEach(({ anchorX, anchorY, centerX, centerY, hint }) => {
      appendFingeringHint({
        anchorX,
        anchorY,
        centerX: centerX + deltaX,
        centerY: centerY + deltaY,
        hint,
        svg,
      });
    });
  });
}
