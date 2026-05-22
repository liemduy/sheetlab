import type {
  ArticulationKind,
  Pitch,
  RepeatJumpKind,
  Score,
  ScoreEvent,
  StaffId,
  TieMark,
} from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';
import {
  getEventDurationBeats,
  getEventDurationTicks,
} from '../../domain/score/eventDuration';
import {
  applyKeySignatureMapToPitch,
  createKeySignatureSymbols,
  getKeySignatureSymbolsAccidentalMap,
} from '../../domain/score/keySignatures';
import {
  OTTAVA_OCTAVE_SHIFT,
  applyOttavaToPitch,
  getOttavaMarks,
} from '../../domain/score/ottava';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getMeasureRepeatJump } from '../../domain/score/repeatJumps';
import { TICKS_PER_QUARTER, getMeasureTicks } from '../../domain/score/ticks';

export interface PlaybackTimelineEvent {
  id: string;
  staffId: StaffId;
  measureIndex: number;
  beat: number;
  startBeat: number;
  playbackStartBeat: number;
  durationBeats: number;
  startSeconds: number;
  durationSeconds: number;
  soundDurationSeconds: number;
  velocity: number;
  kind: ScoreEvent['kind'];
  pitch?: Pitch;
  pitches: Pitch[];
  articulations?: ArticulationKind[];
  sustainedEventIds?: string[];
}

const DEFAULT_PLAYBACK_VELOCITY = 0.82;

interface PlaybackEventContext {
  event: ScoreEvent;
  measureIndex: number;
  staffId: StaffId;
  staffIndex: number;
  voiceIndex: number;
}

export function getSecondsPerBeat(tempo: number) {
  return 60 / tempo;
}

function getArticulationSoundRatio(articulations: readonly ArticulationKind[]) {
  if (articulations.includes('caesura')) {
    return 0.35;
  }

  if (articulations.includes('staccatissimo')) {
    return 0.35;
  }

  if (articulations.includes('breath')) {
    return 0.7;
  }

  if (articulations.includes('staccato') && articulations.includes('tenuto')) {
    return 0.75;
  }

  if (articulations.includes('staccato')) {
    return 0.5;
  }

  if (articulations.includes('tenuto')) {
    return 0.98;
  }

  return 1;
}

function getArticulationVelocity(articulations: readonly ArticulationKind[]) {
  const multiplier = articulations.includes('marcato')
    ? 1.25
    : articulations.includes('accent')
      ? 1.15
      : 1;

  return Math.min(1, Number((DEFAULT_PLAYBACK_VELOCITY * multiplier).toFixed(3)));
}

function getScoreMeasureCount(score: Score) {
  return score.parts[0]?.staves[0]?.measures.length ?? 0;
}

function getPitchKey(pitch: Pitch) {
  return `${pitch.step}${pitch.accidental ?? ''}${pitch.octave}`;
}

function pitchesMatch(first: Pitch, second: Pitch) {
  return getPitchKey(first) === getPitchKey(second);
}

function getAllPlaybackEventContexts(score: Score) {
  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff, staffIndex) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice, voiceIndex) =>
          voice.events.map((event) => ({
            event,
            measureIndex: measure.index,
            staffId: staff.id,
            staffIndex,
            voiceIndex,
          })),
        ),
      ),
    ),
  );
}

function getEventContextById(eventContexts: readonly PlaybackEventContext[]) {
  return new Map(
    eventContexts.map((eventContext) => [eventContext.event.id, eventContext]),
  );
}

function getAbsoluteEventStartTick(
  score: Score,
  context: Pick<PlaybackEventContext, 'event' | 'measureIndex'>,
) {
  return (
    context.measureIndex * getMeasureTicks(score.timeSignature) +
    Math.round(context.event.beat * TICKS_PER_QUARTER)
  );
}

function getAbsoluteEventEndTick(
  score: Score,
  context: Pick<PlaybackEventContext, 'event' | 'measureIndex'>,
) {
  return getAbsoluteEventStartTick(score, context) + getEventDurationTicks(context.event);
}

function isPitchedPlaybackEvent(event: ScoreEvent) {
  return event.kind === 'note' || event.kind === 'chord';
}

function isValidTimelineTie(
  score: Score,
  eventContextById: ReadonlyMap<string, PlaybackEventContext>,
  sourceContext: PlaybackEventContext,
  tie: TieMark,
) {
  const targetContext = eventContextById.get(tie.targetEventId);

  if (
    !targetContext ||
    targetContext.staffId !== sourceContext.staffId ||
    targetContext.voiceIndex !== sourceContext.voiceIndex ||
    !isPitchedPlaybackEvent(sourceContext.event) ||
    !isPitchedPlaybackEvent(targetContext.event)
  ) {
    return false;
  }

  if (
    Math.abs(
      getAbsoluteEventEndTick(score, sourceContext) -
        getAbsoluteEventStartTick(score, targetContext),
    ) > 1
  ) {
    return false;
  }

  const sourcePitch = getEventPitches(sourceContext.event)[tie.pitchIndex];
  const targetPitch = getEventPitches(targetContext.event)[tie.targetPitchIndex];

  return Boolean(sourcePitch && targetPitch && pitchesMatch(sourcePitch, targetPitch));
}

function getIncomingTiePitchIndexesByEventId(
  score: Score,
  eventContexts: readonly PlaybackEventContext[],
  eventContextById: ReadonlyMap<string, PlaybackEventContext>,
) {
  const incomingTiePitchIndexesByEventId = new Map<string, Set<number>>();

  eventContexts.forEach((sourceContext) => {
    sourceContext.event.ties?.forEach((tie) => {
      if (!isValidTimelineTie(score, eventContextById, sourceContext, tie)) {
        return;
      }

      const incomingPitchIndexes =
        incomingTiePitchIndexesByEventId.get(tie.targetEventId) ?? new Set<number>();

      incomingPitchIndexes.add(tie.targetPitchIndex);
      incomingTiePitchIndexesByEventId.set(
        tie.targetEventId,
        incomingPitchIndexes,
      );
    });
  });

  return incomingTiePitchIndexesByEventId;
}

function getTieChain(
  score: Score,
  eventContextById: ReadonlyMap<string, PlaybackEventContext>,
  eventId: string,
  pitchIndex: number,
  seenEventIds = new Set<string>(),
): {
  durationBeats: number;
  eventIds: string[];
} {
  const context = eventContextById.get(eventId);

  if (!context || seenEventIds.has(eventId)) {
    return {
      durationBeats: 0,
      eventIds: [],
    };
  }

  seenEventIds.add(eventId);

  const ownDurationBeats = getEventDurationBeats(context.event);
  const tie = context.event.ties?.find(
    (candidate) =>
      candidate.pitchIndex === pitchIndex &&
      isValidTimelineTie(score, eventContextById, context, candidate),
  );

  if (!tie) {
    return {
      durationBeats: ownDurationBeats,
      eventIds: [eventId],
    };
  }

  const nextChain = getTieChain(
    score,
    eventContextById,
    tie.targetEventId,
    tie.targetPitchIndex,
    seenEventIds,
  );

  return {
    durationBeats: ownDurationBeats + nextChain.durationBeats,
    eventIds: [eventId, ...nextChain.eventIds],
  };
}

function getMeasuresByStaffId(score: Score) {
  return new Map(
    score.parts.flatMap((part) =>
      part.staves.map((staff) => [
        staff.id,
        new Map(staff.measures.map((measure) => [measure.index, measure])),
      ] as const),
    ),
  );
}

function getKeySignatureMapsByMeasureIndex(score: Score) {
  const measures = score.parts[0]?.staves[0]?.measures ?? [];
  const keySignatureMapsByMeasureIndex = new Map<
    number,
    ReturnType<typeof getKeySignatureSymbolsAccidentalMap>
  >();
  let activeSymbols = createKeySignatureSymbols('C');

  measures.forEach((measure) => {
    if (measure.keySignatureSymbols !== undefined) {
      activeSymbols = measure.keySignatureSymbols;
    } else if (measure.keySignature) {
      activeSymbols = createKeySignatureSymbols(measure.keySignature);
    }

    keySignatureMapsByMeasureIndex.set(
      measure.index,
      getKeySignatureSymbolsAccidentalMap(activeSymbols),
    );
  });

  return keySignatureMapsByMeasureIndex;
}

function getOttavaShiftAtPosition(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  beat: number,
) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const scoreBeat = measureIndex * beatsPerMeasure + beat;

  return getOttavaMarks(score).reduce((shift, mark) => {
    if (mark.start.staffId !== staffId || !mark.ottava) {
      return shift;
    }

    const startBeat = mark.start.measureIndex * beatsPerMeasure + mark.start.beat;
    const endBeat = mark.end.measureIndex * beatsPerMeasure + mark.end.beat;

    return scoreBeat >= startBeat && scoreBeat < endBeat
      ? shift + OTTAVA_OCTAVE_SHIFT[mark.ottava]
      : shift;
  }, 0);
}

function isRepeatEnd(kind: ReturnType<typeof getMeasureRepeatJump>) {
  return kind === 'repeat-end' || kind === 'repeat-both';
}

function isRepeatStart(kind: ReturnType<typeof getMeasureRepeatJump>) {
  return kind === 'repeat-start' || kind === 'repeat-both';
}

function getEndingPass(kind: RepeatJumpKind | null) {
  if (kind === 'ending-1') {
    return 1;
  }

  if (kind === 'ending-2') {
    return 2;
  }

  if (kind === 'ending-3') {
    return 3;
  }

  return null;
}

function getHighestEndingPass(
  score: Score,
  startMeasureIndex: number,
  endMeasureIndex: number,
) {
  let highestEndingPass = 1;

  for (
    let measureIndex = startMeasureIndex;
    measureIndex <= endMeasureIndex;
    measureIndex += 1
  ) {
    highestEndingPass = Math.max(
      highestEndingPass,
      getEndingPass(getMeasureRepeatJump(score, measureIndex)) ?? 1,
    );
  }

  return Math.max(2, highestEndingPass);
}

function shouldPlayMeasureInRepeatPass(kind: RepeatJumpKind | null, pass: number) {
  const endingPass = getEndingPass(kind);

  return endingPass === null || endingPass === pass;
}

function getMeasureRange(
  startMeasureIndex: number,
  endMeasureIndex: number,
  measureCount: number,
) {
  const start = Math.max(0, startMeasureIndex);
  const end = Math.min(measureCount - 1, endMeasureIndex);

  if (end < start) {
    return [];
  }

  return Array.from(
    { length: end - start + 1 },
    (_, index) => start + index,
  );
}

function findFirstMeasureIndex(
  score: Score,
  measureCount: number,
  kind: RepeatJumpKind,
) {
  return getMeasureRange(0, measureCount - 1, measureCount).find(
    (measureIndex) => getMeasureRepeatJump(score, measureIndex) === kind,
  );
}

function findTerminalRepeatJumpIndex(
  score: Score,
  order: readonly number[],
) {
  return order.findIndex((measureIndex) => {
    const kind = getMeasureRepeatJump(score, measureIndex);

    return (
      kind === 'dc' ||
      kind === 'dc-al-fine' ||
      kind === 'dc-al-coda' ||
      kind === 'ds' ||
      kind === 'ds-al-fine' ||
      kind === 'ds-al-coda'
    );
  });
}

function buildLinearRepeatMeasureOrder(score: Score): number[] {
  const measureCount = getScoreMeasureCount(score);
  const order: number[] = [];
  const repeatEndPasses = new Map<number, number>();
  let repeatPass = 1;
  let repeatStartIndex = 0;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const repeatJump = getMeasureRepeatJump(score, measureIndex);

    if (isRepeatStart(repeatJump) && repeatPass === 1) {
      repeatStartIndex = measureIndex;
    }

    if (shouldPlayMeasureInRepeatPass(repeatJump, repeatPass)) {
      order.push(measureIndex);
    }

    if (isRepeatEnd(repeatJump)) {
      const nextPass = (repeatEndPasses.get(measureIndex) ?? 1) + 1;
      const highestEndingPass = getHighestEndingPass(
        score,
        repeatStartIndex,
        measureIndex,
      );

      if (nextPass <= highestEndingPass) {
        repeatEndPasses.set(measureIndex, nextPass);
        repeatPass = nextPass;
        measureIndex = repeatStartIndex - 1;
      } else {
        repeatPass = 1;
        repeatStartIndex = measureIndex + 1;
      }
    }
  }

  return order;
}

function groupPitchesByDuration(
  event: ScoreEvent,
  score: Score,
  pitchIndexes: number[],
  eventContextById: ReadonlyMap<string, PlaybackEventContext>,
) {
  const groups = new Map<
    number,
    {
      eventIds: Set<string>;
      indexes: number[];
    }
  >();

  pitchIndexes.forEach((pitchIndex) => {
    const tieChain = getTieChain(score, eventContextById, event.id, pitchIndex);
    const durationBeats = tieChain.durationBeats;
    const safeDurationBeats =
      durationBeats > 0 ? durationBeats : getEventDurationBeats(event);
    const group = groups.get(safeDurationBeats) ?? {
      eventIds: new Set<string>(),
      indexes: [],
    };

    group.indexes.push(pitchIndex);
    tieChain.eventIds.forEach((eventId) => group.eventIds.add(eventId));
    groups.set(safeDurationBeats, group);
  });

  return [...groups.entries()].map(([durationBeats, group]) => ({
    durationBeats,
    indexes: group.indexes,
    sustainedEventIds:
      group.eventIds.size > 1 ? [...group.eventIds] : undefined,
  }));
}

export function buildPlaybackMeasureOrder(score: Score): number[] {
  const measureCount = getScoreMeasureCount(score);
  const order = buildLinearRepeatMeasureOrder(score);
  const terminalOrderIndex = findTerminalRepeatJumpIndex(score, order);

  if (terminalOrderIndex < 0) {
    return order;
  }

  const terminalMeasureIndex = order[terminalOrderIndex];
  const terminalJump = terminalMeasureIndex !== undefined
    ? getMeasureRepeatJump(score, terminalMeasureIndex)
    : null;
  const prefix = order.slice(0, terminalOrderIndex + 1);
  const replayStartMeasureIndex =
    terminalJump === 'ds' ||
    terminalJump === 'ds-al-fine' ||
    terminalJump === 'ds-al-coda'
      ? findFirstMeasureIndex(score, measureCount, 'segno')
      : 0;

  if (replayStartMeasureIndex === undefined) {
    return order;
  }

  if (terminalJump === 'dc' || terminalJump === 'ds') {
    return [
      ...prefix,
      ...getMeasureRange(replayStartMeasureIndex, measureCount - 1, measureCount),
    ];
  }

  if (terminalJump === 'dc-al-fine' || terminalJump === 'ds-al-fine') {
    const fineMeasureIndex = findFirstMeasureIndex(score, measureCount, 'fine');

    return fineMeasureIndex === undefined
      ? order
      : [
          ...prefix,
          ...getMeasureRange(
            replayStartMeasureIndex,
            fineMeasureIndex,
            measureCount,
          ),
        ];
  }

  if (terminalJump === 'dc-al-coda' || terminalJump === 'ds-al-coda') {
    const toCodaMeasureIndex = findFirstMeasureIndex(
      score,
      measureCount,
      'to-coda',
    );
    const codaMeasureIndex = findFirstMeasureIndex(score, measureCount, 'coda');

    return toCodaMeasureIndex === undefined || codaMeasureIndex === undefined
      ? order
      : [
          ...prefix,
          ...getMeasureRange(
            replayStartMeasureIndex,
            toCodaMeasureIndex,
            measureCount,
          ),
          ...getMeasureRange(codaMeasureIndex, measureCount - 1, measureCount),
        ];
  }

  return order;
}

export function buildPlaybackTimeline(score: Score): PlaybackTimelineEvent[] {
  const secondsPerBeat = getSecondsPerBeat(score.tempo);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const measureOrder = buildPlaybackMeasureOrder(score);
  const eventContexts = getAllPlaybackEventContexts(score);
  const eventContextById = getEventContextById(eventContexts);
  const incomingTiePitchIndexesByEventId = getIncomingTiePitchIndexesByEventId(
    score,
    eventContexts,
    eventContextById,
  );
  const measuresByStaffId = getMeasuresByStaffId(score);
  const keySignatureMapsByMeasureIndex = getKeySignatureMapsByMeasureIndex(score);

  return measureOrder
    .flatMap((measureIndex, playbackMeasureIndex) => {
      const playbackMeasureStartBeat = playbackMeasureIndex * beatsPerMeasure;

      return score.parts.flatMap((part) =>
        part.staves.flatMap((staff) => {
          const measure = measuresByStaffId.get(staff.id)?.get(measureIndex);

          if (!measure) {
            return [];
          }

          return measure.voices.flatMap((voice) =>
            voice.events
              .filter((event) => event.kind !== 'rest')
              .flatMap((event) => {
                const sourcePitches = getEventPitches(event);
                const incomingTiePitchIndexes =
                  incomingTiePitchIndexesByEventId.get(event.id) ?? new Set<number>();
                const attackPitchIndexes = sourcePitches
                  .map((_, index) => index)
                  .filter((index) => !incomingTiePitchIndexes.has(index));
                const articulations = event.articulations ?? [];
                const startBeat = measure.index * beatsPerMeasure + event.beat;
                const playbackStartBeat = playbackMeasureStartBeat + event.beat;
                const keySignatureMap =
                  keySignatureMapsByMeasureIndex.get(measure.index) ??
                  getKeySignatureSymbolsAccidentalMap([]);
                const ottavaShift = getOttavaShiftAtPosition(
                  score,
                  staff.id,
                  measure.index,
                  event.beat,
                );

                return groupPitchesByDuration(
                  event,
                  score,
                  attackPitchIndexes,
                  eventContextById,
                )
                  .flatMap(({ durationBeats, indexes, sustainedEventIds }) => {
                    const durationSeconds = durationBeats * secondsPerBeat;
                    const pitches = indexes.flatMap((pitchIndex) => {
                      const pitch = sourcePitches[pitchIndex];

                      return pitch
                        ? [
                            applyOttavaToPitch(
                              applyKeySignatureMapToPitch(pitch, keySignatureMap),
                              ottavaShift,
                            ),
                          ]
                        : [];
                    });

                    if (pitches.length === 0) {
                      return [];
                    }

                    return [
                      {
                        id: event.id,
                        staffId: staff.id,
                        measureIndex: measure.index,
                        beat: event.beat,
                        startBeat,
                        playbackStartBeat,
                        durationBeats,
                        startSeconds: playbackStartBeat * secondsPerBeat,
                        durationSeconds,
                        soundDurationSeconds:
                          durationSeconds * getArticulationSoundRatio(articulations),
                        velocity: getArticulationVelocity(articulations),
                        kind: event.kind,
                        pitch: pitches[0],
                        pitches,
                        articulations:
                          articulations.length > 0 ? [...articulations] : undefined,
                        sustainedEventIds,
                      },
                    ];
                  });
              }),
          );
        }),
      );
    })
    .sort((a, b) => a.startSeconds - b.startSeconds || a.staffId.localeCompare(b.staffId));
}

export function getTimelineDurationSeconds(timeline: PlaybackTimelineEvent[]) {
  return timeline.reduce(
    (duration, event) =>
      Math.max(duration, event.startSeconds + event.durationSeconds),
    0,
  );
}

export function findPlaybackStartSecondsForEventId(
  timeline: PlaybackTimelineEvent[],
  eventId: string | null,
) {
  if (!eventId) {
    return null;
  }

  const event = timeline.find(
    (timelineEvent) =>
      timelineEvent.id === eventId ||
      timelineEvent.sustainedEventIds?.includes(eventId),
  );

  return event?.startSeconds ?? null;
}

export function getActiveTimelineEvent(
  timeline: PlaybackTimelineEvent[],
  elapsedSeconds: number,
) {
  return getActiveTimelineEvents(timeline, elapsedSeconds)[0] ?? null;
}

export function getActiveTimelineEvents(
  timeline: PlaybackTimelineEvent[],
  elapsedSeconds: number,
) {
  const activeEvents: PlaybackTimelineEvent[] = [];

  for (const event of timeline) {
    if (event.startSeconds > elapsedSeconds) {
      break;
    }

    if (elapsedSeconds < event.startSeconds + event.durationSeconds) {
      activeEvents.push(event);
    }
  }

  return activeEvents;
}

export function getPlaybackBeatAtSeconds(tempo: number, elapsedSeconds: number) {
  return elapsedSeconds / getSecondsPerBeat(tempo);
}

export function getPlaybackScoreBeatAtSeconds(
  timeline: PlaybackTimelineEvent[],
  tempo: number,
  elapsedSeconds: number,
) {
  const secondsPerBeat = getSecondsPerBeat(tempo);
  const activeEvent = getActiveTimelineEvent(timeline, elapsedSeconds);

  if (activeEvent) {
    return (
      activeEvent.startBeat +
      (elapsedSeconds - activeEvent.startSeconds) / secondsPerBeat
    );
  }

  let previousEvent: PlaybackTimelineEvent | undefined;

  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const event = timeline[index];

    if (event && event.startSeconds <= elapsedSeconds) {
      previousEvent = event;
      break;
    }
  }

  if (!previousEvent) {
    return getPlaybackBeatAtSeconds(tempo, elapsedSeconds);
  }

  return (
    previousEvent.startBeat +
    (elapsedSeconds - previousEvent.startSeconds) / secondsPerBeat
  );
}
