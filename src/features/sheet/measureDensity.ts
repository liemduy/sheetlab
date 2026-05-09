import type { Score } from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { MEASURE_COMPLEXITY_WEIGHT_SCALE } from './layoutConstants';

function normalizeBoundary(beat: number, beatsPerMeasure: number) {
  return Number(Math.min(beatsPerMeasure, Math.max(0, beat)).toFixed(4));
}

function countMeasureRhythmIntervals(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const boundaries = new Set<number>([
    0,
    beatsPerMeasure,
  ]);

  for (let beat = 1; beat < beatsPerMeasure; beat += 1) {
    boundaries.add(normalizeBoundary(beat, beatsPerMeasure));
  }

  score.parts
    .flatMap((part) => part.staves)
    .forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice) => {
        voice.events.forEach((event) => {
          if (isGeneratedRestEvent(event)) {
            return;
          }

          const eventStart = normalizeBoundary(event.beat, beatsPerMeasure);
          const eventEnd = normalizeBoundary(
            event.beat + getDurationBeats(event.duration, getEventDots(event)),
            beatsPerMeasure,
          );

          boundaries.add(eventStart);
          boundaries.add(eventEnd);
        });
      });
    });

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

  return sortedBoundaries.reduce((intervalCount, boundary, index) => {
    const nextBoundary = sortedBoundaries[index + 1];

    return nextBoundary !== undefined && nextBoundary - boundary > 0.0001
      ? intervalCount + 1
      : intervalCount;
  }, 0);
}

export function countMeasureNoteheads(score: Score, measureIndex: number) {
  return score.parts
    .flatMap((part) => part.staves)
    .reduce((total, staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      if (!measure) {
        return total;
      }

      return (
        total +
        measure.voices.reduce(
          (measureTotal, voice) =>
            measureTotal +
            voice.events.reduce((voiceTotal, event) => {
              if (isGeneratedRestEvent(event) || event.kind === 'rest') {
                return voiceTotal;
              }

              return voiceTotal + getEventPitches(event).length;
            }, 0),
          0,
        )
      );
    }, 0);
}

export function getMeasureSlotWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  return Math.max(
    beatsPerMeasure,
    countMeasureRhythmIntervals(score, measureIndex),
  );
}

export function getMeasureDistributionWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const extraIntervals = Math.max(
    0,
    getMeasureSlotWeight(score, measureIndex) - beatsPerMeasure,
  );

  return beatsPerMeasure + Math.sqrt(extraIntervals) * MEASURE_COMPLEXITY_WEIGHT_SCALE;
}
