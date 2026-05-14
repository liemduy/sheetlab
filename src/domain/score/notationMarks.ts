import { getEventDurationBeats } from './eventDuration';
import { getEventPitches, isPitchedScoreEvent } from './events';
import type {
  BarlineNotationMark,
  MeasureNotationMark,
  NotationMark,
  NoteNotationMark,
  RangeNotationMark,
  RepeatJumpKind,
  Score,
  ScoreEvent,
  ScorePosition,
} from './types';

function eventPosition({
  measureIndex,
  scoreEvent,
  staffId,
  voiceIndex,
}: {
  measureIndex: number;
  scoreEvent: ScoreEvent;
  staffId: ScorePosition['staffId'];
  voiceIndex: number;
}): ScorePosition {
  return {
    beat: scoreEvent.beat,
    measureIndex,
    staffId,
    voiceIndex,
  };
}

function noteMark(
  event: ScoreEvent,
  kind: NoteNotationMark['kind'],
  value?: string,
): NoteNotationMark {
  return {
    eventId: event.id,
    id: `${event.id}:${kind}${value ? `:${value}` : ''}`,
    kind,
    scope: 'note',
    value,
  };
}

function tieMark({
  event,
  measureIndex,
  staffId,
  targetEventId,
  targetPitchIndex,
  voiceIndex,
}: {
  event: ScoreEvent;
  measureIndex: number;
  staffId: ScorePosition['staffId'];
  targetEventId: string;
  targetPitchIndex: number;
  voiceIndex: number;
}): RangeNotationMark {
  const start = eventPosition({ measureIndex, scoreEvent: event, staffId, voiceIndex });

  return {
    end: start,
    id: `${event.id}:tie:${targetEventId}:${targetPitchIndex}`,
    kind: 'tie',
    scope: 'range',
    sourceEventId: event.id,
    start,
    targetEventId,
  };
}

function slurMark({
  event,
  measureIndex,
  staffId,
  targetEventId,
  voiceIndex,
}: {
  event: ScoreEvent;
  measureIndex: number;
  staffId: ScorePosition['staffId'];
  targetEventId: string;
  voiceIndex: number;
}): RangeNotationMark {
  const start = eventPosition({ measureIndex, scoreEvent: event, staffId, voiceIndex });

  return {
    end: start,
    id: `${event.id}:slur:${targetEventId}`,
    kind: 'slur',
    scope: 'range',
    sourceEventId: event.id,
    start,
    targetEventId,
  };
}

function measureMark(
  measureIndex: number,
  kind: MeasureNotationMark['kind'],
  value: string,
): MeasureNotationMark {
  return {
    id: `measure-${measureIndex}:${kind}:${value}`,
    kind,
    measureIndex,
    scope: 'measure',
    value,
  };
}

function getRepeatBarlineMarks(
  measureIndex: number,
  repeatJump: RepeatJumpKind,
): BarlineNotationMark[] {
  if (repeatJump === 'repeat-start') {
    return [
      {
        id: `measure-${measureIndex}:repeat-start-barline`,
        kind: 'repeatStart',
        measureIndex,
        scope: 'barline',
      },
    ];
  }

  if (repeatJump === 'repeat-end') {
    return [
      {
        id: `measure-${measureIndex}:repeat-end-barline`,
        kind: 'repeatEnd',
        measureIndex,
        scope: 'barline',
      },
    ];
  }

  if (repeatJump === 'repeat-both') {
    return [
      {
        id: `measure-${measureIndex}:repeat-start-barline`,
        kind: 'repeatStart',
        measureIndex,
        scope: 'barline',
      },
      {
        id: `measure-${measureIndex}:repeat-end-barline`,
        kind: 'repeatEnd',
        measureIndex,
        scope: 'barline',
      },
    ];
  }

  return [];
}

function getLegacyEventMarks({
  event,
  measureIndex,
  staffId,
  voiceIndex,
}: {
  event: ScoreEvent;
  measureIndex: number;
  staffId: ScorePosition['staffId'];
  voiceIndex: number;
}): NotationMark[] {
  const marks: NotationMark[] = [];

  event.articulations?.forEach((articulation) =>
    marks.push(noteMark(event, 'articulation', articulation)),
  );

  if (event.chordSymbol) {
    marks.push(noteMark(event, 'chordSymbol', event.chordSymbol));
  }

  if (event.dynamic) {
    marks.push(noteMark(event, 'dynamic', event.dynamic));
  }

  if (event.fermata) {
    marks.push(noteMark(event, 'fermata'));
  }

  if (event.glissando) {
    marks.push(noteMark(event, 'glissando'));
  }

  if (event.hairpin) {
    marks.push(noteMark(event, 'hairpin', event.hairpin));
  }

  if (event.lyric) {
    marks.push(noteMark(event, 'lyric', event.lyric));
  }

  if (event.pedal) {
    marks.push(noteMark(event, 'pedal', event.pedal));
  }

  event.ties?.forEach((tie) =>
    marks.push(
      tieMark({
        event,
        measureIndex,
        staffId,
        targetEventId: tie.targetEventId,
        targetPitchIndex: tie.targetPitchIndex,
        voiceIndex,
      }),
    ),
  );

  event.slurs?.forEach((slur) =>
    marks.push(
      slurMark({
        event,
        measureIndex,
        staffId,
        targetEventId: slur.targetEventId,
        voiceIndex,
      }),
    ),
  );

  return marks;
}

export function getScoreNotationMarks(score: Score): NotationMark[] {
  const legacyMarks: NotationMark[] = [];

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        if (measure.repeatJump) {
          legacyMarks.push(
            measureMark(measure.index, 'repeatJump', measure.repeatJump),
            ...getRepeatBarlineMarks(measure.index, measure.repeatJump),
          );
        }

        if (measure.sectionMarker) {
          legacyMarks.push(
            measureMark(measure.index, 'sectionMarker', measure.sectionMarker),
          );
        }

        measure.voices.forEach((voice, voiceIndex) => {
          voice.events.forEach((event) => {
            legacyMarks.push(
              ...getLegacyEventMarks({
                event,
                measureIndex: measure.index,
                staffId: staff.id,
                voiceIndex,
              }),
            );
          });
        });
      });
    });
  });

  return [...legacyMarks, ...(score.marks ?? [])];
}

export function getExplicitRangeMarks(
  score: Score,
  kind?: RangeNotationMark['kind'],
) {
  return (score.marks ?? []).filter(
    (mark): mark is RangeNotationMark =>
      mark.scope === 'range' && (kind === undefined || mark.kind === kind),
  );
}

export function getScoreEventEndPosition({
  event,
  measureIndex,
  staffId,
  voiceIndex,
}: {
  event: ScoreEvent;
  measureIndex: number;
  staffId: ScorePosition['staffId'];
  voiceIndex: number;
}): ScorePosition {
  return {
    beat: event.beat + getEventDurationBeats(event),
    measureIndex,
    staffId,
    voiceIndex,
  };
}

export function getPitchedEventIdsInMarks(score: Score) {
  return new Set(
    getScoreNotationMarks(score).flatMap((mark) => {
      if (mark.scope === 'note') {
        return [mark.eventId];
      }

      if (mark.scope === 'range') {
        return [mark.sourceEventId, mark.targetEventId].filter(
          (eventId): eventId is string => Boolean(eventId),
        );
      }

      return [];
    }),
  );
}

export function hasPitchedEventMarks(score: Score, event: ScoreEvent) {
  return (
    isPitchedScoreEvent(event) &&
    getEventPitches(event).length > 0 &&
    getPitchedEventIdsInMarks(score).has(event.id)
  );
}
