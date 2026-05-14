import { getMeasureBeats } from './timeSignatures';
import type { Clef, ClefChange, Score, Staff, StaffId } from './types';

const BEAT_EPSILON = 0.0001;

export type ClefChangeIssue =
  | 'missing-target'
  | 'out-of-measure'
  | 'redundant-clef'
  | 'same-position'
  | 'target-occupied';

export interface ClefChangeResult {
  score: Score;
  updated: boolean;
  reason?: ClefChangeIssue;
}

function getStaff(score: Score, staffId: StaffId) {
  return score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId);
}

function getSortedClefChanges(measure: { clefChanges?: ClefChange[] }) {
  return [...(measure.clefChanges ?? [])].sort(
    (first, second) => first.beat - second.beat,
  );
}

function beatsMatch(first: number, second: number) {
  return Math.abs(first - second) <= BEAT_EPSILON;
}

export function getMeasureClefChanges(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  const staff = getStaff(score, staffId);
  const measure = staff?.measures.find(
    (candidate) => candidate.index === measureIndex,
  );

  return measure ? getSortedClefChanges(measure) : [];
}

export function getClefChangeAtPosition(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  beat: number,
) {
  return getMeasureClefChanges(score, staffId, measureIndex).find((change) =>
    beatsMatch(change.beat, beat),
  );
}

export function findClefChange(
  score: Score,
  staffId: StaffId,
  clefChangeId: string,
) {
  const staff = getStaff(score, staffId);

  if (!staff) {
    return null;
  }

  for (const measure of staff.measures) {
    const change = (measure.clefChanges ?? []).find(
      (candidate) => candidate.id === clefChangeId,
    );

    if (change) {
      return {
        change,
        measureIndex: measure.index,
        staff,
      };
    }
  }

  return null;
}

export function getActiveClef(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  beat = 0,
  options: { includeAtBeat?: boolean } = {},
): Clef {
  const staff = getStaff(score, staffId);
  const includeAtBeat = options.includeAtBeat ?? true;

  if (!staff) {
    return 'treble';
  }

  let clef = staff.clef;

  for (const measure of staff.measures) {
    if (measure.index > measureIndex) {
      break;
    }

    for (const change of getSortedClefChanges(measure)) {
      const isBeforeTargetMeasure = measure.index < measureIndex;
      const isAtOrBeforeTargetBeat = includeAtBeat
        ? change.beat <= beat + BEAT_EPSILON
        : change.beat < beat - BEAT_EPSILON;

      if (isBeforeTargetMeasure || isAtOrBeforeTargetBeat) {
        clef = change.clef;
      }
    }
  }

  return clef;
}

export function getActiveClefForEvent(
  score: Score,
  staff: Staff,
  measureIndex: number,
  beat: number,
) {
  return getActiveClef(score, staff.id, measureIndex, beat);
}

function createClefChangeId(
  staffId: StaffId,
  measureIndex: number,
  beat: number,
  clef: Clef,
) {
  return `clef-${staffId}-m${measureIndex + 1}-b${beat.toFixed(4)}-${clef}`;
}

export function trySetClefChange(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  beat: number,
  clef: Clef,
): ClefChangeResult {
  const staff = getStaff(score, staffId);
  const measure = staff?.measures.find(
    (candidate) => candidate.index === measureIndex,
  );

  if (!staff || !measure) {
    return { score, updated: false, reason: 'missing-target' };
  }

  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  if (beat < -BEAT_EPSILON || beat >= beatsPerMeasure + BEAT_EPSILON) {
    return { score, updated: false, reason: 'out-of-measure' };
  }

  const normalizedBeat = Number(Math.max(0, beat).toFixed(4));
  const existingChange = getClefChangeAtPosition(
    score,
    staffId,
    measureIndex,
    normalizedBeat,
  );

  if (existingChange?.clef === clef) {
    return { score, updated: false, reason: 'redundant-clef' };
  }

  const clefBeforePosition = getActiveClef(
    score,
    staffId,
    measureIndex,
    normalizedBeat,
    { includeAtBeat: false },
  );

  if (clefBeforePosition === clef) {
    return { score, updated: false, reason: 'redundant-clef' };
  }

  const nextChange: ClefChange = {
    id:
      existingChange?.id ??
      createClefChangeId(staffId, measureIndex, normalizedBeat, clef),
    beat: normalizedBeat,
    clef,
  };

  return {
    score: {
      ...score,
      parts: score.parts.map((part) => ({
        ...part,
        staves: part.staves.map((candidateStaff) =>
          candidateStaff.id === staffId
            ? {
                ...candidateStaff,
                measures: candidateStaff.measures.map((candidateMeasure) =>
                  candidateMeasure.index === measureIndex
                    ? {
                        ...candidateMeasure,
                        clefChanges: [
                          ...getSortedClefChanges(candidateMeasure).filter(
                            (change) => !beatsMatch(change.beat, normalizedBeat),
                          ),
                          nextChange,
                        ].sort((first, second) => first.beat - second.beat),
                      }
                    : candidateMeasure,
                ),
              }
            : candidateStaff,
        ),
      })),
    },
    updated: true,
  };
}

export function deleteClefChange(
  score: Score,
  staffId: StaffId,
  clefChangeId: string,
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              measures: staff.measures.map((measure) => {
                const nextClefChanges = (measure.clefChanges ?? []).filter(
                  (change) => change.id !== clefChangeId,
                );

                return {
                  ...measure,
                  clefChanges:
                    nextClefChanges.length > 0 ? nextClefChanges : undefined,
                };
              }),
            }
          : staff,
      ),
    })),
  };
}

export function tryMoveClefChange(
  score: Score,
  sourceStaffId: StaffId,
  clefChangeId: string,
  targetStaffId: StaffId,
  targetMeasureIndex: number,
  targetBeat: number,
): ClefChangeResult {
  const source = findClefChange(score, sourceStaffId, clefChangeId);
  const targetStaff = getStaff(score, targetStaffId);
  const targetMeasure = targetStaff?.measures.find(
    (candidate) => candidate.index === targetMeasureIndex,
  );

  if (!source || !targetStaff || !targetMeasure) {
    return { score, updated: false, reason: 'missing-target' };
  }

  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  if (targetBeat < -BEAT_EPSILON || targetBeat >= beatsPerMeasure + BEAT_EPSILON) {
    return { score, updated: false, reason: 'out-of-measure' };
  }

  const normalizedBeat = Number(Math.max(0, targetBeat).toFixed(4));

  if (
    sourceStaffId === targetStaffId &&
    source.measureIndex === targetMeasureIndex &&
    beatsMatch(source.change.beat, normalizedBeat)
  ) {
    return { score, updated: false, reason: 'same-position' };
  }

  const scoreWithoutSource = deleteClefChange(score, sourceStaffId, clefChangeId);
  const existingTarget = getClefChangeAtPosition(
    scoreWithoutSource,
    targetStaffId,
    targetMeasureIndex,
    normalizedBeat,
  );

  if (existingTarget) {
    return { score, updated: false, reason: 'target-occupied' };
  }

  const clefBeforeTarget = getActiveClef(
    scoreWithoutSource,
    targetStaffId,
    targetMeasureIndex,
    normalizedBeat,
    { includeAtBeat: false },
  );

  if (clefBeforeTarget === source.change.clef) {
    return { score, updated: false, reason: 'redundant-clef' };
  }

  const movedChange: ClefChange = {
    ...source.change,
    beat: normalizedBeat,
  };

  return {
    score: {
      ...scoreWithoutSource,
      parts: scoreWithoutSource.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) =>
          staff.id === targetStaffId
            ? {
                ...staff,
                measures: staff.measures.map((measure) =>
                  measure.index === targetMeasureIndex
                    ? {
                        ...measure,
                        clefChanges: [
                          ...getSortedClefChanges(measure),
                          movedChange,
                        ].sort((first, second) => first.beat - second.beat),
                      }
                    : measure,
                ),
              }
            : staff,
        ),
      })),
    },
    updated: true,
  };
}
