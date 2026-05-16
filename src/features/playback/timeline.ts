import type {
  ArticulationKind,
  Pitch,
  RepeatJumpKind,
  Score,
  ScoreEvent,
  StaffId,
} from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';
import { getEventDurationBeats } from '../../domain/score/eventDuration';
import {
  getIncomingTiePitchIndexes,
  getTieChainDurationBeats,
  getTieChainEventIds,
} from '../../domain/score/noteConnections';
import {
  applyActiveKeySignatureToPitch,
} from '../../domain/score/keySignatures';
import { applyActiveOttavaToPitch } from '../../domain/score/ottava';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getMeasureRepeatJump } from '../../domain/score/repeatJumps';

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
) {
  const groups = new Map<number, number[]>();

  pitchIndexes.forEach((pitchIndex) => {
    const durationBeats = event.ties?.some((tie) => tie.pitchIndex === pitchIndex)
      ? getTieChainDurationBeats(score, event.id, pitchIndex)
      : getEventDurationBeats(event);
    const safeDurationBeats =
      durationBeats > 0 ? durationBeats : getEventDurationBeats(event);
    const group = groups.get(safeDurationBeats) ?? [];

    group.push(pitchIndex);
    groups.set(safeDurationBeats, group);
  });

  return [...groups.entries()].map(([durationBeats, indexes]) => ({
    durationBeats,
    indexes,
  }));
}

function getSustainedEventIds(
  score: Score,
  event: ScoreEvent,
  pitchIndexes: number[],
) {
  const eventIds = [
    ...new Set(
      pitchIndexes.flatMap((pitchIndex) =>
        getTieChainEventIds(score, event.id, pitchIndex),
      ),
    ),
  ];

  return eventIds.length > 1 ? eventIds : undefined;
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

  return measureOrder
    .flatMap((measureIndex, playbackMeasureIndex) => {
      const playbackMeasureStartBeat = playbackMeasureIndex * beatsPerMeasure;

      return score.parts.flatMap((part) =>
        part.staves.flatMap((staff) => {
          const measure = staff.measures.find(
            (candidate) => candidate.index === measureIndex,
          );

          if (!measure) {
            return [];
          }

          return measure.voices.flatMap((voice) =>
            voice.events
              .filter((event) => event.kind !== 'rest')
              .flatMap((event) => {
                const sourcePitches = getEventPitches(event);
                const incomingTiePitchIndexes = getIncomingTiePitchIndexes(
                  score,
                  event.id,
                );
                const attackPitchIndexes = sourcePitches
                  .map((_, index) => index)
                  .filter((index) => !incomingTiePitchIndexes.has(index));
                const articulations = event.articulations ?? [];
                const startBeat = measure.index * beatsPerMeasure + event.beat;
                const playbackStartBeat = playbackMeasureStartBeat + event.beat;

                return groupPitchesByDuration(event, score, attackPitchIndexes)
                  .flatMap(({ durationBeats, indexes }) => {
                    const durationSeconds = durationBeats * secondsPerBeat;
                    const pitches = indexes.flatMap((pitchIndex) => {
                      const pitch = sourcePitches[pitchIndex];

                      return pitch
                        ? [
                            applyActiveOttavaToPitch(
                              score,
                              staff.id,
                              measure.index,
                              event.beat,
                              applyActiveKeySignatureToPitch(
                                score,
                                measure.index,
                                pitch,
                              ),
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
                        sustainedEventIds: getSustainedEventIds(
                          score,
                          event,
                          indexes,
                        ),
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
  return timeline.filter(
    (event) =>
      elapsedSeconds >= event.startSeconds &&
      elapsedSeconds < event.startSeconds + event.durationSeconds,
  );
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

  const previousEvent = [...timeline]
    .filter((event) => event.startSeconds <= elapsedSeconds)
    .sort((a, b) => b.startSeconds - a.startSeconds)[0];

  if (!previousEvent) {
    return getPlaybackBeatAtSeconds(tempo, elapsedSeconds);
  }

  return (
    previousEvent.startBeat +
    (elapsedSeconds - previousEvent.startSeconds) / secondsPerBeat
  );
}
