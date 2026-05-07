import type {
  Accidental,
  DurationValue,
  Measure,
  Pitch,
  Score,
  ScoreEvent,
  Staff,
  StaffId,
} from './types';
import { getDurationBeats } from './durations';
import { getPrimaryEventPitch } from './events';

export interface PlaceScoreEventRequest {
  eventId: string;
  staffId: StaffId;
  measureIndex: number;
  beat: number;
  duration: DurationValue;
  entryMode: 'note' | 'rest';
  pitch: Pitch;
  accidental?: Accidental;
}

export interface PlaceScoreEventResult {
  score: Score;
  placed: boolean;
  reason?: 'measure-overflow' | 'event-overlap' | 'missing-target';
}

export interface UpdateScoreEventRequest {
  accidental?: Accidental | null;
  beat?: number;
  duration?: DurationValue;
  measureIndex?: number;
  pitch?: Pitch;
  staffId?: StaffId;
}

export interface UpdateScoreEventResult {
  score: Score;
  updated: boolean;
  reason?: PlaceScoreEventResult['reason'] | 'missing-event';
}

function createScoreEvent(request: PlaceScoreEventRequest): ScoreEvent {
  if (request.entryMode === 'rest') {
    return {
      id: request.eventId,
      kind: 'rest',
      beat: request.beat,
      duration: request.duration,
    };
  }

  return {
    id: request.eventId,
    kind: 'note',
    beat: request.beat,
    duration: request.duration,
    pitch: {
      ...request.pitch,
      accidental: request.accidental,
    },
  };
}

function getEventEnd(event: ScoreEvent) {
  return event.beat + getDurationBeats(event.duration);
}

function overlaps(candidate: ScoreEvent, existing: ScoreEvent) {
  return candidate.beat < getEventEnd(existing) && getEventEnd(candidate) > existing.beat;
}

export function tryPlaceScoreEvent(
  score: Score,
  request: PlaceScoreEventRequest,
): PlaceScoreEventResult {
  const nextEvent = createScoreEvent(request);
  const targetStaff = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === request.staffId);
  const targetMeasure = targetStaff?.measures.find(
    (measure) => measure.index === request.measureIndex,
  );
  const targetVoice = targetMeasure?.voices[0];

  if (!targetStaff || !targetMeasure || !targetVoice) {
    return {
      score,
      placed: false,
      reason: 'missing-target',
    };
  }

  if (getEventEnd(nextEvent) > score.timeSignature.beats) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const eventsAtOtherBeats = targetVoice.events.filter(
    (event) => event.beat !== nextEvent.beat,
  );

  if (eventsAtOtherBeats.some((event) => overlaps(nextEvent, event))) {
    return {
      score,
      placed: false,
      reason: 'event-overlap',
    };
  }

  const nextScore = {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) =>
        staff.id === request.staffId
          ? {
              ...staff,
              measures: staff.measures.map((measure) =>
                measure.index === request.measureIndex
                  ? {
                      ...measure,
                      voices: measure.voices.map((voice, voiceIndex) =>
                        voiceIndex === 0
                          ? {
                              ...voice,
                              events: [
                                ...voice.events.filter(
                                  (event) => event.beat !== nextEvent.beat,
                                ),
                                nextEvent,
                              ].sort((a, b) => a.beat - b.beat),
                            }
                          : voice,
                      ),
                    }
                  : measure,
              ),
            }
          : staff,
      ),
    })),
  };

  return {
    score: nextScore,
    placed: true,
  };
}

export function placeScoreEvent(score: Score, request: PlaceScoreEventRequest) {
  return tryPlaceScoreEvent(score, request).score;
}

function createEmptyMeasure(staff: Staff, index: number): Measure {
  return {
    id: `measure-${staff.id}-${index + 1}`,
    index,
    voices: [
      {
        id: `voice-${staff.id}-${index + 1}-main`,
        events: [],
      },
    ],
  };
}

function ensureMeasureCount(score: Score, measureCount: number): Score {
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
  const measureCount = Math.max(
    0,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );

  return ensureMeasureCount(score, measureCount + 1);
}

function toLocalBeat(globalBeat: number, beatsPerMeasure: number) {
  return Number((globalBeat % beatsPerMeasure).toFixed(4));
}

export function tryInsertScoreEvent(
  score: Score,
  request: PlaceScoreEventRequest,
): PlaceScoreEventResult {
  const targetStaff = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === request.staffId);
  const targetMeasure = targetStaff?.measures.find(
    (measure) => measure.index === request.measureIndex,
  );
  const targetVoice = targetMeasure?.voices[0];

  if (!targetStaff || !targetMeasure || !targetVoice) {
    return {
      score,
      placed: false,
      reason: 'missing-target',
    };
  }

  const nextEvent = createScoreEvent(request);

  if (getEventEnd(nextEvent) > score.timeSignature.beats) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const beatsPerMeasure = score.timeSignature.beats;
  const insertGlobalBeat = request.measureIndex * beatsPerMeasure + request.beat;
  const insertDuration = getDurationBeats(request.duration);
  const flatEvents = targetStaff.measures.flatMap((measure) =>
    measure.voices[0]?.events.map((event) => ({
      event,
      globalBeat: measure.index * beatsPerMeasure + event.beat,
    })) ?? [],
  );
  const insertionSplitsExistingEvent = flatEvents.some(({ event, globalBeat }) => {
    const eventEnd = globalBeat + getDurationBeats(event.duration);

    return globalBeat < insertGlobalBeat && eventEnd > insertGlobalBeat;
  });

  if (insertionSplitsExistingEvent) {
    return {
      score,
      placed: false,
      reason: 'event-overlap',
    };
  }

  const reflowedEvents = [
    ...flatEvents.map(({ event, globalBeat }) => ({
      event,
      globalBeat:
        globalBeat >= insertGlobalBeat ? globalBeat + insertDuration : globalBeat,
    })),
    {
      event: nextEvent,
      globalBeat: insertGlobalBeat,
    },
  ].sort((a, b) => a.globalBeat - b.globalBeat);
  const maxEndBeat = reflowedEvents.reduce(
    (maxEnd, { event, globalBeat }) =>
      Math.max(maxEnd, globalBeat + getDurationBeats(event.duration)),
    0,
  );
  const requiredMeasureCount = Math.max(
    targetStaff.measures.length,
    request.measureIndex + 1,
    Math.ceil(maxEndBeat / beatsPerMeasure),
  );
  const scoreWithMeasures = ensureMeasureCount(score, requiredMeasureCount);

  return {
    score: {
      ...scoreWithMeasures,
      parts: scoreWithMeasures.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) =>
          staff.id === request.staffId
            ? {
                ...staff,
                measures: staff.measures.map((measure) => ({
                  ...measure,
                  voices: measure.voices.map((voice, voiceIndex) =>
                    voiceIndex === 0
                      ? {
                          ...voice,
                          events: reflowedEvents
                            .filter(
                              ({ globalBeat }) =>
                                Math.floor(globalBeat / beatsPerMeasure) ===
                                measure.index,
                            )
                            .map(({ event, globalBeat }) => ({
                              ...event,
                              beat: toLocalBeat(globalBeat, beatsPerMeasure),
                            })),
                        }
                      : voice,
                  ),
                })),
              }
            : staff,
        ),
      })),
    },
    placed: true,
  };
}

export function countScoreEvents(score: Score) {
  return score.parts.reduce(
    (partTotal, part) =>
      partTotal +
      part.staves.reduce(
        (staffTotal, staff) =>
          staffTotal +
          staff.measures.reduce(
            (measureTotal, measure) =>
              measureTotal +
              measure.voices.reduce(
                (voiceTotal, voice) => voiceTotal + voice.events.length,
                0,
              ),
            0,
          ),
        0,
      ),
    0,
  );
}

export function deleteScoreEvent(score: Score, eventId: string): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) => ({
          ...measure,
          voices: measure.voices.map((voice) => ({
            ...voice,
            events: voice.events.filter((event) => event.id !== eventId),
          })),
        })),
      })),
    })),
  };
}

export function findScoreEvent(score: Score, eventId: string) {
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const event = voice.events.find((candidate) => candidate.id === eventId);

          if (event) {
            return {
              event,
              measureIndex: measure.index,
              staffId: staff.id,
            };
          }
        }
      }
    }
  }

  return null;
}

export function tryUpdateScoreEvent(
  score: Score,
  eventId: string,
  update: UpdateScoreEventRequest,
): UpdateScoreEventResult {
  const found = findScoreEvent(score, eventId);

  if (!found) {
    return {
      score,
      updated: false,
      reason: 'missing-event',
    };
  }

  const scoreWithoutEvent = deleteScoreEvent(score, eventId);
  const duration = update.duration ?? found.event.duration;
  const targetStaffId = update.staffId ?? found.staffId;
  const targetMeasureIndex = update.measureIndex ?? found.measureIndex;
  const targetBeat = update.beat ?? found.event.beat;
  const existingPitch = getPrimaryEventPitch(found.event);
  const pitch: Pitch =
    found.event.kind !== 'rest'
      ? {
          ...(existingPitch ?? { step: 'C' as const, octave: 4 }),
          ...update.pitch,
          accidental:
            update.accidental === null
              ? undefined
              : update.accidental ??
                update.pitch?.accidental ??
                existingPitch?.accidental,
        }
      : { step: 'C' as const, octave: 4 };
  const accidental =
    found.event.kind !== 'rest'
      ? update.accidental === null
        ? undefined
        : update.accidental ?? existingPitch?.accidental
      : undefined;
  const entryMode = found.event.kind === 'rest' ? 'rest' : 'note';
  const candidateEvent = createScoreEvent({
    eventId,
    staffId: targetStaffId,
    measureIndex: targetMeasureIndex,
    beat: targetBeat,
    duration,
    entryMode,
    pitch,
    accidental,
  });
  const targetVoice = scoreWithoutEvent.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === targetStaffId)
    ?.measures.find((measure) => measure.index === targetMeasureIndex)
    ?.voices[0];

  if (targetVoice?.events.some((event) => overlaps(candidateEvent, event))) {
    return {
      score,
      updated: false,
      reason: 'event-overlap',
    };
  }

  const result = tryPlaceScoreEvent(scoreWithoutEvent, {
    eventId,
    staffId: targetStaffId,
    measureIndex: targetMeasureIndex,
    beat: targetBeat,
    duration,
    entryMode,
    pitch,
    accidental,
  });

  return {
    score: result.placed ? result.score : score,
    updated: result.placed,
    reason: result.reason,
  };
}
