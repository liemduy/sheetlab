import type {
  Accidental,
  AnnotationOffset,
  ArticulationKind,
  AnnotationKind,
  AnnotationPlacementSide,
  DurationValue,
  GraceNoteAttachment,
  HairpinMark,
  LyricMap,
  PedalMark,
  Pitch,
  Score,
  ScoreEvent,
  SlurMark,
  StemDirection,
  Staff,
  StaffId,
  TieMark,
  TupletInfo,
} from './types';
import { setAnnotationOffset } from './annotationOffsets';
import { normalizeArticulations } from './articulations';
import {
  getEventDurationBeats,
  getEventDurationTicks,
} from './eventDuration';
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
  materializeMeasureEventsAllowingInvalid,
} from './measureEvents';
import { ensureMeasureCount } from './measureEditing';
import { getMeasureBeats } from './timeSignatures';
import {
  createTupletInfo,
  getDefaultTupletNormalNotes,
  getTupletSlotDuration,
  getTupletSlotEffectiveBeats,
  isSupportedTupletActualNotes,
  type SupportedTupletActualNotes,
} from './tuplets';
import {
  getAttachedStemDirectionEventIds,
  getOppositeStemDirection,
  getStemDirectionContext,
  isStemmedScoreEvent,
} from './stemDirection';
import { getActiveClef } from './clefChanges';
import { normalizeGraceNotes } from './graceNotes';
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
  tuplet?: TupletInfo;
  voiceIndex?: number;
}

export interface PlaceScoreEventResult {
  score: Score;
  placed: boolean;
  placementKind?: 'chord' | 'event' | 'parallel-voice';
  reason?:
    | 'measure-overflow'
    | 'event-overlap'
    | 'missing-target'
    | 'unsupported-tuplet';
  voiceIndex?: number;
}

export interface PlaceTupletGroupRequest extends Omit<
  PlaceScoreEventRequest,
  'dots' | 'duration' | 'tuplet'
> {
  actualNotes: SupportedTupletActualNotes;
  duration: DurationValue;
  normalNotes?: number;
}

export interface UpdateScoreEventRequest {
  accidental?: Accidental | null;
  allowInvalidMeasure?: boolean;
  beat?: number;
  duration?: DurationValue;
  measureIndex?: number;
  pitch?: Pitch;
  pitchIndex?: number;
  staffId?: StaffId;
  dots?: number;
  arpeggio?: boolean;
  articulations?: ArticulationKind[] | null;
  stemDirection?: StemDirection | null;
  voiceIndex?: number;
  chordSymbol?: string | null;
  dynamic?: string | null;
  fermata?: boolean;
  graceNotes?: GraceNoteAttachment[] | null;
  glissando?: boolean;
  hairpin?: HairpinMark | null;
  annotationPlacement?: {
    kind: AnnotationKind;
    side: AnnotationPlacementSide;
  };
  annotationOffset?: {
    kind: AnnotationKind;
    offset: AnnotationOffset | null;
  };
  lyric?: string | null;
  lyricMap?: LyricMap | null;
  pedal?: PedalMark | null;
  slurs?: SlurMark[] | null;
  ties?: TieMark[] | null;
  tuplet?: TupletInfo | null;
}

export interface UpdateScoreEventResult {
  score: Score;
  updated: boolean;
  reason?: PlaceScoreEventResult['reason'] | 'locked-tuplet-slot' | 'missing-event';
}

export interface FlipStemDirectionResult {
  score: Score;
  updated: boolean;
  eventIds?: string[];
  direction?: StemDirection;
  reason?: 'missing-event' | 'missing-stem' | UpdateScoreEventResult['reason'];
}

function createScoreEvent(request: PlaceScoreEventRequest): ScoreEvent {
  if (request.entryMode === 'rest') {
    return {
      id: request.eventId,
      kind: 'rest',
      beat: request.beat,
      duration: request.duration,
      dots: request.dots || undefined,
      tuplet: request.tuplet,
    };
  }

  return {
    id: request.eventId,
    kind: 'note',
    beat: request.beat,
    duration: request.duration,
    dots: request.dots || undefined,
    tuplet: request.tuplet,
    pitch: {
      ...request.pitch,
      accidental: request.accidental,
    },
  };
}

function clampScoreEventToStaffRange(
  event: ScoreEvent,
  staff: Staff,
  clef = staff.clef,
): ScoreEvent {
  if (event.kind === 'note') {
    return {
      ...event,
      pitch: clampPitchToClefRange(event.pitch, clef),
    };
  }

  if (event.kind === 'chord') {
    const uniquePitches = new Map<string, Pitch>();

    event.pitches
      .map((pitch) => clampPitchToClefRange(pitch, clef))
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
        annotationOffsets: event.annotationOffsets,
        arpeggio: event.arpeggio,
        articulations: event.articulations,
        chordSymbol: event.chordSymbol,
        dynamic: event.dynamic,
        duration: event.duration,
        dots: event.dots,
        fermata: event.fermata,
        graceNotes: event.graceNotes,
        glissando: event.glissando,
        hairpin: event.hairpin,
        lyric: event.lyric,
        lyricMap: event.lyricMap,
        pedal: event.pedal,
        pitch,
        slurs: event.slurs,
        stemDirection: event.stemDirection,
        ties: event.ties,
        tuplet: event.tuplet,
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
    arpeggio: existingEvent.arpeggio,
    articulations: existingEvent.articulations,
    dynamic: existingEvent.dynamic,
    duration: noteEvent.duration,
    dots: noteEvent.dots,
    stemDirection: existingEvent.stemDirection,
    tuplet: noteEvent.tuplet ?? existingEvent.tuplet,
    fermata: existingEvent.fermata,
    graceNotes: existingEvent.graceNotes,
    glissando: existingEvent.glissando,
    hairpin: existingEvent.hairpin,
    annotationPlacements: existingEvent.annotationPlacements,
    annotationOffsets: existingEvent.annotationOffsets,
    lyric: existingEvent.lyric,
    lyricMap: existingEvent.lyricMap,
    pedal: existingEvent.pedal,
    slurs: existingEvent.slurs,
    ties: existingEvent.ties,
    pitches,
  };
}

function getTupletSlotKey(event: ScoreEvent) {
  return event.tuplet ? `${event.tuplet.id}:${event.tuplet.index}` : '';
}

function eventsShareRhythmSlot(first: ScoreEvent, second: ScoreEvent) {
  return (
    getEventStartTick(first) === getEventStartTick(second) &&
    first.duration === second.duration &&
    getEventDots(first) === getEventDots(second) &&
    getEventDurationTicks(first) === getEventDurationTicks(second) &&
    getTupletSlotKey(first) === getTupletSlotKey(second)
  );
}

const AUTO_POLYPHONY_VOICE_INDEXES = [0, 1] as const;

function getAutoPolyphonyVoiceIndexes(preferredVoiceIndex: number) {
  return [
    preferredVoiceIndex,
    ...AUTO_POLYPHONY_VOICE_INDEXES.filter(
      (voiceIndex) => voiceIndex !== preferredVoiceIndex,
    ),
  ];
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
  const articulations = normalizeArticulations(update.articulations);
  let annotationPlacements = event.annotationPlacements;
  let annotationOffsets = event.annotationOffsets;

  if (update.annotationPlacement) {
    annotationPlacements = { ...(event.annotationPlacements ?? {}) };

    if (update.annotationPlacement.side === 'auto') {
      annotationOffsets = setAnnotationOffset(
        annotationOffsets,
        update.annotationPlacement.kind,
        null,
      );
      delete annotationPlacements[update.annotationPlacement.kind];
    } else {
      annotationPlacements[update.annotationPlacement.kind] =
        update.annotationPlacement.side;
    }
  }

  if (update.annotationOffset) {
    annotationOffsets = setAnnotationOffset(
      annotationOffsets,
      update.annotationOffset.kind,
      update.annotationOffset.offset,
    );
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
    arpeggio:
      update.arpeggio === undefined ? event.arpeggio : update.arpeggio || undefined,
    articulations:
      articulations === undefined ? event.articulations : articulations ?? undefined,
    stemDirection:
      duration === 'whole'
        ? undefined
        : update.stemDirection === undefined
          ? event.stemDirection
          : update.stemDirection ?? undefined,
    chordSymbol:
      chordSymbol === undefined ? event.chordSymbol : chordSymbol ?? undefined,
    dynamic: dynamic === undefined ? event.dynamic : dynamic ?? undefined,
    fermata:
      update.fermata === undefined ? event.fermata : update.fermata || undefined,
    graceNotes:
      update.graceNotes === undefined
        ? event.graceNotes
        : normalizeGraceNotes(update.graceNotes, eventId),
    glissando:
      update.glissando === undefined
        ? event.glissando
        : update.glissando || undefined,
    hairpin:
      update.hairpin === undefined ? event.hairpin : update.hairpin ?? undefined,
    annotationPlacements: normalizedAnnotationPlacements,
    annotationOffsets,
    lyric: lyric === undefined ? event.lyric : lyric ?? undefined,
    lyricMap:
      update.lyricMap === undefined ? event.lyricMap : update.lyricMap ?? undefined,
    pedal: update.pedal === undefined ? event.pedal : update.pedal ?? undefined,
    slurs: update.slurs === undefined ? event.slurs : update.slurs ?? undefined,
    ties: update.ties === undefined ? event.ties : update.ties ?? undefined,
    tuplet:
      update.tuplet === undefined ? event.tuplet : update.tuplet ?? undefined,
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
    const {
      articulations: _articulations,
      arpeggio: _arpeggio,
      graceNotes: _graceNotes,
      hairpin: _hairpin,
      slurs: _slurs,
      stemDirection: _stemDirection,
      ties: _ties,
      ...base
    } = createUpdatedEventBase(event, eventId, beat, duration, update);

    return {
      ...base,
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
  options: {
    allowInvalidMeasure?: boolean;
    allowSameStartPitchedReplacement: boolean;
    voiceIndex?: number;
  },
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

  const activeClef = getActiveClef(
    score,
    staffId,
    measureIndex,
    nextEvent.beat,
  );
  const boundedEvent = clampScoreEventToStaffRange(
    nextEvent,
    targetStaff,
    activeClef,
  );
  const measureOverflow =
    getEventEnd(boundedEvent) > getMeasureBeats(score.timeSignature);
  const overlappingEvents = targetVoice.events.filter((event) =>
    eventsOverlapByTick(boundedEvent, event),
  );
  const hasUserEventOverlap = overlappingEvents.some(
    (event) => !isGeneratedRestEvent(event) && isPitchedScoreEvent(event),
  );

  if (options.allowInvalidMeasure && (measureOverflow || hasUserEventOverlap)) {
    const nextVoiceEvents = materializeMeasureEventsAllowingInvalid(
      [
        ...targetVoice.events.filter((event) => !isGeneratedRestEvent(event)),
        boundedEvent,
      ],
      score,
      staffId,
      measureIndex,
    );

    return {
      score: {
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
                          voices: targetMeasureWithVoice.voices.map(
                            (voice, voiceIndex) =>
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
      },
      placed: true,
      reason: measureOverflow ? 'measure-overflow' : 'event-overlap',
    };
  }

  if (measureOverflow) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const shouldRejectOverlap = overlappingEvents.some(
    (event) =>
      !isGeneratedRestEvent(event) &&
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
    placementKind: 'event',
    voiceIndex: targetVoiceIndex,
  };
}

function replaceVoiceEvents(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  voiceIndex: number,
  events: ScoreEvent[],
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
                if (measure.index !== measureIndex) {
                  return measure;
                }

                const measureWithVoice = ensureMeasureVoiceCount(
                  measure,
                  staff.id,
                  voiceIndex,
                );

                return {
                  ...measureWithVoice,
                  voices: measureWithVoice.voices.map((voice, index) =>
                    index === voiceIndex
                      ? {
                          ...voice,
                          events,
                        }
                      : voice,
                  ),
                };
              }),
            }
          : staff,
      ),
    })),
  };
}

function replaceScoreEventInPlace(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  voiceIndex: number,
  eventId: string,
  nextEvent: ScoreEvent,
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
                      voices: measure.voices.map((voice, index) =>
                        index === voiceIndex
                          ? {
                              ...voice,
                              events: voice.events.map((event) =>
                                event.id === eventId ? nextEvent : event,
                              ),
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
}

function canUpdateScoreEventInPlace(update: UpdateScoreEventRequest) {
  return (
    update.accidental === undefined &&
    update.allowInvalidMeasure === undefined &&
    update.beat === undefined &&
    update.duration === undefined &&
    update.dots === undefined &&
    update.measureIndex === undefined &&
    update.pitch === undefined &&
    update.pitchIndex === undefined &&
    update.staffId === undefined &&
    update.tuplet === undefined &&
    update.voiceIndex === undefined
  );
}

function roundBeat(beat: number) {
  return Number(beat.toFixed(4));
}

function createTupletId(sourceId: string) {
  return `tuplet-${sourceId}`;
}

function createTupletRestEvent(
  eventId: string,
  beat: number,
  duration: DurationValue,
  tuplet: TupletInfo,
): ScoreEvent {
  return {
    id: eventId,
    kind: 'rest',
    beat,
    duration,
    tuplet,
  };
}

function createTupletGroupFromEvent(
  sourceEvent: ScoreEvent,
  actualNotes: SupportedTupletActualNotes,
) {
  const normalNotes = getDefaultTupletNormalNotes(actualNotes);
  const slotDuration = getTupletSlotDuration(
    sourceEvent.duration,
    actualNotes,
    normalNotes,
  );

  if (!slotDuration || sourceEvent.dots || sourceEvent.tuplet) {
    return null;
  }

  const tupletId = createTupletId(sourceEvent.id);
  const slotBeatStep = getTupletSlotEffectiveBeats(
    slotDuration,
    actualNotes,
    normalNotes,
  );

  return Array.from({ length: actualNotes }, (_, index): ScoreEvent => {
    const tuplet = createTupletInfo({
      actualNotes,
      id: tupletId,
      index,
      normalNotes,
    });
    const beat = roundBeat(sourceEvent.beat + slotBeatStep * index);

    if (index === 0) {
      return {
        ...sourceEvent,
        beat,
        duration: slotDuration,
        dots: undefined,
        tuplet,
      };
    }

    return createTupletRestEvent(
      `${tupletId}-rest-${index}`,
      beat,
      slotDuration,
      tuplet,
    );
  });
}

export function tryCreateTupletFromEvent(
  score: Score,
  eventId: string,
  actualNotes: SupportedTupletActualNotes = 3,
): UpdateScoreEventResult {
  if (!isSupportedTupletActualNotes(actualNotes)) {
    return {
      score,
      updated: false,
      reason: 'unsupported-tuplet',
    };
  }

  const found = findScoreEvent(score, eventId);

  if (!found) {
    return {
      score,
      updated: false,
      reason: 'missing-event',
    };
  }

  const group = createTupletGroupFromEvent(found.event, actualNotes);

  if (!group) {
    return {
      score,
      updated: false,
      reason: 'unsupported-tuplet',
    };
  }

  const targetVoice = getTargetVoice(
    score,
    found.staffId,
    found.measureIndex,
    found.voiceIndex,
  ).targetVoice;

  if (!targetVoice) {
    return {
      score,
      updated: false,
      reason: 'missing-target',
    };
  }

  try {
    const nextEvents = materializeMeasureEvents(
      [
        ...targetVoice.events.filter((event) => event.id !== eventId),
        ...group,
      ],
      score,
      found.staffId,
      found.measureIndex,
    );

    return {
      score: replaceVoiceEvents(
        score,
        found.staffId,
        found.measureIndex,
        found.voiceIndex,
        nextEvents,
      ),
      updated: true,
    };
  } catch (error) {
    return {
      score,
      updated: false,
      reason:
        error instanceof Error &&
        error.message === 'Rhythm event overflows measure'
          ? 'measure-overflow'
          : 'event-overlap',
    };
  }
}

export function tryPlaceTupletGroup(
  score: Score,
  request: PlaceTupletGroupRequest,
): PlaceScoreEventResult {
  const slotDuration = getTupletSlotDuration(
    request.duration,
    request.actualNotes,
    request.normalNotes,
  );

  if (!slotDuration || !isSupportedTupletActualNotes(request.actualNotes)) {
    return {
      score,
      placed: false,
      reason: 'unsupported-tuplet',
    };
  }

  const target = getTargetVoice(
    score,
    request.staffId,
    request.measureIndex,
    request.voiceIndex,
  );

  if (
    !target.targetStaff ||
    !target.targetMeasure ||
    !target.targetMeasureWithVoice ||
    !target.targetVoice
  ) {
    return {
      score,
      placed: false,
      reason: 'missing-target',
    };
  }

  const targetStaff = target.targetStaff;
  const targetVoice = target.targetVoice;
  const targetVoiceIndex = target.voiceIndex;
  const normalNotes =
    request.normalNotes ?? getDefaultTupletNormalNotes(request.actualNotes);
  const tupletId = createTupletId(request.eventId);
  const slotBeatStep = getTupletSlotEffectiveBeats(
    slotDuration,
    request.actualNotes,
    normalNotes,
  );
  const group = Array.from(
    { length: request.actualNotes },
    (_, index): ScoreEvent => {
      const tuplet = createTupletInfo({
        actualNotes: request.actualNotes,
        id: tupletId,
        index,
        normalNotes,
      });
      const beat = roundBeat(request.beat + slotBeatStep * index);

      if (index === 0) {
        return createScoreEvent({
          ...request,
          beat,
          dots: 0,
          duration: slotDuration,
          eventId: request.eventId,
          tuplet,
        });
      }

      return createTupletRestEvent(
        `${tupletId}-rest-${index}`,
        beat,
        slotDuration,
        tuplet,
      );
    },
  ).map((event) => clampScoreEventToStaffRange(event, targetStaff));

  const overflowsMeasure = group.some(
    (event) => getEventEnd(event) > getMeasureBeats(score.timeSignature),
  );

  if (overflowsMeasure) {
    return {
      score,
      placed: false,
      reason: 'measure-overflow',
    };
  }

  const overlapsUserPitchedEvent = targetVoice.events.some(
    (event) =>
      group.some((tupletEvent) => eventsOverlapByTick(tupletEvent, event)) &&
      !isGeneratedRestEvent(event) &&
      isPitchedScoreEvent(event),
  );

  if (overlapsUserPitchedEvent) {
    return {
      score,
      placed: false,
      reason: 'event-overlap',
    };
  }

  try {
    const nextEvents = materializeMeasureEvents(
      [
        ...targetVoice.events.filter(
          (event) =>
            !group.some((tupletEvent) => eventsOverlapByTick(tupletEvent, event)),
        ),
        ...group,
      ],
      score,
      request.staffId,
      request.measureIndex,
    );

    return {
      score: replaceVoiceEvents(
        score,
        request.staffId,
        request.measureIndex,
        targetVoiceIndex,
        nextEvents,
      ),
      placed: true,
    };
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
}

export function tryPlaceScoreEvent(
  score: Score,
  request: PlaceScoreEventRequest,
): PlaceScoreEventResult {
  const candidateEvent = createScoreEvent(request);
  const requestedVoiceIndex = normalizeVoiceIndex(request.voiceIndex);
  const { targetVoice } = getTargetVoice(
    score,
    request.staffId,
    request.measureIndex,
    requestedVoiceIndex,
  );
  const sameSlotPitchedEvent = targetVoice?.events.find(
    (event) =>
      isPitchedScoreEvent(event) &&
      eventsOverlapByTick(candidateEvent, event) &&
      eventsShareRhythmSlot(event, candidateEvent),
  );
  const nextEvent =
    candidateEvent.kind === 'note' && sameSlotPitchedEvent
      ? mergePitchedEventWithNote(
          sameSlotPitchedEvent,
          candidateEvent,
          request.eventId,
        )
      : candidateEvent;

  if (sameSlotPitchedEvent) {
    const result = writeScoreEvent(
      score,
      request.staffId,
      request.measureIndex,
      nextEvent,
      {
        allowSameStartPitchedReplacement: true,
        voiceIndex: requestedVoiceIndex,
      },
    );

    return result.placed
      ? {
          ...result,
          placementKind: 'chord',
          voiceIndex: requestedVoiceIndex,
        }
      : result;
  }

  const primaryResult = writeScoreEvent(
    score,
    request.staffId,
    request.measureIndex,
    candidateEvent,
    {
      allowSameStartPitchedReplacement: candidateEvent.kind === 'rest',
      voiceIndex: requestedVoiceIndex,
    },
  );

  if (
    primaryResult.placed ||
    primaryResult.reason !== 'event-overlap' ||
    !isPitchedScoreEvent(candidateEvent)
  ) {
    return primaryResult;
  }

  for (const voiceIndex of getAutoPolyphonyVoiceIndexes(requestedVoiceIndex)) {
    if (voiceIndex === requestedVoiceIndex) {
      continue;
    }

    const alternateTarget = getTargetVoice(
      score,
      request.staffId,
      request.measureIndex,
      voiceIndex,
    );
    const alternateSameSlotPitchedEvent = alternateTarget.targetVoice?.events.find(
      (event) =>
        isPitchedScoreEvent(event) &&
        eventsOverlapByTick(candidateEvent, event) &&
        eventsShareRhythmSlot(event, candidateEvent),
    );
    const alternateEvent =
      candidateEvent.kind === 'note' && alternateSameSlotPitchedEvent
        ? mergePitchedEventWithNote(
            alternateSameSlotPitchedEvent,
            candidateEvent,
            request.eventId,
          )
        : candidateEvent;
    const alternateResult = writeScoreEvent(
      score,
      request.staffId,
      request.measureIndex,
      alternateEvent,
      {
        allowSameStartPitchedReplacement: Boolean(alternateSameSlotPitchedEvent),
        voiceIndex,
      },
    );

    if (alternateResult.placed) {
      return {
        ...alternateResult,
        placementKind: alternateSameSlotPitchedEvent
          ? 'chord'
          : 'parallel-voice',
        voiceIndex,
      };
    }
  }

  return primaryResult;
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
  const insertDuration = getEventDurationBeats(nextEvent);
  const flatEvents = targetStaff.measures.flatMap((measure) =>
    ensureMeasureVoiceCount(measure, request.staffId, targetVoiceIndex)
      .voices[targetVoiceIndex]?.events.map((event) => ({
      event,
      globalBeat: measure.index * beatsPerMeasure + event.beat,
    })) ?? [],
  ).filter(({ event }) => isPitchedScoreEvent(event));
  const insertionSplitsExistingEvent = flatEvents.some(({ event, globalBeat }) => {
    const eventEnd = globalBeat + getEventDurationBeats(event);

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
        globalBeat + getEventDurationBeats(event),
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
  function materializeAfterDelete(
    events: ScoreEvent[],
    staffId: StaffId,
    measureIndex: number,
  ) {
    try {
      return materializeMeasureEvents(events, score, staffId, measureIndex);
    } catch {
      return materializeMeasureEventsAllowingInvalid(
        events,
        score,
        staffId,
        measureIndex,
      );
    }
  }

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
              ? materializeAfterDelete(
                  voice.events.flatMap((event) => {
                    if (event.id !== eventId) {
                      return [event];
                    }

                    return event.tuplet
                      ? [createTupletRestEvent(
                          event.id,
                          event.beat,
                          event.duration,
                          event.tuplet,
                        )]
                      : [];
                  }),
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
    if (pitchIndex !== 0) {
      return event;
    }

    return event.tuplet
      ? createTupletRestEvent(event.id, event.beat, event.duration, event.tuplet)
      : null;
  }

  if (event.kind !== 'chord') {
    return event;
  }

  const remainingPitches = event.pitches.filter((_, index) => index !== pitchIndex);

  if (remainingPitches.length === event.pitches.length) {
    return event;
  }

  if (remainingPitches.length === 0) {
    return event.tuplet
      ? createTupletRestEvent(event.id, event.beat, event.duration, event.tuplet)
      : null;
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
  function materializeAfterDelete(
    events: ScoreEvent[],
    staffId: StaffId,
    measureIndex: number,
  ) {
    try {
      return materializeMeasureEvents(events, score, staffId, measureIndex);
    } catch {
      return materializeMeasureEventsAllowingInvalid(
        events,
        score,
        staffId,
        measureIndex,
      );
    }
  }

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
              events: materializeAfterDelete(
                nextEvents,
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

  if (
    found.event.tuplet &&
    ((update.duration !== undefined && update.duration !== found.event.duration) ||
      (update.dots !== undefined && update.dots !== getEventDots(found.event)))
  ) {
    return {
      score,
      updated: false,
      reason: 'locked-tuplet-slot',
    };
  }

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

  if (canUpdateScoreEventInPlace(update)) {
    return {
      score: replaceScoreEventInPlace(
        score,
        found.staffId,
        found.measureIndex,
        found.voiceIndex,
        eventId,
        candidateEvent,
      ),
      updated: true,
    };
  }

  const scoreWithoutEvent = deleteScoreEvent(score, eventId);
  const result = writeScoreEvent(
    scoreWithoutEvent,
    targetStaffId,
    targetMeasureIndex,
    candidateEvent,
    {
      allowSameStartPitchedReplacement: false,
      allowInvalidMeasure: update.allowInvalidMeasure,
      voiceIndex: targetVoiceIndex,
    },
  );

  return {
    score: result.placed ? result.score : score,
    updated: result.placed,
    reason: result.reason,
  };
}

export function tryFlipScoreEventStemDirection(
  score: Score,
  eventId: string,
): FlipStemDirectionResult {
  const context = getStemDirectionContext(score, eventId);

  if (!context) {
    return {
      score,
      updated: false,
      reason: 'missing-event',
    };
  }

  if (!isStemmedScoreEvent(context.event) || !context.direction) {
    return {
      score,
      updated: false,
      reason: 'missing-stem',
    };
  }

  const direction = getOppositeStemDirection(context.direction);
  const eventIds = getAttachedStemDirectionEventIds(score, eventId);

  if (eventIds.length === 0) {
    return {
      score,
      updated: false,
      reason: 'missing-stem',
    };
  }

  let nextScore = score;

  for (const targetEventId of eventIds) {
    const result = tryUpdateScoreEvent(nextScore, targetEventId, {
      stemDirection: direction,
    });

    if (!result.updated) {
      return {
        score,
        updated: false,
        reason: result.reason,
      };
    }

    nextScore = result.score;
  }

  return {
    score: nextScore,
    updated: true,
    direction,
    eventIds,
  };
}
