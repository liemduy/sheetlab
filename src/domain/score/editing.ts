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
import {
  getEventPitches,
  getEventDots,
  getPrimaryEventPitch,
  isGeneratedRestEvent,
  isPitchedScoreEvent,
} from './events';
import {
  beatToTick,
  getDurationTicks,
  getMeasureTicks,
  splitTicksIntoDurations,
  tickToBeat,
} from './ticks';

export interface PlaceScoreEventRequest {
  eventId: string;
  staffId: StaffId;
  measureIndex: number;
  beat: number;
  duration: DurationValue;
  entryMode: 'note' | 'rest';
  pitch: Pitch;
  accidental?: Accidental;
  dots?: number;
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
  pitchIndex?: number;
  staffId?: StaffId;
  dots?: number;
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
      dots: request.dots || undefined,
    };
  }

  return {
    id: request.eventId,
    kind: 'note',
    beat: request.beat,
    duration: request.duration,
    dots: request.dots || undefined,
    pitch: {
      ...request.pitch,
      accidental: request.accidental,
    },
  };
}

function getPitchKey(pitch: Pitch) {
  return `${pitch.step}${pitch.accidental ?? ''}${pitch.octave}`;
}

function comparePitches(a: Pitch, b: Pitch) {
  const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const valueA = a.octave * steps.length + steps.indexOf(a.step);
  const valueB = b.octave * steps.length + steps.indexOf(b.step);

  return valueA - valueB;
}

function mergePitchedEventWithNote(
  existingEvent: ScoreEvent,
  noteEvent: ScoreEvent,
  eventId: string,
): ScoreEvent {
  if (noteEvent.kind !== 'note' || !isPitchedScoreEvent(existingEvent)) {
    return noteEvent;
  }

  const uniquePitches = new Map<string, Pitch>();

  [...getEventPitches(existingEvent), noteEvent.pitch].forEach((pitch) => {
    uniquePitches.set(getPitchKey(pitch), pitch);
  });

  const pitches = [...uniquePitches.values()].sort(comparePitches);

  if (pitches.length === 1) {
    return {
      ...noteEvent,
      pitch: pitches[0] ?? noteEvent.pitch,
    };
  }

  return {
    id: eventId,
    kind: 'chord',
    beat: noteEvent.beat,
    duration: noteEvent.duration,
    dots: noteEvent.dots,
    pitches,
  };
}

function applyPitchUpdate(
  pitch: Pitch,
  update: UpdateScoreEventRequest,
): Pitch {
  return {
    ...pitch,
    ...update.pitch,
    accidental:
      update.accidental === null
        ? undefined
        : update.accidental ?? update.pitch?.accidental ?? pitch.accidental,
  };
}

function createUpdatedScoreEvent(
  event: ScoreEvent,
  eventId: string,
  beat: number,
  duration: DurationValue,
  update: UpdateScoreEventRequest,
): ScoreEvent {
  if (event.kind === 'rest') {
    return {
      id: eventId,
      kind: 'rest',
      beat,
      duration,
      dots: update.dots ?? event.dots,
    };
  }

  if (event.kind === 'chord') {
    const targetPitchIndex = update.pitchIndex ?? 0;
    const nextPitches = event.pitches.map((pitch, index) =>
      index === targetPitchIndex ? applyPitchUpdate(pitch, update) : pitch,
    );

    return {
      id: eventId,
      kind: 'chord',
      beat,
      duration,
      dots: update.dots ?? event.dots,
      pitches: nextPitches.sort(comparePitches),
    };
  }

  return {
    id: eventId,
    kind: 'note',
    beat,
    duration,
    dots: update.dots ?? event.dots,
    pitch: applyPitchUpdate(event.pitch, update),
  };
}

function getEventEnd(event: ScoreEvent) {
  return event.beat + getDurationBeats(event.duration, getEventDots(event));
}

function overlaps(candidate: ScoreEvent, existing: ScoreEvent) {
  return candidate.beat < getEventEnd(existing) && getEventEnd(candidate) > existing.beat;
}

function getEventStartTick(event: ScoreEvent) {
  return beatToTick(event.beat);
}

function getEventEndTick(event: ScoreEvent) {
  return getEventStartTick(event) + getDurationTicks(event.duration, getEventDots(event));
}

function eventsOverlapByTick(candidate: ScoreEvent, existing: ScoreEvent) {
  return (
    getEventStartTick(candidate) < getEventEndTick(existing) &&
    getEventEndTick(candidate) > getEventStartTick(existing)
  );
}

function createRestId(
  staffId: StaffId,
  measureIndex: number,
  startTick: number,
  duration: DurationValue,
) {
  return `rest-${staffId}-m${measureIndex + 1}-t${startTick}-${duration}`;
}

function createRestEventsForTickRange(
  staffId: StaffId,
  measureIndex: number,
  startTick: number,
  endTick: number,
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  let cursorTick = startTick;

  for (const duration of splitTicksIntoDurations(endTick - startTick)) {
    events.push({
      id: createRestId(staffId, measureIndex, cursorTick, duration),
      kind: 'rest',
      beat: tickToBeat(cursorTick),
      duration,
    });
    cursorTick += getDurationTicks(duration);
  }

  return events;
}

function compactRestRuns(
  events: ScoreEvent[],
  staffId: StaffId,
  measureIndex: number,
) {
  const compactedEvents: ScoreEvent[] = [];
  let restRunStartTick: number | null = null;
  let restRunEndTick: number | null = null;

  function flushRestRun() {
    if (restRunStartTick === null || restRunEndTick === null) {
      return;
    }

    compactedEvents.push(
      ...createRestEventsForTickRange(
        staffId,
        measureIndex,
        restRunStartTick,
        restRunEndTick,
      ),
    );
    restRunStartTick = null;
    restRunEndTick = null;
  }

  for (const event of [...events].sort((a, b) => getEventStartTick(a) - getEventStartTick(b))) {
    if (event.kind === 'rest') {
      if (!isGeneratedRestEvent(event)) {
        flushRestRun();
        compactedEvents.push(event);
        continue;
      }

      restRunStartTick = restRunStartTick ?? getEventStartTick(event);
      restRunEndTick = getEventEndTick(event);
      continue;
    }

    flushRestRun();
    compactedEvents.push(event);
  }

  flushRestRun();

  return compactedEvents.sort((a, b) => getEventStartTick(a) - getEventStartTick(b));
}

function materializeMeasureEvents(
  events: ScoreEvent[],
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  const measureTicks = getMeasureTicks(score.timeSignature);
  const sortedEvents = [...events].sort(
    (a, b) => getEventStartTick(a) - getEventStartTick(b),
  );
  const materializedEvents: ScoreEvent[] = [];
  let cursorTick = 0;

  for (const event of sortedEvents) {
    const eventStartTick = getEventStartTick(event);
    const eventEndTick = getEventEndTick(event);

    if (eventStartTick < cursorTick) {
      throw new Error('Rhythm event overlap');
    }

    if (eventEndTick > measureTicks) {
      throw new Error('Rhythm event overflows measure');
    }

    if (eventStartTick > cursorTick) {
      materializedEvents.push(
        ...createRestEventsForTickRange(
          staffId,
          measureIndex,
          cursorTick,
          eventStartTick,
        ),
      );
    }

    materializedEvents.push(event);
    cursorTick = eventEndTick;
  }

  if (cursorTick < measureTicks) {
    materializedEvents.push(
      ...createRestEventsForTickRange(
        staffId,
        measureIndex,
        cursorTick,
        measureTicks,
      ),
    );
  }

  return compactRestRuns(materializedEvents, staffId, measureIndex);
}

function getTargetVoice(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  const targetStaff = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId);
  const targetMeasure = targetStaff?.measures.find(
    (measure) => measure.index === measureIndex,
  );
  const targetVoice = targetMeasure?.voices[0];

  return {
    targetMeasure,
    targetStaff,
    targetVoice,
  };
}

function writeScoreEvent(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  nextEvent: ScoreEvent,
  options: { allowSameStartPitchedReplacement: boolean },
): PlaceScoreEventResult {
  const { targetMeasure, targetStaff, targetVoice } = getTargetVoice(
    score,
    staffId,
    measureIndex,
  );

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

  const overlappingEvents = targetVoice.events.filter((event) =>
    eventsOverlapByTick(nextEvent, event),
  );
  const shouldRejectOverlap = overlappingEvents.some(
    (event) =>
      isPitchedScoreEvent(event) &&
      (!options.allowSameStartPitchedReplacement ||
        getEventStartTick(event) !== getEventStartTick(nextEvent)),
  );

  if (shouldRejectOverlap) {
    return {
      score,
      placed: false,
      reason: 'event-overlap',
    };
  }

  let nextVoiceEvents: ScoreEvent[];

  try {
    nextVoiceEvents = materializeMeasureEvents(
      [
        ...targetVoice.events.filter(
          (event) => !eventsOverlapByTick(nextEvent, event),
        ),
        nextEvent,
      ],
      score,
      staffId,
      measureIndex,
    );
  } catch (error) {
    return {
      score,
      placed: false,
      reason:
        error instanceof Error &&
        error.message === 'Rhythm event overflows measure'
          ? 'measure-overflow'
          : 'event-overlap',
    };
  }

  const nextScore = {
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
                      voices: measure.voices.map((voice, voiceIndex) =>
                        voiceIndex === 0
                          ? {
                              ...voice,
                              events: nextVoiceEvents,
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

export function tryPlaceScoreEvent(
  score: Score,
  request: PlaceScoreEventRequest,
): PlaceScoreEventResult {
  const candidateEvent = createScoreEvent(request);
  const { targetVoice } = getTargetVoice(
    score,
    request.staffId,
    request.measureIndex,
  );
  const sameSlotPitchedEvent = targetVoice?.events.find(
    (event) =>
      isPitchedScoreEvent(event) &&
      eventsOverlapByTick(candidateEvent, event) &&
      getEventStartTick(event) === getEventStartTick(candidateEvent) &&
      event.duration === candidateEvent.duration &&
      getEventDots(event) === getEventDots(candidateEvent),
  );
  const nextEvent =
    candidateEvent.kind === 'note' && sameSlotPitchedEvent
      ? mergePitchedEventWithNote(
          sameSlotPitchedEvent,
          candidateEvent,
          request.eventId,
        )
      : candidateEvent;

  return writeScoreEvent(score, request.staffId, request.measureIndex, nextEvent, {
    allowSameStartPitchedReplacement: true,
  });
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
  const insertDuration = getDurationBeats(request.duration, request.dots ?? 0);
  const flatEvents = targetStaff.measures.flatMap((measure) =>
    measure.voices[0]?.events.map((event) => ({
      event,
      globalBeat: measure.index * beatsPerMeasure + event.beat,
    })) ?? [],
  ).filter(({ event }) => isPitchedScoreEvent(event));
  const insertionSplitsExistingEvent = flatEvents.some(({ event, globalBeat }) => {
    const eventEnd =
      globalBeat + getDurationBeats(event.duration, getEventDots(event));

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
      Math.max(
        maxEnd,
        globalBeat + getDurationBeats(event.duration, getEventDots(event)),
      ),
    insertGlobalBeat + insertDuration,
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
                              events: materializeMeasureEvents(
                                reflowedEvents
                                  .filter(
                                    ({ globalBeat }) =>
                                      Math.floor(globalBeat / beatsPerMeasure) ===
                                      measure.index,
                                  )
                                  .map(({ event, globalBeat }) => ({
                                    ...event,
                                    beat: toLocalBeat(globalBeat, beatsPerMeasure),
                                  })),
                                scoreWithMeasures,
                                staff.id,
                                measure.index,
                              ),
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
            events: voice.events.some((event) => event.id === eventId)
              ? materializeMeasureEvents(
                  voice.events.filter((event) => event.id !== eventId),
                  score,
                  staff.id,
                  measure.index,
                )
              : voice.events,
          })),
        })),
      })),
    })),
  };
}

function removePitchFromEvent(event: ScoreEvent, pitchIndex: number): ScoreEvent | null {
  if (event.kind === 'note') {
    return pitchIndex === 0 ? null : event;
  }

  if (event.kind !== 'chord') {
    return event;
  }

  const remainingPitches = event.pitches.filter((_, index) => index !== pitchIndex);

  if (remainingPitches.length === event.pitches.length) {
    return event;
  }

  if (remainingPitches.length === 0) {
    return null;
  }

  if (remainingPitches.length === 1) {
    const remainingPitch = remainingPitches[0];

    if (!remainingPitch) {
      return null;
    }

    return {
      id: event.id,
      kind: 'note',
      beat: event.beat,
      duration: event.duration,
      dots: event.dots,
      pitch: remainingPitch,
    };
  }

  return {
    ...event,
    pitches: remainingPitches,
  };
}

export function deleteScoreEventPitch(
  score: Score,
  eventId: string,
  pitchIndex: number,
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) => ({
          ...measure,
          voices: measure.voices.map((voice) => {
            if (!voice.events.some((event) => event.id === eventId)) {
              return voice;
            }

            const nextEvents = voice.events.flatMap((event) => {
              if (event.id !== eventId) {
                return [event];
              }

              const nextEvent = removePitchFromEvent(event, pitchIndex);

              return nextEvent ? [nextEvent] : [];
            });

            return {
              ...voice,
              events: materializeMeasureEvents(
                nextEvents,
                score,
                staff.id,
                measure.index,
              ),
            };
          }),
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
  const candidateEvent = createUpdatedScoreEvent(
    found.event,
    eventId,
    targetBeat,
    duration,
    update,
  );
  const result = writeScoreEvent(
    scoreWithoutEvent,
    targetStaffId,
    targetMeasureIndex,
    candidateEvent,
    {
      allowSameStartPitchedReplacement: false,
    },
  );

  return {
    score: result.placed ? result.score : score,
    updated: result.placed,
    reason: result.reason,
  };
}
