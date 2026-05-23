import { getEventPitches, isPitchedScoreEvent } from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Pitch, Score, StaffId } from '../../domain/score/types';
import { pitchToMidi } from '../playback/pitch';

export type FingeringHand = 'left' | 'right';
export type FingerNumber = 1 | 2 | 3 | 4 | 5;
export type FingeringConfidence = 'high' | 'medium' | 'low';

export type FingeringReasonCode =
  | 'avoids-same-finger-leap'
  | 'comfortable-chord-span'
  | 'finger-over'
  | 'low-confidence-choice'
  | 'minimized-jump'
  | 'natural-hand-shape'
  | 'thumb-under'
  | 'wide-leap-reset';

export interface FingeringHint {
  beat: number;
  confidence: FingeringConfidence;
  eventId: string;
  finger: FingerNumber;
  hand: FingeringHand;
  measureIndex: number;
  midiNote: number;
  pitchIndex: number;
  reasonCodes: FingeringReasonCode[];
  staffId: StaffId;
}

interface FingeringNote {
  eventId: string;
  midiNote: number;
  pitch: Pitch;
  pitchIndex: number;
}

interface FingeringGroup {
  beat: number;
  hand: FingeringHand;
  key: string;
  measureIndex: number;
  notes: FingeringNote[];
  staffId: StaffId;
  startBeat: number;
}

interface FingeringAssignment extends FingeringNote {
  finger: FingerNumber;
}

interface FingeringCandidate {
  assignments: FingeringAssignment[];
  centerMidi: number;
  cost: number;
  maxMidi: number;
  minMidi: number;
  reasonCodes: FingeringReasonCode[];
}

interface CandidateState {
  candidate: FingeringCandidate;
  previousIndex: number | null;
  totalCost: number;
  transitionReasonCodes: FingeringReasonCode[];
}

const FINGERS = [1, 2, 3, 4, 5] satisfies FingerNumber[];
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const MAX_COMFORTABLE_SPAN_BY_FINGER_DISTANCE = {
  0: 0,
  1: 3,
  2: 6,
  3: 9,
  4: 12,
} satisfies Record<number, number>;

const RIGHT_HAND_NATURAL_FINGERS = {
  A: 3,
  B: 4,
  C: 1,
  D: 2,
  E: 3,
  F: 4,
  G: 5,
} satisfies Record<Pitch['step'], FingerNumber>;

const LEFT_HAND_NATURAL_FINGERS = {
  A: 3,
  B: 2,
  C: 5,
  D: 4,
  E: 3,
  F: 2,
  G: 1,
} satisfies Record<Pitch['step'], FingerNumber>;

const RIGHT_HAND_NATURAL_CHORDS = {
  1: [1],
  2: [1, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
} satisfies Record<number, FingerNumber[]>;

const LEFT_HAND_NATURAL_CHORDS = {
  1: [5],
  2: [5, 1],
  3: [5, 3, 1],
  4: [5, 4, 2, 1],
  5: [5, 4, 3, 2, 1],
} satisfies Record<number, FingerNumber[]>;

function getDefaultHandForStaff(staffId: StaffId): FingeringHand {
  return staffId === 'bass' ? 'left' : 'right';
}

function getNaturalFinger(pitch: Pitch, hand: FingeringHand): FingerNumber {
  return hand === 'right'
    ? RIGHT_HAND_NATURAL_FINGERS[pitch.step]
    : LEFT_HAND_NATURAL_FINGERS[pitch.step];
}

function getNaturalChordSequence(
  hand: FingeringHand,
  noteCount: number,
): FingerNumber[] {
  const safeCount = Math.min(5, Math.max(1, noteCount)) as
    | 1
    | 2
    | 3
    | 4
    | 5;

  return hand === 'right'
    ? RIGHT_HAND_NATURAL_CHORDS[safeCount]
    : LEFT_HAND_NATURAL_CHORDS[safeCount];
}

function isBlackKey(midiNote: number) {
  return BLACK_PITCH_CLASSES.has(((midiNote % 12) + 12) % 12);
}

function average(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addReason(
  reasonCodes: Set<FingeringReasonCode>,
  reasonCode: FingeringReasonCode,
) {
  reasonCodes.add(reasonCode);
}

function getStrictFingerSequences(
  noteCount: number,
  hand: FingeringHand,
): FingerNumber[][] {
  if (noteCount <= 1) {
    return FINGERS.map((finger) => [finger]);
  }

  const results: FingerNumber[][] = [];

  function visit(startIndex: number, sequence: FingerNumber[]) {
    if (sequence.length === noteCount) {
      results.push(sequence);
      return;
    }

    for (let index = startIndex; index < FINGERS.length; index += 1) {
      visit(index + 1, [...sequence, FINGERS[index]]);
    }
  }

  visit(0, []);

  if (hand === 'right') {
    return results;
  }

  return results.map((sequence) => [...sequence].reverse());
}

function getOverflowFingerSequence(
  noteCount: number,
  hand: FingeringHand,
): FingerNumber[] {
  return Array.from({ length: noteCount }, (_, noteIndex) => {
    const ratio = noteCount <= 1 ? 0 : noteIndex / (noteCount - 1);
    const finger = Math.round(1 + ratio * 4) as FingerNumber;

    return hand === 'right' ? finger : ((6 - finger) as FingerNumber);
  });
}

function getSingleNoteCost(
  note: FingeringNote,
  finger: FingerNumber,
  hand: FingeringHand,
) {
  const reasonCodes = new Set<FingeringReasonCode>();
  const naturalFinger = getNaturalFinger(note.pitch, hand);
  let cost = Math.abs(finger - naturalFinger) * 0.32;

  if (finger === naturalFinger) {
    addReason(reasonCodes, 'natural-hand-shape');
  }

  if (isBlackKey(note.midiNote) && finger === 1) {
    cost += 1.5;
  }

  return {
    cost,
    reasonCodes,
  };
}

function createCandidate(
  notes: FingeringNote[],
  fingers: readonly FingerNumber[],
  hand: FingeringHand,
): FingeringCandidate {
  const reasonCodes = new Set<FingeringReasonCode>();
  const assignments = notes.map((note, noteIndex) => ({
    ...note,
    finger: fingers[noteIndex] ?? fingers[fingers.length - 1] ?? 1,
  }));
  const midiNotes = notes.map((note) => note.midiNote);
  const minMidi = Math.min(...midiNotes);
  const maxMidi = Math.max(...midiNotes);
  const span = maxMidi - minMidi;
  let cost = 0;

  if (notes.length === 1) {
    const single = getSingleNoteCost(notes[0], assignments[0].finger, hand);

    cost += single.cost;
    single.reasonCodes.forEach((reasonCode) => addReason(reasonCodes, reasonCode));
  } else {
    const naturalSequence = getNaturalChordSequence(hand, notes.length);
    const fingerDistance = Math.abs(
      assignments[0].finger - assignments[assignments.length - 1].finger,
    );
    const maxComfortableSpan =
      MAX_COMFORTABLE_SPAN_BY_FINGER_DISTANCE[
        fingerDistance as keyof typeof MAX_COMFORTABLE_SPAN_BY_FINGER_DISTANCE
      ] ?? 12;

    cost += Math.max(0, span - maxComfortableSpan) * 4.5;
    cost += Math.max(0, maxComfortableSpan - span - 8) * 0.2;

    if (span <= maxComfortableSpan) {
      addReason(reasonCodes, 'comfortable-chord-span');
    }

    assignments.forEach((assignment, assignmentIndex) => {
      const naturalFinger = naturalSequence[assignmentIndex] ?? assignment.finger;

      cost += Math.abs(assignment.finger - naturalFinger) * 0.45;

      if (assignment.finger === naturalFinger) {
        addReason(reasonCodes, 'natural-hand-shape');
      }

      if (isBlackKey(assignment.midiNote) && assignment.finger === 1) {
        cost += 1.8;
      }
    });
  }

  return {
    assignments,
    centerMidi: average(midiNotes),
    cost,
    maxMidi,
    minMidi,
    reasonCodes: [...reasonCodes],
  };
}

function createCandidates(group: FingeringGroup): FingeringCandidate[] {
  const sortedNotes = [...group.notes].sort((a, b) => {
    if (a.midiNote !== b.midiNote) {
      return a.midiNote - b.midiNote;
    }

    return a.pitchIndex - b.pitchIndex;
  });

  if (sortedNotes.length > 5) {
    return [
      {
        ...createCandidate(
          sortedNotes,
          getOverflowFingerSequence(sortedNotes.length, group.hand),
          group.hand,
        ),
        cost: 40,
        reasonCodes: ['low-confidence-choice'],
      },
    ];
  }

  return getStrictFingerSequences(sortedNotes.length, group.hand).map((sequence) =>
    createCandidate(sortedNotes, sequence, group.hand),
  );
}

function getNearestAssignment(
  target: FingeringAssignment,
  assignments: readonly FingeringAssignment[],
) {
  return assignments.reduce<FingeringAssignment | null>((nearest, assignment) => {
    if (!nearest) {
      return assignment;
    }

    return Math.abs(assignment.midiNote - target.midiNote) <
      Math.abs(nearest.midiNote - target.midiNote)
      ? assignment
      : nearest;
  }, null);
}

function getDirectionPenalty({
  current,
  hand,
  previous,
  reasonCodes,
}: {
  current: FingeringAssignment;
  hand: FingeringHand;
  previous: FingeringAssignment;
  reasonCodes: Set<FingeringReasonCode>;
}) {
  const interval = current.midiNote - previous.midiNote;

  if (interval === 0) {
    return current.finger === previous.finger ? -0.35 : 0.25;
  }

  const expectedFingerDirection =
    hand === 'right'
      ? Math.sign(interval)
      : -Math.sign(interval);
  const actualFingerDirection = Math.sign(current.finger - previous.finger);
  const intervalSize = Math.abs(interval);

  if (expectedFingerDirection === actualFingerDirection) {
    addReason(reasonCodes, 'natural-hand-shape');
    return 0;
  }

  const isRightThumbUnder =
    hand === 'right' &&
    interval > 0 &&
    previous.finger >= 3 &&
    current.finger === 1 &&
    intervalSize <= 5;
  const isRightFingerOver =
    hand === 'right' &&
    interval < 0 &&
    previous.finger === 1 &&
    current.finger >= 3 &&
    intervalSize <= 5;
  const isLeftThumbUnder =
    hand === 'left' &&
    interval < 0 &&
    previous.finger >= 3 &&
    current.finger === 1 &&
    intervalSize <= 5;
  const isLeftFingerOver =
    hand === 'left' &&
    interval > 0 &&
    previous.finger === 1 &&
    current.finger >= 3 &&
    intervalSize <= 5;

  if (isRightThumbUnder || isLeftThumbUnder) {
    addReason(reasonCodes, 'thumb-under');
    return 0.85;
  }

  if (isRightFingerOver || isLeftFingerOver) {
    addReason(reasonCodes, 'finger-over');
    return 0.95;
  }

  return 2.8 + intervalSize * 0.08;
}

function getTransitionCost(
  previous: FingeringCandidate,
  current: FingeringCandidate,
  hand: FingeringHand,
) {
  const reasonCodes = new Set<FingeringReasonCode>();
  const centerMove = Math.abs(current.centerMidi - previous.centerMidi);
  let cost = centerMove * 0.07;

  if (centerMove <= 5) {
    addReason(reasonCodes, 'minimized-jump');
  } else if (centerMove > 12) {
    cost += (centerMove - 12) * 0.45;
    addReason(reasonCodes, 'wide-leap-reset');
  }

  current.assignments.forEach((assignment) => {
    const nearestPrevious = getNearestAssignment(
      assignment,
      previous.assignments,
    );

    if (!nearestPrevious) {
      return;
    }

    const intervalSize = Math.abs(assignment.midiNote - nearestPrevious.midiNote);

    if (intervalSize > 2 && assignment.finger === nearestPrevious.finger) {
      cost += 3.8 + intervalSize * 0.22;
    } else if (intervalSize > 2) {
      addReason(reasonCodes, 'avoids-same-finger-leap');
    }
  });

  if (
    previous.assignments.length === 1 &&
    current.assignments.length === 1 &&
    previous.assignments[0] &&
    current.assignments[0]
  ) {
    cost += getDirectionPenalty({
      current: current.assignments[0],
      hand,
      previous: previous.assignments[0],
      reasonCodes,
    });
  }

  return {
    cost,
    reasonCodes: [...reasonCodes],
  };
}

function getConfidence(
  margin: number,
  candidate: FingeringCandidate,
): FingeringConfidence {
  if (candidate.cost >= 16 || margin < 0.35) {
    return 'low';
  }

  if (margin >= 2.2 && candidate.cost < 8) {
    return 'high';
  }

  return 'medium';
}

function solveFingeringGroups(groups: FingeringGroup[]) {
  if (groups.length === 0) {
    return [];
  }

  const layers: CandidateState[][] = [];

  groups.forEach((group, groupIndex) => {
    const candidates = createCandidates(group);

    if (groupIndex === 0) {
      layers.push(
        candidates.map((candidate) => ({
          candidate,
          previousIndex: null,
          totalCost: candidate.cost,
          transitionReasonCodes: [],
        })),
      );
      return;
    }

    const previousLayer = layers[groupIndex - 1] ?? [];

    layers.push(
      candidates.map((candidate) => {
        const bestPrevious = previousLayer.reduce<{
          index: number;
          reasonCodes: FingeringReasonCode[];
          totalCost: number;
        } | null>((best, previousState, previousIndex) => {
          const transition = getTransitionCost(
            previousState.candidate,
            candidate,
            group.hand,
          );
          const totalCost =
            previousState.totalCost + candidate.cost + transition.cost;

          if (!best || totalCost < best.totalCost) {
            return {
              index: previousIndex,
              reasonCodes: transition.reasonCodes,
              totalCost,
            };
          }

          return best;
        }, null);

        return {
          candidate,
          previousIndex: bestPrevious?.index ?? null,
          totalCost: bestPrevious?.totalCost ?? candidate.cost,
          transitionReasonCodes: bestPrevious?.reasonCodes ?? [],
        };
      }),
    );
  });

  const lastLayer = layers[layers.length - 1] ?? [];
  let selectedIndex = lastLayer.reduce(
    (bestIndex, state, index) =>
      state.totalCost < (lastLayer[bestIndex]?.totalCost ?? Number.POSITIVE_INFINITY)
        ? index
        : bestIndex,
    0,
  );
  const selectedIndexes: number[] = [];

  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    selectedIndexes[layerIndex] = selectedIndex;
    selectedIndex = layers[layerIndex]?.[selectedIndex]?.previousIndex ?? 0;
  }

  return groups.flatMap((group, groupIndex): FingeringHint[] => {
    const layer = layers[groupIndex] ?? [];
    const state = layer[selectedIndexes[groupIndex] ?? 0];

    if (!state) {
      return [];
    }

    const orderedCosts = [...layer]
      .map((candidateState) => candidateState.totalCost)
      .sort((a, b) => a - b);
    const nextCost = orderedCosts.find((cost) => cost > state.totalCost + 0.001);
    const margin =
      nextCost === undefined ? Number.POSITIVE_INFINITY : nextCost - state.totalCost;
    const confidence = getConfidence(margin, state.candidate);
    const reasonCodes = [
      ...new Set([
        ...state.candidate.reasonCodes,
        ...state.transitionReasonCodes,
        ...(confidence === 'low'
          ? (['low-confidence-choice'] satisfies FingeringReasonCode[])
          : []),
      ]),
    ];

    return state.candidate.assignments.map((assignment) => ({
      beat: group.beat,
      confidence,
      eventId: assignment.eventId,
      finger: assignment.finger,
      hand: group.hand,
      measureIndex: group.measureIndex,
      midiNote: assignment.midiNote,
      pitchIndex: assignment.pitchIndex,
      reasonCodes,
      staffId: group.staffId,
    }));
  });
}

function collectFingeringGroups(score: Score) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const groupsByStaff = new Map<string, FingeringGroup>();

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      const hand = getDefaultHandForStaff(staff.id);

      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          voice.events.forEach((event) => {
            if (!isPitchedScoreEvent(event)) {
              return;
            }

            const groupKey = [
              staff.id,
              measure.index,
              event.beat.toFixed(4),
            ].join(':');
            const group =
              groupsByStaff.get(groupKey) ??
              ({
                beat: event.beat,
                hand,
                key: groupKey,
                measureIndex: measure.index,
                notes: [],
                staffId: staff.id,
                startBeat: measure.index * beatsPerMeasure + event.beat,
              } satisfies FingeringGroup);

            getEventPitches(event).forEach((pitch, pitchIndex) => {
              group.notes.push({
                eventId: event.id,
                midiNote: pitchToMidi(pitch),
                pitch,
                pitchIndex,
              });
            });
            groupsByStaff.set(groupKey, group);
          });
        });
      });
    });
  });

  return [...groupsByStaff.values()]
    .filter((group) => group.notes.length > 0)
    .sort((a, b) => {
      if (a.staffId !== b.staffId) {
        return a.staffId.localeCompare(b.staffId);
      }

      return a.startBeat - b.startBeat;
    });
}

export function buildFingeringHints(score: Score): FingeringHint[] {
  const groupsByStaff = new Map<string, FingeringGroup[]>();

  collectFingeringGroups(score).forEach((group) => {
    const key = `${group.staffId}:${group.hand}`;
    const groups = groupsByStaff.get(key) ?? [];

    groups.push(group);
    groupsByStaff.set(key, groups);
  });

  return [...groupsByStaff.values()]
    .flatMap((groups) => solveFingeringGroups(groups))
    .sort((a, b) => {
      if (a.measureIndex !== b.measureIndex) {
        return a.measureIndex - b.measureIndex;
      }

      if (a.beat !== b.beat) {
        return a.beat - b.beat;
      }

      if (a.staffId !== b.staffId) {
        return a.staffId.localeCompare(b.staffId);
      }

      if (a.eventId !== b.eventId) {
        return a.eventId.localeCompare(b.eventId);
      }

      return a.pitchIndex - b.pitchIndex;
    });
}
