import type {
  Accidental,
  AnnotationKind,
  AnnotationPlacementSide,
  DurationValue,
  LyricMap,
  PedalMark,
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
import { findScoreEventContext } from './eventLookup';
import { clampPitchToClefRange } from './pitchRange';
import {
  eventsOverlapByTick,
  getEventEnd,
  getEventStartTick,
  materializeMeasureEvents,
} from './measureEvents';
import { ensureMeasureCount } from './measureEditing';
import { getMeasureBeats } from './timeSignatures';
import { ensureMeasureVoiceCount, normalizeVoiceIndex } from './voices';

export {
  addMeasure,
  clearMeasureContent,
  deleteMeasureAt,
  insertMeasureAt,
} from './measureEditing';
export {
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setScoreTimeSignature,
  tryMoveKeySignatureSymbol,
} from './signatureEditing';
export type { MoveKeySignatureSymbolResult } from './signatureEditing';

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
  voiceIndex?: number;
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
  voiceIndex?: number;
  chordSymbol?: string | null;
  dynamic?: string | null;
  fermata?: boolean;
  glissando?: boolean;
  annotationPlacement?: {
    kind: AnnotationKind;
    side: AnnotationPlacementSide;
  };
  lyric?: string | null;
  lyricMap?: LyricMap | null;
  pedal?: PedalMark | null;
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

function clampScoreEventToStaffRange(event: ScoreEvent, staff: Staff): ScoreEvent {
  if (event.kind === 'note') {
    return {
      ...event,
      pitch: clampPitchToClefRange(event.pitch, staff.clef),
    };
  }

  if (event.kind === 'chord') {
    const uniquePitches = new Map<string, Pitch>();

    event.pitches
      .map((pitch) => clampPitchToClefRange(pitch, staff.clef))
      .forEach((pitch) => {
        uniquePitches.set(getPitchKey(pitch), pitch);
      });

    const pitches = [...uniquePitches.values()].sort(comparePitches);

    if (pitches.length === 1) {
      const pitch = pitches[0];

      if (!pitch) {
        return event;
      }

      return {
        id: event.id,
        kind: 'note',
        beat: event.beat,
        annotationPlacements: event.annotationPlacements,
        chordSymbol: event.chordSymbol,
        dynamic: event.dynamic,
        duration: event.duration,
        dots: event.dots,
        fermata: event.fermata,
        glissando: event.glissando,
        lyric: event.lyric,
        lyricMap: event.lyricMap,
        pedal: event.pedal,
        pitch,
      };
    }

    return {
      ...event,
      pitches,
    };
  }

  return event;
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
    chordSymbol: existingEvent.chordSymbol,
    dynamic: existingEvent.dynamic,
    duration: noteEvent.duration,
    dots: noteEvent.dots,
    fermata: existingEvent.fermata,
    glissando: existingEvent.glissando,
    annotationPlacements: existingEvent.annotationPlacements,
    lyric: existingEvent.lyric,
    lyricMap: existingEvent.lyricMap,
    pedal: existingEvent.pedal,
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

function normalizeAnnotationText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function createUpdatedEventBase(
  event: ScoreEvent,
  eventId: string,
  beat: number,
  duration: DurationValue,
  update: UpdateScoreEventRequest,
) {
  const chordSymbol = normalizeAnnotationText(update.chordSymbol);
  const dynamic = normalizeAnnotationText(update.dynamic);
  const lyric = normalizeAnnotationText(update.lyric);
  let annotationPlacements = event.annotationPlacements;

  if (update.annotationPlacement) {
    annotationPlacements = { ...(event.annotationPlacements ?? {}) };

    if (update.annotationPlacement.side === 'auto') {
      delete annotationPlacements[update.annotationPlacement.kind];
    } else {
      annotationPlacements[update.annotationPlacement.kind] =
        update.annotationPlacement.side;
    }
  }

  const normalizedAnnotationPlacements =
    annotationPlacements &&
    Object.values(annotationPlacements).some((side) => side !== undefined)
      ? annotationPlacements
      : undefined;

  return {
    id: eventId,
    beat,
    duration,
    dots: update.dots ?? event.dots,
    chordSymbol:
      chordSymbol === undefined ? event.chordSymbol : chordSymbol ?? undefined,
    dynamic: dynamic === undefined ? event.dynamic : dynamic ?? undefined,
    fermata:
      update.fermata === undefined ? event.fermata : update.fermata || undefined,
    glissando:
      update.glissando === undefined
        ? event.glissando
        : update.glissando || undefined,
    annotationPlacements: normalizedAnnotationPlacements,
    lyric: lyric === undefined ? event.lyric : lyric ?? undefined,
    lyricMap:
      update.lyricMap === undefined ? event.lyricMap : update.lyricMap ?? undefined,
    pedal: update.pedal === undefined ? event.pedal : update.pedal ?? undefined,
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
      ...createUpdatedEventBase(event, eventId, beat, duration, update),
      kind: 'rest',
    };
  }

  if (event.kind === 'chord') {
    const targetPitchIndex = update.pitchIndex ?? 0;
    const nextPitches = event.pitches.map((pitch, index) =>
      index === targetPitchIndex ? applyPitchUpdate(pitch, update) : pitch,
    );

    return {
      ...createUpdatedEventBase(event, eventId, beat, duration, update),
      kind: 'chord',
      pitches: nextPitches.sort(comparePitches),
    };
  }

  return {
    ...createUpdatedEventBase(event, eventId, beat, duration, update),
    kind: 'note',
    pitch: applyPitchUpdate(event.pitch, update),
  };
}

function getTargetVoice(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  voiceIndex = 0,
) {
  const normalizedVoiceIndex = normalizeVoiceIndex(voiceIndex);
  const targetStaff = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId);
  const targetMeasure = targetStaff?.measures.find(
    (measure) => measure.index === measureIndex,
  );
  const targetMeasureWithVoice = targetMeasure
    ? ensureMeasureVoiceCount(targetMeasure, staffId, normalizedVoiceIndex)
    : undefined;
  const targetVoice = targetMeasureWithVoice?.voices[normalizedVoiceIndex];

  return {
    targetMeasure,
    targetMeasureWithVoice,
    targetStaff,
    targetVoice,
    voiceIndex: normalizedVoiceIndex,
  };
}

function writeScoreEvent(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  nextEvent: ScoreEvent,
  options: { allowSameStartPitchedReplacement: boolean; voiceIndex?: number },
): PlaceScoreEventResult {
  const {
    targetMeasure,
    targetMeasureWithVoice,
    targetStaff,
    targetVoice,
    voiceIndex: targetVoiceIndex,
  } = getTargetVoice(
    score,
    staffId,
    measureIndex,
    options.voiceIndex,
  );

  if (!targetStaff || !targetMeasure || !targetMeasureWithVoice || !targetVoice) {
    return {
      score,
      placed: false,
      reason: 'missing-target',
    };
  }

  const boundedEvent = clampScoreEventToStaffRange(nextEvent, targetStaff);

  if (getEventEnd(boundedEvent) > getMeasureBeats(score.timeSignature)) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const overlappingEvents = targetVoice.events.filter((event) =>
    eventsOverlapByTick(boundedEvent, event),
  );
  const shouldRejectOverlap = overlappingEvents.some(
    (event) =>
      isPitchedScoreEvent(event) &&
      (!options.allowSameStartPitchedReplacement ||
        getEventStartTick(event) !== getEventStartTick(boundedEvent)),
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
          (event) => !eventsOverlapByTick(boundedEvent, event),
        ),
        boundedEvent,
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
                      voices: targetMeasureWithVoice.voices.map((voice, voiceIndex) =>
                        voiceIndex === targetVoiceIndex
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
    request.voiceIndex,
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

  return writeScoreEvent(
    score,
    request.staffId,
    request.measureIndex,
    nextEvent,
    {
      allowSameStartPitchedReplacement: true,
      voiceIndex: request.voiceIndex,
    },
  );
}

export function placeScoreEvent(score: Score, request: PlaceScoreEventRequest) {
  return tryPlaceScoreEvent(score, request).score;
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
  const targetVoiceIndex = normalizeVoiceIndex(request.voiceIndex);
  const targetMeasureWithVoice = targetMeasure
    ? ensureMeasureVoiceCount(targetMeasure, request.staffId, targetVoiceIndex)
    : undefined;
  const targetVoice = targetMeasureWithVoice?.voices[targetVoiceIndex];

  if (!targetStaff || !targetMeasure || !targetMeasureWithVoice || !targetVoice) {
    return {
      score,
      placed: false,
      reason: 'missing-target',
    };
  }

  const nextEvent = clampScoreEventToStaffRange(
    createScoreEvent(request),
    targetStaff,
  );

  if (getEventEnd(nextEvent) > getMeasureBeats(score.timeSignature)) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const insertGlobalBeat = request.measureIndex * beatsPerMeasure + request.beat;
  const insertDuration = getDurationBeats(request.duration, request.dots ?? 0);
  const flatEvents = targetStaff.measures.flatMap((measure) =>
    ensureMeasureVoiceCount(measure, request.staffId, targetVoiceIndex)
      .voices[targetVoiceIndex]?.events.map((event) => ({
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
                  voices: ensureMeasureVoiceCount(
                    measure,
                    staff.id,
                    targetVoiceIndex,
                  ).voices.map((voice, voiceIndex) =>
                        voiceIndex === targetVoiceIndex
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
                (voiceTotal, voice) =>
                  voiceTotal +
                  voice.events.filter((event) => !isGeneratedRestEvent(event)).length,
                0,
              ),
            0,
          ),
        0,
      ),
    0,
  );
}

export function setMeasureSectionMarker(
  score: Score,
  measureIndex: number,
  sectionMarker: string | null,
) {
  const normalizedText = normalizeAnnotationText(sectionMarker);

  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) =>
          measure.index === measureIndex
            ? {
                ...measure,
                sectionMarker: normalizedText ?? undefined,
              }
            : measure,
        ),
      })),
    })),
  };
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

    const { pitches: _pitches, ...eventBase } = event;

    return {
      ...eventBase,
      kind: 'note',
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
  const found = findScoreEventContext(score, eventId);

  return found
    ? {
        event: found.event,
        measureIndex: found.measureIndex,
        staffId: found.staffId,
        voiceIndex: found.voiceIndex,
      }
    : null;
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
  const targetVoiceIndex = update.voiceIndex ?? found.voiceIndex;
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
      voiceIndex: targetVoiceIndex,
    },
  );

  return {
    score: result.placed ? result.score : score,
    updated: result.placed,
    reason: result.reason,
  };
}
