import { StaveNote, Stem } from 'vexflow';
import type { Score, ScoreEvent, Staff } from '../../domain/score/types';
import { getActiveClefState } from '../../domain/score/clefChanges';
import {
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import {
  clampPitchToClefRange,
  getDisplayPitchForClefOctaveShift,
} from '../../domain/score/pitchRange';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
} from './layout';
import { getBeatX, getPitchYForScore } from './notationGeometry';
import type { RenderedEventLayout } from './renderedEventLayout';
import type { RenderedNoteRef } from './vexflowConnectionRenderer';
import { getVexFlowEventClasses } from './vexflowNoteFactory';
import { getRenderedNoteBounds } from './vexflowSvgTagging';
import {
  getEstimatedEventBottomInkPadding,
  getEstimatedEventTopInkPadding,
} from './eventInkMetrics';

const STEM_RENDERED_INK_ESTIMATE = STAFF_LINE_SPACING * 3;

export interface RenderedVexFlowVoice {
  events: ScoreEvent[];
  notes: StaveNote[];
  voiceIndex: number;
}

export function collectRenderedMeasureEventLayouts({
  beatsPerMeasure,
  measureIndex,
  noteRefs,
  renderedVoices,
  score,
  staff,
  staffIndex,
}: {
  beatsPerMeasure: number;
  measureIndex: number;
  noteRefs: Map<string, RenderedNoteRef>;
  renderedVoices: RenderedVexFlowVoice[];
  score: Score;
  staff: Staff;
  staffIndex: number;
}) {
  const eventLayouts: Record<string, RenderedEventLayout> = {};

  renderedVoices.forEach(({ events, notes, voiceIndex }) => {
    notes.forEach((note, noteIndex) => {
      const event = events[noteIndex];
      const svgElement = note.getSVGElement();

      if (!event || !svgElement) {
        return;
      }

      noteRefs.set(event.id, {
        event,
        measureIndex,
        note,
        staffId: staff.id,
        staffIndex,
        voiceIndex,
      });
      svgElement.classList.add(...getVexFlowEventClasses(event).split(' '));
      svgElement.setAttribute('data-event-id', event.id);
      svgElement.setAttribute('data-beat', String(event.beat));
      svgElement.setAttribute('data-duration', event.duration);
      svgElement.setAttribute('data-measure-index', String(measureIndex));
      const eventPitches = getEventPitches(event);
      const activeClefState = getActiveClefState(
        score,
        staff.id,
        measureIndex,
        event.beat,
      );
      svgElement.setAttribute('data-pitch-count', String(eventPitches.length));
      svgElement.setAttribute('data-staff-id', staff.id);
      if (event.tuplet) {
        svgElement.setAttribute('data-tuplet-id', event.tuplet.id);
        svgElement.setAttribute('data-tuplet-index', String(event.tuplet.index));
      }
      if (event.articulations?.length) {
        svgElement.setAttribute('data-articulations', event.articulations.join(' '));
      }
      svgElement.setAttribute('data-voice-index', String(voiceIndex));

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
                clampPitchToClefRange(
                  getDisplayPitchForClefOctaveShift(
                    pitch,
                    activeClefState.octaveShift,
                  ),
                  activeClefState.clef,
                ),
                activeClefState.clef,
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
      if (stemDirection === Stem.UP || stemDirection === Stem.DOWN) {
        svgElement.setAttribute(
          'data-stem-direction',
          stemDirection === Stem.UP ? 'up' : 'down',
        );
        svgElement.setAttribute(
          'data-stem-direction-source',
          event.stemDirection ? 'manual' : 'auto',
        );
      }
      const minY =
        stemDirection === Stem.UP
          ? minPitchY - STEM_RENDERED_INK_ESTIMATE
          : minPitchY - getEstimatedEventTopInkPadding(event);
      const maxY =
        stemDirection === Stem.DOWN
          ? maxPitchY + STEM_RENDERED_INK_ESTIMATE
          : maxPitchY + getEstimatedEventBottomInkPadding(event);

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
        stemDirection:
          stemDirection === Stem.UP
            ? 'up'
            : stemDirection === Stem.DOWN
              ? 'down'
              : null,
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
