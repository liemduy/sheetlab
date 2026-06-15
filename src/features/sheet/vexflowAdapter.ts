import type {
  Accidental,
  Clef,
  DurationValue,
  Pitch,
  ScoreEvent,
} from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';
import { getEventDurationBeats } from '../../domain/score/eventDuration';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';

export interface VexFlowNoteSpec {
  eventId: string;
  beat: number;
  keys: string[];
  duration: string;
  clef: Clef;
  accidental?: Accidental;
  kind: ScoreEvent['kind'];
}

export interface VexFlowMeasureNoteSpec extends VexFlowNoteSpec {
  hidden: boolean;
  source: 'event' | 'gap';
}

const VEXFLOW_DURATION: Record<DurationValue, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
  thirtySecond: '32',
  sixtyFourth: '64',
};

const REST_KEY_BY_CLEF: Record<Clef, string> = {
  treble: 'b/4',
  bass: 'd/3',
};

const DURATION_BY_BEATS: Array<{ duration: DurationValue; beats: number }> = [
  { duration: 'whole', beats: 4 },
  { duration: 'half', beats: 2 },
  { duration: 'quarter', beats: 1 },
  { duration: 'eighth', beats: 0.5 },
  { duration: 'sixteenth', beats: 0.25 },
  { duration: 'thirtySecond', beats: 0.125 },
  { duration: 'sixtyFourth', beats: 0.0625 },
];

const BEAT_EPSILON = 0.001;

export function pitchToVexFlowKey(pitch: Pitch) {
  return `${pitch.step.toLowerCase()}/${pitch.octave}`;
}

export function durationToVexFlowDuration(
  duration: DurationValue,
  isRest = false,
) {
  return `${VEXFLOW_DURATION[duration]}${isRest ? 'r' : ''}`;
}

export function accidentalToVexFlow(accidental: Accidental) {
  return accidental === 'sharp' ? '#' : accidental === 'flat' ? 'b' : 'n';
}

export function scoreEventToVexFlowSpec(
  event: ScoreEvent,
  clef: Clef,
): VexFlowNoteSpec {
  if (event.kind === 'rest') {
    return {
      eventId: event.id,
      beat: event.beat,
      keys: [REST_KEY_BY_CLEF[clef]],
      duration: durationToVexFlowDuration(event.duration, true),
      clef,
      kind: 'rest',
    };
  }

  const pitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, clef),
  );

  return {
    eventId: event.id,
    beat: event.beat,
    keys: pitches.map(pitchToVexFlowKey),
    duration: durationToVexFlowDuration(event.duration),
    clef,
    accidental: pitches[0]?.accidental,
    kind: event.kind,
  };
}

export function splitBeatsIntoDurations(beats: number): DurationValue[] {
  const durations: DurationValue[] = [];
  let remaining = beats;

  for (const { duration, beats: durationBeats } of DURATION_BY_BEATS) {
    while (remaining + BEAT_EPSILON >= durationBeats) {
      durations.push(duration);
      remaining = Number((remaining - durationBeats).toFixed(4));
    }
  }

  if (Math.abs(remaining) > BEAT_EPSILON) {
    throw new Error(`Cannot represent ${beats} beats with MVP durations`);
  }

  return durations;
}

function createGapRestSpec(
  clef: Clef,
  beat: number,
  duration: DurationValue,
): VexFlowMeasureNoteSpec {
  return {
    eventId: `gap-${clef}-${beat.toFixed(2)}-${duration}`,
    keys: [REST_KEY_BY_CLEF[clef]],
    duration: durationToVexFlowDuration(duration, true),
    clef,
    kind: 'rest',
    beat,
    hidden: true,
    source: 'gap',
  };
}

export function buildVexFlowMeasureNotes(
  events: ScoreEvent[],
  clef: Clef,
  beatsPerMeasure: number,
): VexFlowMeasureNoteSpec[] {
  const notes: VexFlowMeasureNoteSpec[] = [];
  let cursorBeat = 0;

  for (const event of [...events].sort((a, b) => a.beat - b.beat)) {
    const gapBeats = event.beat - cursorBeat;

    if (gapBeats > BEAT_EPSILON) {
      for (const duration of splitBeatsIntoDurations(gapBeats)) {
        notes.push(createGapRestSpec(clef, cursorBeat, duration));
        cursorBeat += DURATION_BY_BEATS.find((entry) => entry.duration === duration)?.beats ?? 0;
      }
    }

    notes.push({
      ...scoreEventToVexFlowSpec(event, clef),
      beat: event.beat,
      hidden: false,
      source: 'event',
    });

    cursorBeat = Math.max(
      cursorBeat,
      event.beat + getEventDurationBeats(event),
    );
  }

  const trailingGapBeats = beatsPerMeasure - cursorBeat;

  if (trailingGapBeats > BEAT_EPSILON) {
    for (const duration of splitBeatsIntoDurations(trailingGapBeats)) {
      notes.push(createGapRestSpec(clef, cursorBeat, duration));
      cursorBeat += DURATION_BY_BEATS.find((entry) => entry.duration === duration)?.beats ?? 0;
    }
  }

  return notes;
}
