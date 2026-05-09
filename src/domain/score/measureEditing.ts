import type { Measure, Score, Staff, StaffId } from './types';
import { materializeMeasureEvents } from './measureEvents';
import { createVoiceId } from './voices';

function createEmptyMeasure(staff: Staff, index: number): Measure {
  return {
    id: `measure-${staff.id}-${index + 1}`,
    index,
    voices: [
      {
        id: createVoiceId(staff.id, index, 0),
        events: [],
      },
    ],
  };
}

export function ensureMeasureCount(score: Score, measureCount: number): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures:
          staff.measures.length >= measureCount
            ? staff.measures
            : [
                ...staff.measures,
                ...Array.from(
                  { length: measureCount - staff.measures.length },
                  (_, offset) =>
                    createEmptyMeasure(staff, staff.measures.length + offset),
                ),
              ],
      })),
    })),
  };
}

export function addMeasure(score: Score): Score {
  const measureCount = getScoreMeasureCount(score);

  return ensureMeasureCount(score, measureCount + 1);
}

function getScoreMeasureCount(score: Score) {
  return Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function reindexStaffMeasures(
  score: Score,
  staff: Staff,
  measures: Measure[],
) {
  return measures.map((measure, index) => ({
    ...measure,
    id: `measure-${staff.id}-${index + 1}`,
    index,
    voices: measure.voices.map((voice, voiceIndex) => ({
      ...voice,
      id:
        voiceIndex === 0
          ? createVoiceId(staff.id, index, 0)
          : `${voice.id}-m${index + 1}`,
      events:
        voice.events.length > 0
          ? materializeMeasureEvents(voice.events, score, staff.id, index)
          : [],
    })),
  }));
}

export function insertMeasureAt(score: Score, measureIndex: number): Score {
  const measureCount = getScoreMeasureCount(score);
  const targetIndex = Math.max(0, Math.min(measureIndex, measureCount));
  const normalizedScore = ensureMeasureCount(score, measureCount);

  return {
    ...normalizedScore,
    parts: normalizedScore.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => {
        const nextMeasures = [
          ...staff.measures.slice(0, targetIndex),
          createEmptyMeasure(staff, targetIndex),
          ...staff.measures.slice(targetIndex),
        ];

        return {
          ...staff,
          measures: reindexStaffMeasures(normalizedScore, staff, nextMeasures),
        };
      }),
    })),
  };
}

export function deleteMeasureAt(score: Score, measureIndex: number): Score {
  const measureCount = getScoreMeasureCount(score);

  if (measureCount <= 1) {
    return score;
  }

  const targetIndex = Math.max(0, Math.min(measureIndex, measureCount - 1));
  const normalizedScore = ensureMeasureCount(score, measureCount);

  return {
    ...normalizedScore,
    parts: normalizedScore.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => {
        const nextMeasures = staff.measures.filter(
          (measure) => measure.index !== targetIndex,
        );

        return {
          ...staff,
          measures: reindexStaffMeasures(normalizedScore, staff, nextMeasures),
        };
      }),
    })),
  };
}

export function clearMeasureContent(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === measureIndex
                  ? {
                      ...measure,
                      voices: measure.voices.map((voice) => ({
                        ...voice,
                        events: [],
                      })),
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };
}
