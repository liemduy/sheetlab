import type { Score, ScoreEvent } from '../../domain/score/types';
import {
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { getEventDurationBeats } from '../../domain/score/eventDuration';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { MEASURE_COMPLEXITY_WEIGHT_SCALE } from './layoutConstants';

const TUPLET_REST_LANE_DENSITY = 0.9;
const TUPLET_NOTE_LANE_DENSITY_BONUS = 0.25;
const LANE_DENSITY_SLOT_WEIGHT_SCALE = 0.65;

function normalizeBoundary(beat: number) {
  return Number(Math.max(0, beat).toFixed(4));
}

function countMeasureRhythmIntervals(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  let maxBeat = beatsPerMeasure;
  const boundaries = new Set<number>([
    0,
    beatsPerMeasure,
  ]);

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

          const eventStart = normalizeBoundary(event.beat);
          const eventEnd = normalizeBoundary(
            event.beat + getEventDurationBeats(event),
          );

          maxBeat = Math.max(maxBeat, eventEnd);
          boundaries.add(eventStart);
          boundaries.add(eventEnd);
        });
      });
    });

  for (let beat = 1; beat < Math.ceil(maxBeat); beat += 1) {
    boundaries.add(normalizeBoundary(beat));
  }

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

function getEventLaneDensity(event: ScoreEvent) {
  if (isGeneratedRestEvent(event)) {
    return 0;
  }

  if (event.kind === 'rest') {
    return event.tuplet ? TUPLET_REST_LANE_DENSITY : 0;
  }

  const pitchCount = getEventPitches(event).length;
  const tupletBonus = event.tuplet ? TUPLET_NOTE_LANE_DENSITY_BONUS : 0;

  return (pitchCount <= 1 ? 1 : 1 + (pitchCount - 1) * 0.25) + tupletBonus;
}

export function countMeasureLaneDensities(score: Score, measureIndex: number) {
  const laneDensities = new Map<string, number>();

  score.parts
    .flatMap((part) => part.staves)
    .forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice, voiceIndex) => {
        const laneKey = `${staff.id}:${voiceIndex}`;
        const voiceDensity = voice.events.reduce(
          (total, event) => total + getEventLaneDensity(event),
          0,
        );

        laneDensities.set(
          laneKey,
          (laneDensities.get(laneKey) ?? 0) + voiceDensity,
        );
      });
    });

  return laneDensities;
}

function getMeasureMaxLaneDensity(score: Score, measureIndex: number) {
  const laneDensities = [...countMeasureLaneDensities(score, measureIndex).values()];

  return laneDensities.length > 0 ? Math.max(...laneDensities) : 0;
}

export function getMeasureSlotWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  return Math.max(
    beatsPerMeasure,
    countMeasureRhythmIntervals(score, measureIndex),
  );
}

export function getMeasureReadableSlotWeight(
  score: Score,
  measureIndex: number,
) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const laneDensitySlotWeight =
    beatsPerMeasure +
    Math.max(
      0,
      getMeasureMaxLaneDensity(score, measureIndex) - beatsPerMeasure,
    ) *
      LANE_DENSITY_SLOT_WEIGHT_SCALE;

  return Math.max(
    getMeasureSlotWeight(score, measureIndex),
    laneDensitySlotWeight,
  );
}

export function getMeasureDistributionWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const effectiveSlotWeight = getMeasureReadableSlotWeight(score, measureIndex);
  const extraIntervals = Math.max(
    0,
    effectiveSlotWeight - beatsPerMeasure,
  );

  return beatsPerMeasure + Math.sqrt(extraIntervals) * MEASURE_COMPLEXITY_WEIGHT_SCALE;
}
