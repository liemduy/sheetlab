import type {
  Clef,
  Measure,
  Score,
  ScoreEvent,
  StemDirection,
} from './types';
import { findScoreEventContext } from './eventLookup';
import {
  getEventPitches,
  isGeneratedRestEvent,
  isPitchedScoreEvent,
} from './events';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from './pitchRange';
import { getActiveClef } from './clefChanges';

const BEAMABLE_DURATIONS = new Set<ScoreEvent['duration']>([
  'eighth',
  'sixteenth',
  'thirtySecond',
  'sixtyFourth',
]);
const STEMMED_DURATIONS = new Set<ScoreEvent['duration']>([
  'half',
  'quarter',
  'eighth',
  'sixteenth',
  'thirtySecond',
  'sixtyFourth',
]);

export function isStemDirection(value: unknown): value is StemDirection {
  return value === 'up' || value === 'down';
}

export function isStemmedScoreEvent(event: ScoreEvent) {
  return isPitchedScoreEvent(event) && STEMMED_DURATIONS.has(event.duration);
}

function isBeamableScoreEvent(event: ScoreEvent) {
  return isPitchedScoreEvent(event) && BEAMABLE_DURATIONS.has(event.duration);
}

function getDefaultBeamGroupBeats(score: Score) {
  if (
    score.timeSignature.beatUnit === 8 &&
    score.timeSignature.beats > 3 &&
    score.timeSignature.beats % 3 === 0
  ) {
    return 3 * (4 / score.timeSignature.beatUnit);
  }

  return 4 / score.timeSignature.beatUnit;
}

function getBeamGroupIndex(score: Score, event: ScoreEvent) {
  const groupBeats = getDefaultBeamGroupBeats(score);

  return Math.floor((event.beat + 0.0001) / groupBeats);
}

function hasMultipleVisibleVoices(measure: Measure) {
  return (
    measure.voices.filter((voice) =>
      voice.events.some(
        (event) => !isGeneratedRestEvent(event) && isPitchedScoreEvent(event),
      ),
    ).length > 1
  );
}

export function getAutomaticStemDirection({
  clef,
  event,
  hasMultipleVoices,
  voiceIndex,
}: {
  clef: Clef;
  event: ScoreEvent;
  hasMultipleVoices: boolean;
  voiceIndex: number;
}): StemDirection | null {
  if (!isStemmedScoreEvent(event)) {
    return null;
  }

  if (hasMultipleVoices) {
    return voiceIndex === 0 ? 'up' : 'down';
  }

  const eventPitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, clef),
  );

  if (eventPitches.length === 0) {
    return null;
  }

  const averagePitchValue =
    eventPitches.reduce(
      (total, pitch) => total + pitchToDiatonicValue(pitch),
      0,
    ) / eventPitches.length;
  const middleLinePitchValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]) - 4;

  return averagePitchValue >= middleLinePitchValue ? 'down' : 'up';
}

export function getEffectiveStemDirection({
  clef,
  event,
  hasMultipleVoices,
  voiceIndex,
}: {
  clef: Clef;
  event: ScoreEvent;
  hasMultipleVoices: boolean;
  voiceIndex: number;
}): StemDirection | null {
  return (
    event.stemDirection ??
    getAutomaticStemDirection({
      clef,
      event,
      hasMultipleVoices,
      voiceIndex,
    })
  );
}

export function getOppositeStemDirection(direction: StemDirection): StemDirection {
  return direction === 'up' ? 'down' : 'up';
}

export function getStemDirectionContext(score: Score, eventId: string) {
  const context = findScoreEventContext(score, eventId);
  const staff = score.parts
    .flatMap((part) => part.staves)
    .find((candidate) => candidate.id === context?.staffId);
  const measure = staff?.measures.find(
    (candidate) => candidate.index === context?.measureIndex,
  );

  if (!context || !staff || !measure) {
    return null;
  }

  const hasMultipleVoices = hasMultipleVisibleVoices(measure);
  const activeClef = getActiveClef(
    score,
    staff.id,
    context.measureIndex,
    context.event.beat,
  );
  const direction = getEffectiveStemDirection({
    clef: activeClef,
    event: context.event,
    hasMultipleVoices,
    voiceIndex: context.voiceIndex,
  });

  return {
    ...context,
    direction,
    hasMultipleVoices,
    measure,
    staff,
  };
}

export function getAttachedStemDirectionEventIds(score: Score, eventId: string) {
  const context = getStemDirectionContext(score, eventId);

  if (!context || !isStemmedScoreEvent(context.event)) {
    return [];
  }

  if (!isBeamableScoreEvent(context.event)) {
    return [eventId];
  }

  const voiceEvents = [
    ...(context.measure.voices[context.voiceIndex]?.events ?? []),
  ].sort((first, second) => first.beat - second.beat);
  const selectedIndex = voiceEvents.findIndex((event) => event.id === eventId);

  if (selectedIndex === -1) {
    return [eventId];
  }

  if (context.event.tuplet) {
    return voiceEvents
      .filter(
        (event) =>
          isBeamableScoreEvent(event) &&
          event.tuplet?.id === context.event.tuplet?.id,
      )
      .map((event) => event.id);
  }

  const selectedBeamGroupIndex = getBeamGroupIndex(score, context.event);
  const isAttachedBeamPeer = (event: ScoreEvent) =>
    !isGeneratedRestEvent(event) &&
    isBeamableScoreEvent(event) &&
    !event.tuplet &&
    getBeamGroupIndex(score, event) === selectedBeamGroupIndex;
  let startIndex = selectedIndex;
  let endIndex = selectedIndex;

  while (
    startIndex > 0 &&
    voiceEvents[startIndex - 1] &&
    isAttachedBeamPeer(voiceEvents[startIndex - 1])
  ) {
    startIndex -= 1;
  }

  while (
    endIndex < voiceEvents.length - 1 &&
    voiceEvents[endIndex + 1] &&
    isAttachedBeamPeer(voiceEvents[endIndex + 1])
  ) {
    endIndex += 1;
  }

  return voiceEvents
    .slice(startIndex, endIndex + 1)
    .filter(isBeamableScoreEvent)
    .map((event) => event.id);
}
