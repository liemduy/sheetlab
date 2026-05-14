import type { Articulation as VexFlowArticulation, Renderer, StaveNote } from 'vexflow';
import type { ClefChange, Score, ScoreEvent, Staff } from '../../domain/score/types';
import { getMeasureClefChanges } from '../../domain/score/clefChanges';
import {
  STAFF_LINE_SPACING,
  getLocalMeasureIndex,
  getMeasureX,
  getScoreStaffTop,
} from './layout';
import { isVexFlowFermataArticulation } from './vexflowNoteFactory';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const CLEF_CHANGE_BEAT_EPSILON = 0.0001;

const SYSTEM_START_CLEF_MARKER_X_OFFSET = 24;
const SYSTEM_START_CLEF_MARKER_HEIGHT = 68;
const SYSTEM_START_CLEF_MARKER_WIDTH = 44;

interface RenderedBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
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

export function getRenderedNoteBounds(note: StaveNote, svgElement: SVGElement) {
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

export function tagRenderedClefChangeElement({
  change,
  element,
  measureIndex,
  staffId,
}: {
  change: ClefChange;
  element: SVGElement;
  measureIndex: number;
  staffId: Staff['id'];
}) {
  element.classList.add('sheetlab-clef-change');
  element.setAttribute('data-testid', 'rendered-clef-change');
  element.setAttribute('data-clef-change-id', change.id);
  element.setAttribute('data-clef', change.clef);
  element.setAttribute('data-beat', String(change.beat));
  element.setAttribute('data-measure-index', String(measureIndex));
  element.setAttribute('data-staff-id', staffId);
}

function isSystemStartClefChange(
  score: Score,
  measureIndex: number,
  beat: number,
) {
  return (
    getLocalMeasureIndex(measureIndex, score) === 0 &&
    Math.abs(beat) <= CLEF_CHANGE_BEAT_EPSILON
  );
}

export function drawSystemStartClefChangeMarkers(
  container: HTMLDivElement,
  score: Score,
) {
  const svg = container.querySelector('svg');

  if (!svg) {
    return;
  }

  svg
    .querySelectorAll('.sheetlab-system-start-clef-change-marker')
    .forEach((element) => element.remove());

  const staves = score.parts[0]?.staves ?? [];

  staves.forEach((staff, staffIndex) => {
    staff.measures.forEach((measure) => {
      getMeasureClefChanges(score, staff.id, measure.index)
        .filter((change) =>
          isSystemStartClefChange(score, measure.index, change.beat),
        )
        .forEach((change) => {
          const group = document.createElementNS(SVG_NAMESPACE, 'g');
          const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
          const x =
            getMeasureX(measure.index, score) +
            SYSTEM_START_CLEF_MARKER_X_OFFSET;
          const y =
            getScoreStaffTop(score, staffIndex, measure.index) +
            STAFF_LINE_SPACING * 2;

          group.classList.add('sheetlab-system-start-clef-change-marker');
          group.setAttribute('data-system-start', 'true');
          tagRenderedClefChangeElement({
            change,
            element: group,
            measureIndex: measure.index,
            staffId: staff.id,
          });

          rect.classList.add('sheetlab-system-start-clef-change-target');
          rect.setAttribute(
            'height',
            SYSTEM_START_CLEF_MARKER_HEIGHT.toString(),
          );
          rect.setAttribute(
            'width',
            SYSTEM_START_CLEF_MARKER_WIDTH.toString(),
          );
          rect.setAttribute(
            'x',
            (x - SYSTEM_START_CLEF_MARKER_WIDTH / 2).toFixed(2),
          );
          rect.setAttribute(
            'y',
            (y - SYSTEM_START_CLEF_MARKER_HEIGHT / 2).toFixed(2),
          );
          rect.setAttribute('rx', '5');
          group.appendChild(rect);
          svg.appendChild(group);
        });
    });
  });
}

export function tagRenderedFermataElements({
  context,
  renderedVoices,
}: {
  context: ReturnType<Renderer['getContext']>;
  renderedVoices: Array<{
    events: ScoreEvent[];
    notes: StaveNote[];
  }>;
}) {
  const svg = (context as { svg?: SVGSVGElement }).svg;

  if (!svg) {
    return;
  }

  const taggedElements = new Set<SVGTextElement>();

  renderedVoices.forEach(({ events, notes }) => {
    notes.forEach((note, noteIndex) => {
      const event = events[noteIndex];

      if (!event?.fermata) {
        return;
      }

      const fermata = note
        .getModifiersByType('Articulation')
        .find(isVexFlowFermataArticulation);

      if (!fermata) {
        return;
      }

      const renderedFermata = fermata as VexFlowArticulation & {
        x?: number;
        y?: number;
      };
      const targetX = (renderedFermata.x ?? note.getAbsoluteX()) + fermata.getXShift();
      const targetY = (renderedFermata.y ?? note.getYs()[0] ?? 0) + fermata.getYShift();
      const candidates = [...svg.querySelectorAll('text')].filter(
        (element): element is SVGTextElement =>
          element.textContent === fermata.getText() && !taggedElements.has(element),
      );
      const bestElement = candidates.reduce<{
        distance: number;
        element: SVGTextElement;
      } | null>((best, element) => {
        const x = Number(element.getAttribute('x'));
        const y = Number(element.getAttribute('y'));
        const distance = Math.hypot(x - targetX, y - targetY);

        return !best || distance < best.distance
          ? { distance, element }
          : best;
      }, null)?.element;

      if (!bestElement) {
        return;
      }

      taggedElements.add(bestElement);
      bestElement.classList.add('sheetlab-fermata');
      bestElement.setAttribute('data-event-id', event.id);
      bestElement.setAttribute('data-testid', 'rendered-fermata');
    });
  });
}
