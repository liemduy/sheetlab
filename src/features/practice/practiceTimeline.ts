import type { Pitch, Score, StaffId } from '../../domain/score/types';
import { pitchToMidi } from '../playback/pitch';
import { buildPlaybackTimeline } from '../playback/timeline';

export type PracticeHandMode = 'both' | 'left' | 'right';

export interface PracticeTargetVoiceRef {
  staffId: StaffId;
  voiceIndex: number;
}

export interface PracticeTarget {
  attackMidiNotes?: number[];
  beat: number;
  durationSeconds: number;
  eventIds: string[];
  expectedReleaseSeconds?: number;
  id: string;
  isGrace?: boolean;
  measureIndex: number;
  midiNotes: number[];
  pitches: Pitch[];
  sourceTimelineEventIds?: string[];
  staffId: StaffId;
  staffIds: StaffId[];
  startBeat: number;
  startSeconds: number;
  sustainedMidiNotes?: number[];
  voiceRefs: PracticeTargetVoiceRef[];
}

function getStaffAllowedByHandMode(staffId: StaffId, handMode: PracticeHandMode) {
  if (handMode === 'both') {
    return true;
  }

  return handMode === 'right' ? staffId === 'treble' : staffId === 'bass';
}

function getPracticeTargetVoiceRefs(
  events: ReturnType<typeof buildPlaybackTimeline>,
) {
  const refsByKey = new Map<string, PracticeTargetVoiceRef>();

  events.forEach((event) => {
    refsByKey.set(`${event.staffId}:${event.voiceIndex}`, {
      staffId: event.staffId,
      voiceIndex: event.voiceIndex,
    });
  });

  return [...refsByKey.values()].sort(
    (first, second) =>
      first.staffId.localeCompare(second.staffId) ||
      first.voiceIndex - second.voiceIndex,
  );
}

export function formatPracticeTargetVoiceLabel(
  target: Pick<PracticeTarget, 'staffIds' | 'voiceRefs'> | null,
) {
  if (!target) {
    return 'none';
  }

  if (target.voiceRefs.length === 0) {
    return target.staffIds.join(' + ') || 'none';
  }

  return target.voiceRefs
    .map(({ staffId, voiceIndex }) =>
      `${staffId === 'treble' ? 'RH' : 'LH'} V${voiceIndex + 1}`,
    )
    .join(' + ');
}

export function buildPracticeTargets(
  score: Score,
  {
    handMode = 'both',
    measureEnd,
    measureStart = 0,
  }: {
    handMode?: PracticeHandMode;
    measureEnd?: number;
    measureStart?: number;
  } = {},
): PracticeTarget[] {
  const measureEndIndex = measureEnd ?? Number.POSITIVE_INFINITY;

  const events = buildPlaybackTimeline(score)
    .filter((event) => getStaffAllowedByHandMode(event.staffId, handMode))
    .filter(
      (event) =>
        event.measureIndex >= measureStart &&
        event.measureIndex <= measureEndIndex,
    );
  const targetGroups = new Map<string, typeof events>();

  events.forEach((event) => {
    const key = [
      event.measureIndex,
      event.beat.toFixed(4),
      event.startSeconds.toFixed(4),
    ].join(':');
    const group = targetGroups.get(key) ?? [];

    group.push(event);
    targetGroups.set(key, group);
  });

  return [...targetGroups.values()]
    .map((group, index) => {
      const firstEvent = group[0];
      const eventIds = [
        ...new Set(
          group.flatMap((event) => event.sustainedEventIds ?? [event.id]),
        ),
      ];
      const pitches = group.flatMap((event) => event.pitches);
      const midiNotes = [...new Set(pitches.map(pitchToMidi))].sort(
        (a, b) => a - b,
      );
      const startSeconds = firstEvent?.startSeconds ?? 0;
      const durationSeconds = group.reduce(
        (candidateDurationSeconds, event) =>
          Math.max(
            candidateDurationSeconds,
            event.startSeconds + event.durationSeconds - startSeconds,
          ),
        0,
      );
      const voiceRefs = getPracticeTargetVoiceRefs(group);
      const sourceTimelineEventIds = group.map((event) => event.id);

      return {
        attackMidiNotes: midiNotes,
        beat: firstEvent?.beat ?? 0,
        durationSeconds,
        eventIds,
        expectedReleaseSeconds: startSeconds + durationSeconds,
        id: `${eventIds.join('+')}-${index}`,
        isGrace: sourceTimelineEventIds.every((eventId) =>
          eventId.includes(':grace:'),
        ),
        measureIndex: firstEvent?.measureIndex ?? 0,
        midiNotes,
        pitches,
        sourceTimelineEventIds,
        staffId: firstEvent?.staffId ?? 'treble',
        staffIds: [...new Set(group.map((event) => event.staffId))],
        startBeat: firstEvent?.startBeat ?? 0,
        startSeconds,
        sustainedMidiNotes: midiNotes,
        voiceRefs,
      };
    })
    .filter((target) => target.midiNotes.length > 0);
}

export function getPracticeTargetAtSeconds(
  targets: readonly PracticeTarget[],
  elapsedSeconds: number,
  toleranceSeconds = 0.28,
): PracticeTarget | null {
  let closestTarget: PracticeTarget | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  targets.forEach((target) => {
    const distance = Math.abs(target.startSeconds - elapsedSeconds);

    if (distance <= toleranceSeconds && distance < closestDistance) {
      closestDistance = distance;
      closestTarget = target;
    }
  });

  return closestTarget;
}

export function getNextUnfinishedTargetIndex(
  targets: readonly PracticeTarget[],
  completedTargetIds: ReadonlySet<string>,
): number {
  return targets.findIndex((target) => !completedTargetIds.has(target.id));
}
