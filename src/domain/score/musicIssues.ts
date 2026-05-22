import { getEventDurationTicks } from './eventDuration';
import {
  getEventPitches,
  isGeneratedRestEvent,
  isPitchedScoreEvent,
} from './events';
import type { ScoreEventContext } from './eventLookup';
import { applyActiveKeySignatureToPitch } from './keySignatures';
import { pitchesMatch } from './noteConnections';
import { getRepeatPlaybackIssues } from './repeatJumps';
import { getScoreRhythmIssues } from './rhythm';
import {
  getTupletSlotEffectiveBeats,
  isSupportedTupletActualNotes,
} from './tuplets';
import { beatToTick, getMeasureTicks } from './ticks';
import type {
  NotationMark,
  RangeNotationMark,
  Score,
  ScorePosition,
  StaffId,
  TieMark,
} from './types';

export type ScoreMusicIssueCategory =
  | 'clef-change'
  | 'identity'
  | 'lyric-map'
  | 'range-mark'
  | 'repeat'
  | 'rhythm'
  | 'slur'
  | 'tie'
  | 'tuplet';

export interface ScoreMusicIssue {
  category: ScoreMusicIssueCategory;
  eventId?: string;
  kind: string;
  measureIndex?: number;
  message: string;
  severity: 'error' | 'warning';
  staffId?: StaffId;
  voiceIndex?: number;
}

type EventContextById = Map<string, ScoreEventContext>;

function getAllEventContexts(score: Score): ScoreEventContext[] {
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

function getEventContextById(eventContexts: readonly ScoreEventContext[]) {
  return new Map(
    eventContexts.map((context) => [context.event.id, context]),
  );
}

function getIssueLocation(context: ScoreEventContext) {
  return {
    eventId: context.event.id,
    measureIndex: context.measureIndex,
    staffId: context.staffId,
    voiceIndex: context.voiceIndex,
  };
}

function getAbsoluteEventStartTick(score: Score, context: ScoreEventContext) {
  return (
    context.measureIndex * getMeasureTicks(score.timeSignature) +
    beatToTick(context.event.beat)
  );
}

function getAbsoluteEventEndTick(score: Score, context: ScoreEventContext) {
  return getAbsoluteEventStartTick(score, context) + getEventDurationTicks(context.event);
}

function getResolvedPitchKey(score: Score, context: ScoreEventContext, pitchIndex: number) {
  const pitch = getEventPitches(context.event)[pitchIndex];

  if (!pitch) {
    return null;
  }

  return applyActiveKeySignatureToPitch(score, context.measureIndex, pitch);
}

function getTieIssues(
  score: Score,
  sourceContext: ScoreEventContext,
  tie: TieMark,
  eventContextById: EventContextById,
): ScoreMusicIssue[] {
  const targetContext = eventContextById.get(tie.targetEventId);
  const location = getIssueLocation(sourceContext);

  if (!isPitchedScoreEvent(sourceContext.event)) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-source-not-pitched',
        message: `Tie source ${sourceContext.event.id} is not a pitched event`,
        severity: 'error',
      },
    ];
  }

  if (!targetContext) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-target-missing',
        message: `Tie from ${sourceContext.event.id} targets missing event ${tie.targetEventId}`,
        severity: 'error',
      },
    ];
  }

  if (!isPitchedScoreEvent(targetContext.event)) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-target-not-pitched',
        message: `Tie from ${sourceContext.event.id} targets a rest`,
        severity: 'error',
      },
    ];
  }

  if (
    targetContext.staffId !== sourceContext.staffId ||
    targetContext.voiceIndex !== sourceContext.voiceIndex
  ) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-cross-voice',
        message: `Tie from ${sourceContext.event.id} must stay in the same staff and voice`,
        severity: 'error',
      },
    ];
  }

  if (
    Math.abs(
      getAbsoluteEventEndTick(score, sourceContext) -
        getAbsoluteEventStartTick(score, targetContext),
    ) > 1
  ) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-not-adjacent',
        message: `Tie from ${sourceContext.event.id} must connect adjacent noteheads`,
        severity: 'error',
      },
    ];
  }

  const sourcePitch = getResolvedPitchKey(score, sourceContext, tie.pitchIndex);
  const targetPitch = getResolvedPitchKey(score, targetContext, tie.targetPitchIndex);

  if (!sourcePitch || !targetPitch || !pitchesMatch(sourcePitch, targetPitch)) {
    return [
      {
        ...location,
        category: 'tie',
        kind: 'tie-pitch-mismatch',
        message: `Tie from ${sourceContext.event.id} must connect the same pitch`,
        severity: 'error',
      },
    ];
  }

  return [];
}

function getSlurIssues(
  score: Score,
  sourceContext: ScoreEventContext,
  eventContextById: EventContextById,
): ScoreMusicIssue[] {
  return (sourceContext.event.slurs ?? []).flatMap((slur) => {
    const targetContext = eventContextById.get(slur.targetEventId);
    const location = getIssueLocation(sourceContext);

    if (!isPitchedScoreEvent(sourceContext.event)) {
      return [
        {
          ...location,
          category: 'slur',
          kind: 'slur-source-not-pitched',
          message: `Slur source ${sourceContext.event.id} is not a pitched event`,
          severity: 'error',
        } satisfies ScoreMusicIssue,
      ];
    }

    if (!targetContext) {
      return [
        {
          ...location,
          category: 'slur',
          kind: 'slur-target-missing',
          message: `Slur from ${sourceContext.event.id} targets missing event ${slur.targetEventId}`,
          severity: 'error',
        } satisfies ScoreMusicIssue,
      ];
    }

    if (!isPitchedScoreEvent(targetContext.event)) {
      return [
        {
          ...location,
          category: 'slur',
          kind: 'slur-target-not-pitched',
          message: `Slur from ${sourceContext.event.id} targets a rest`,
          severity: 'error',
        } satisfies ScoreMusicIssue,
      ];
    }

    if (getAbsoluteEventStartTick(score, targetContext) <= getAbsoluteEventStartTick(score, sourceContext)) {
      return [
        {
          ...location,
          category: 'slur',
          kind: 'slur-target-not-after-source',
          message: `Slur from ${sourceContext.event.id} must target a later note`,
          severity: 'error',
        } satisfies ScoreMusicIssue,
      ];
    }

    return [];
  });
}

function getLyricMapIssues(
  score: Score,
  sourceContext: ScoreEventContext,
  eventContextById: EventContextById,
) {
  const lyricMap = sourceContext.event.lyricMap;

  if (!lyricMap) {
    return [];
  }

  const location = getIssueLocation(sourceContext);
  const issues: ScoreMusicIssue[] = [];

  if (!sourceContext.event.lyric) {
    issues.push({
      ...location,
      category: 'lyric-map',
      kind: 'lyric-map-source-has-no-lyric',
      message: `Lyric map source ${sourceContext.event.id} has no lyric text`,
      severity: 'warning',
    });
  }

  if (lyricMap.eventIds.length === 0) {
    issues.push({
      ...location,
      category: 'lyric-map',
      kind: 'lyric-map-empty',
      message: `Lyric map source ${sourceContext.event.id} has no mapped notes`,
      severity: 'error',
    });
    return issues;
  }

  if (!lyricMap.eventIds.includes(sourceContext.event.id)) {
    issues.push({
      ...location,
      category: 'lyric-map',
      kind: 'lyric-map-source-not-in-range',
      message: `Lyric map source ${sourceContext.event.id} should include itself`,
      severity: 'warning',
    });
  }

  const mappedContexts = lyricMap.eventIds.map((eventId) => ({
    context: eventContextById.get(eventId),
    eventId,
  }));

  mappedContexts.forEach(({ context, eventId }) => {
    if (!context) {
      issues.push({
        ...location,
        category: 'lyric-map',
        kind: 'lyric-map-target-missing',
        message: `Lyric map source ${sourceContext.event.id} targets missing event ${eventId}`,
        severity: 'error',
      });
      return;
    }

    if (
      context.staffId !== sourceContext.staffId ||
      context.voiceIndex !== sourceContext.voiceIndex
    ) {
      issues.push({
        ...location,
        category: 'lyric-map',
        kind: 'lyric-map-cross-voice',
        message: `Lyric map source ${sourceContext.event.id} should map notes in the same voice`,
        severity: 'error',
      });
    }
  });

  const foundContexts = mappedContexts
    .flatMap(({ context }) => (context ? [context] : []))
    .filter((context) => !isGeneratedRestEvent(context.event));
  const sortedIds = [...foundContexts]
    .sort(
      (first, second) =>
        getAbsoluteEventStartTick(score, first) -
          getAbsoluteEventStartTick(score, second) ||
        first.event.id.localeCompare(second.event.id),
    )
    .map((context) => context.event.id);

  if (
    sortedIds.length === lyricMap.eventIds.length &&
    sortedIds.some((eventId, index) => eventId !== lyricMap.eventIds[index])
  ) {
    issues.push({
      ...location,
      category: 'lyric-map',
      kind: 'lyric-map-not-forward',
      message: `Lyric map source ${sourceContext.event.id} should follow score order`,
      severity: 'warning',
    });
  }

  return issues;
}

function getTupletIssues(
  score: Score,
  eventContexts: readonly ScoreEventContext[],
) {
  const groups = new Map<string, ScoreEventContext[]>();
  const issues: ScoreMusicIssue[] = [];

  eventContexts.forEach((context) => {
    const tuplet = context.event.tuplet;

    if (!tuplet) {
      return;
    }

    if (!isSupportedTupletActualNotes(tuplet.actualNotes)) {
      issues.push({
        ...getIssueLocation(context),
        category: 'tuplet',
        kind: 'tuplet-actual-notes-unsupported',
        message: `Tuplet ${tuplet.id} uses unsupported actual note count ${tuplet.actualNotes}`,
        severity: 'error',
      });
    }

    if (tuplet.normalNotes <= 0) {
      issues.push({
        ...getIssueLocation(context),
        category: 'tuplet',
        kind: 'tuplet-normal-notes-invalid',
        message: `Tuplet ${tuplet.id} has invalid normal note count ${tuplet.normalNotes}`,
        severity: 'error',
      });
    }

    const groupKey = [
      context.staffId,
      context.measureIndex,
      context.voiceIndex,
      tuplet.id,
    ].join(':');
    const group = groups.get(groupKey) ?? [];

    group.push(context);
    groups.set(groupKey, group);
  });

  groups.forEach((contexts) => {
    const first = contexts[0];

    if (!first?.event.tuplet) {
      return;
    }

    const tuplet = first.event.tuplet;
    const location = getIssueLocation(first);
    const indexes = contexts
      .map((context) => context.event.tuplet?.index ?? -1)
      .sort((firstIndex, secondIndex) => firstIndex - secondIndex);
    const expectedIndexes = Array.from(
      { length: tuplet.actualNotes },
      (_, index) => index,
    );

    if (
      contexts.some(
        (context) =>
          context.event.tuplet?.actualNotes !== tuplet.actualNotes ||
          context.event.tuplet?.normalNotes !== tuplet.normalNotes ||
          context.event.duration !== first.event.duration,
      )
    ) {
      issues.push({
        ...location,
        category: 'tuplet',
        kind: 'tuplet-mixed-definition',
        message: `Tuplet ${tuplet.id} mixes duration or ratio definitions`,
        severity: 'error',
      });
    }

    if (
      indexes.length !== expectedIndexes.length ||
      indexes.some((index, position) => index !== expectedIndexes[position])
    ) {
      issues.push({
        ...location,
        category: 'tuplet',
        kind: 'tuplet-incomplete',
        message: `Tuplet ${tuplet.id} must contain indexes 0-${tuplet.actualNotes - 1}`,
        severity: 'error',
      });
      return;
    }

    const sortedContexts = [...contexts].sort(
      (firstContext, secondContext) =>
        (firstContext.event.tuplet?.index ?? 0) -
        (secondContext.event.tuplet?.index ?? 0),
    );
    const firstBeat = sortedContexts[0]?.event.beat ?? 0;

    if (!isSupportedTupletActualNotes(tuplet.actualNotes)) {
      return;
    }

    const beatStep = getTupletSlotEffectiveBeats(
      first.event.duration,
      tuplet.actualNotes,
      tuplet.normalNotes,
    );

    sortedContexts.forEach((context, index) => {
      const expectedBeat = firstBeat + beatStep * index;

      if (Math.abs(context.event.beat - expectedBeat) > 0.001) {
        issues.push({
          ...getIssueLocation(context),
          category: 'tuplet',
          kind: 'tuplet-spacing-invalid',
          message: `Tuplet ${tuplet.id} slot ${index + 1} is not spaced by its effective duration`,
          severity: 'error',
        });
      }
    });
  });

  return issues;
}

function measureExists(score: Score, position: ScorePosition) {
  return score.parts.some((part) =>
    part.staves.some(
      (staff) =>
        staff.id === position.staffId &&
        staff.measures.some((measure) => measure.index === position.measureIndex),
    ),
  );
}

function isRangeMark(mark: NotationMark): mark is RangeNotationMark {
  return mark.scope === 'range';
}

function getRangeMarkIssues(
  score: Score,
  eventContextById: EventContextById,
) {
  return (score.marks ?? []).flatMap((mark): ScoreMusicIssue[] => {
    if (!isRangeMark(mark)) {
      return [];
    }

    const issues: ScoreMusicIssue[] = [];
    const sourceContext = mark.sourceEventId
      ? eventContextById.get(mark.sourceEventId)
      : null;
    const targetContext = mark.targetEventId
      ? eventContextById.get(mark.targetEventId)
      : null;
    const location = {
      measureIndex: mark.start.measureIndex,
      staffId: mark.start.staffId,
      voiceIndex: mark.start.voiceIndex,
    };

    if (!measureExists(score, mark.start) || !measureExists(score, mark.end)) {
      issues.push({
        ...location,
        category: 'range-mark',
        eventId: mark.sourceEventId,
        kind: 'range-position-missing',
        message: `Range mark ${mark.id} points outside the score`,
        severity: 'error',
      });
    }

    if (mark.sourceEventId && !sourceContext) {
      issues.push({
        ...location,
        category: 'range-mark',
        eventId: mark.sourceEventId,
        kind: 'range-source-missing',
        message: `Range mark ${mark.id} has missing source event ${mark.sourceEventId}`,
        severity: 'error',
      });
    }

    if (mark.targetEventId && !targetContext) {
      issues.push({
        ...location,
        category: 'range-mark',
        eventId: mark.sourceEventId,
        kind: 'range-target-missing',
        message: `Range mark ${mark.id} has missing target event ${mark.targetEventId}`,
        severity: 'error',
      });
    }

    if (
      mark.kind === 'ottava' &&
      sourceContext &&
      targetContext &&
      (sourceContext.staffId !== targetContext.staffId ||
        sourceContext.voiceIndex !== targetContext.voiceIndex)
    ) {
      issues.push({
        ...location,
        category: 'range-mark',
        eventId: mark.sourceEventId,
        kind: 'ottava-cross-voice',
        message: `Ottava ${mark.id} must stay in one staff and voice`,
        severity: 'error',
      });
    }

    return issues;
  });
}

function getClefChangeIssues(score: Score) {
  const measureTicks = getMeasureTicks(score.timeSignature);
  const issues: ScoreMusicIssue[] = [];

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        const beats = new Set<number>();

        (measure.clefChanges ?? []).forEach((clefChange) => {
          const beatTick = beatToTick(clefChange.beat);

          if (beatTick < 0 || beatTick >= measureTicks) {
            issues.push({
              category: 'clef-change',
              kind: 'clef-change-out-of-measure',
              measureIndex: measure.index,
              message: `Clef change ${clefChange.id} is outside the measure`,
              severity: 'error',
              staffId: staff.id,
            });
          }

          if (beats.has(beatTick)) {
            issues.push({
              category: 'clef-change',
              kind: 'clef-change-duplicate-beat',
              measureIndex: measure.index,
              message: `Measure ${measure.index + 1} has multiple clef changes at beat ${clefChange.beat + 1}`,
              severity: 'warning',
              staffId: staff.id,
            });
          }

          beats.add(beatTick);
        });
      });
    });
  });

  return issues;
}

function getIdentityIssues(eventContexts: readonly ScoreEventContext[]) {
  const issues: ScoreMusicIssue[] = [];
  const eventIds = new Map<string, ScoreEventContext>();

  eventContexts.forEach((context) => {
    const existing = eventIds.get(context.event.id);

    if (existing) {
      issues.push({
        ...getIssueLocation(context),
        category: 'identity',
        kind: 'duplicate-event-id',
        message: `Duplicate event id ${context.event.id} also appears in measure ${existing.measureIndex + 1}`,
        severity: 'error',
      });
    }

    eventIds.set(context.event.id, context);
  });

  return issues;
}

export function getScoreMusicIssues(
  score: Score,
  rhythmIssues = getScoreRhythmIssues(score),
): ScoreMusicIssue[] {
  const eventContexts = getAllEventContexts(score);
  const eventContextById = getEventContextById(eventContexts);
  const issues: ScoreMusicIssue[] = [
    ...getIdentityIssues(eventContexts),
    ...rhythmIssues.map(
      (issue): ScoreMusicIssue => ({
        category: 'rhythm',
        kind: `rhythm-${issue.reason}`,
        measureIndex: issue.measureIndex,
        message: `Voice ${issue.voiceId} has rhythm ${issue.reason}`,
        severity: 'error',
        staffId: issue.staffId,
      }),
    ),
    ...getRepeatPlaybackIssues(score).map(
      (issue): ScoreMusicIssue => ({
        category: 'repeat',
        kind: issue.kind,
        measureIndex: issue.measureIndex,
        message: `Repeat jump ${issue.repeatJump} is missing ${issue.kind.replace('missing-', '')}`,
        severity: 'error',
      }),
    ),
    ...getTupletIssues(score, eventContexts),
    ...getRangeMarkIssues(score, eventContextById),
    ...getClefChangeIssues(score),
  ];

  eventContexts.forEach((context) => {
    issues.push(
      ...getLyricMapIssues(score, context, eventContextById),
      ...getSlurIssues(score, context, eventContextById),
      ...(context.event.ties ?? []).flatMap((tie) =>
        getTieIssues(score, context, tie, eventContextById),
      ),
    );

    if (
      (context.event.ties?.length || context.event.slurs?.length) &&
      !isPitchedScoreEvent(context.event)
    ) {
      issues.push({
        ...getIssueLocation(context),
        category: 'range-mark',
        kind: 'connection-on-rest',
        message: `Rest ${context.event.id} cannot carry tie or slur marks`,
        severity: 'error',
      });
    }
  });

  return issues;
}
