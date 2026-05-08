import { createEmptyScore } from './factories';
import { setMeasureKeySignature } from './editing';
import type {
  Accidental,
  DurationValue,
  KeySignature,
  Measure,
  NoteStep,
  Pitch,
  Score,
  ScoreEvent,
  ScoreType,
  StaffId,
  TimeSignature,
} from './types';
import { getEventDots, getEventPitches } from './events';
import { getDurationBeats } from './durations';
import { getMeasureBeats, getTimeSignatureId } from './timeSignatures';
import { getActiveKeySignatureSelection, isKeySignature } from './keySignatures';

export interface AbcImportResult {
  score: Score;
  warnings: string[];
}

const ABC_UNIT_NOTE_VALUE = {
  denominator: 32,
  numerator: 1,
};
const ABC_UNITS_PER_QUARTER = 8;
const DEFAULT_ABC_UNIT_BEATS = 0.125;
const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beats: 4,
  beatUnit: 4,
};
const DURATION_UNITS = {
  whole: 32,
  half: 16,
  quarter: 8,
  eighth: 4,
  sixteenth: 2,
  thirtySecond: 1,
} satisfies Record<DurationValue, number>;
const SUPPORTED_DURATION_BEATS = [
  { duration: 'whole', dots: 0, beats: 4 },
  { duration: 'half', dots: 1, beats: 3 },
  { duration: 'half', dots: 0, beats: 2 },
  { duration: 'quarter', dots: 1, beats: 1.5 },
  { duration: 'quarter', dots: 0, beats: 1 },
  { duration: 'eighth', dots: 1, beats: 0.75 },
  { duration: 'eighth', dots: 0, beats: 0.5 },
  { duration: 'sixteenth', dots: 1, beats: 0.375 },
  { duration: 'sixteenth', dots: 0, beats: 0.25 },
  { duration: 'thirtySecond', dots: 1, beats: 0.1875 },
  { duration: 'thirtySecond', dots: 0, beats: 0.125 },
] satisfies Array<{ beats: number; dots: number; duration: DurationValue }>;
const STEP_ORDER: NoteStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

interface ParsedAbcHeaders {
  composer: string;
  keySignature: KeySignature;
  tempo: number;
  timeSignature: TimeSignature;
  title: string;
  unitBeats: number;
  voiceStaffById: Map<string, StaffId>;
}

interface ParseVoiceState {
  beat: number;
  eventsByMeasure: Map<number, ScoreEvent[]>;
  measureIndex: number;
}

function sanitizeAbcField(value: string) {
  return value.replace(/\r?\n/g, ' ').trim();
}

function getAbcBaseName(score: Score) {
  return (
    score.title
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'sheetlab-score'
  );
}

function getEventUnits(event: ScoreEvent) {
  return Math.round(
    DURATION_UNITS[event.duration] * (event.dots ? 1.5 : 1),
  );
}

function getAbcDurationSuffix(event: ScoreEvent) {
  const units = getEventUnits(event);

  return units === 1 ? '' : String(units);
}

function encodePitch(pitch: Pitch) {
  const accidental =
    pitch.accidental === 'sharp'
      ? '^'
      : pitch.accidental === 'flat'
        ? '_'
        : pitch.accidental === 'natural'
          ? '='
          : '';
  const octave = pitch.octave;
  const base =
    octave >= 5
      ? `${pitch.step.toLowerCase()}${"'".repeat(Math.max(0, octave - 5))}`
      : `${pitch.step}${','.repeat(Math.max(0, 4 - octave))}`;

  return `${accidental}${base}`;
}

function encodeEvent(event: ScoreEvent) {
  const suffix = getAbcDurationSuffix(event);

  if (event.kind === 'rest') {
    return `z${suffix}`;
  }

  const pitches = getEventPitches(event).map(encodePitch);

  if (pitches.length > 1) {
    return `[${pitches.join('')}]${suffix}`;
  }

  return `${pitches[0] ?? 'z'}${suffix}`;
}

function encodeMeasure(measure: Measure) {
  const events = [...(measure.voices[0]?.events ?? [])].sort(
    (first, second) => first.beat - second.beat,
  );

  return events.length > 0 ? events.map(encodeEvent).join(' ') : 'z32';
}

function encodeStaffVoice(score: Score, staffId: StaffId) {
  const staff = score.parts[0]?.staves.find((candidate) => candidate.id === staffId);

  if (!staff) {
    return '';
  }

  const voiceId = staffId === 'bass' ? 'B' : 'T';
  const measures = staff.measures.map(encodeMeasure);
  const lines: string[] = [];

  for (let index = 0; index < measures.length; index += 4) {
    lines.push(`[V:${voiceId}] ${measures.slice(index, index + 4).join(' | ')} |`);
  }

  return lines.join('\n');
}

export function exportScoreToAbc(score: Score) {
  const keySignature = getActiveKeySignatureSelection(score, 0);
  const abcKey = keySignature === 'custom' ? 'C' : keySignature;
  const headers = [
    'X:1',
    `T:${sanitizeAbcField(score.title) || 'Untitled Piano Exercise'}`,
    score.composer.trim() ? `C:${sanitizeAbcField(score.composer)}` : null,
    `M:${getTimeSignatureId(score.timeSignature)}`,
    `L:${ABC_UNIT_NOTE_VALUE.numerator}/${ABC_UNIT_NOTE_VALUE.denominator}`,
    `Q:1/4=${Math.round(score.tempo)}`,
    score.type === 'grand' ? '%%score (T B)' : null,
    score.type === 'grand' ? 'V:T clef=treble name="Right hand"' : null,
    score.type === 'grand' ? 'V:B clef=bass name="Left hand"' : null,
    `K:${abcKey}`,
  ].filter(Boolean);
  const body =
    score.type === 'grand'
      ? `${encodeStaffVoice(score, 'treble')}\n${encodeStaffVoice(score, 'bass')}`
      : encodeStaffVoice(score, 'treble');

  return `${headers.join('\n')}\n${body}\n`;
}

export function createAbcNotationBlob(score: Score) {
  return new Blob([exportScoreToAbc(score)], {
    type: 'text/vnd.abc',
  });
}

export function getAbcNotationFileName(score: Score) {
  return `${getAbcBaseName(score)}.abc`;
}

function parseTimeSignature(value: string, warnings: string[]): TimeSignature {
  const normalized = value.trim();

  if (normalized === 'C') {
    return DEFAULT_TIME_SIGNATURE;
  }

  if (normalized === 'C|') {
    return {
      beats: 2,
      beatUnit: 2,
    };
  }

  const match = normalized.match(/^(\d+)\/(\d+)$/);

  if (!match) {
    warnings.push(`Unsupported meter "${value}", using 4/4`);
    return DEFAULT_TIME_SIGNATURE;
  }

  return {
    beats: Number(match[1]),
    beatUnit: Number(match[2]),
  };
}

function parseUnitBeats(value: string, warnings: string[]) {
  const match = value.trim().match(/^(\d+)\/(\d+)$/);

  if (!match) {
    warnings.push(`Unsupported default note length "${value}", using 1/8`);
    return DEFAULT_ABC_UNIT_BEATS;
  }

  return (Number(match[1]) / Number(match[2])) * 4;
}

function parseTempo(value: string) {
  const match = value.match(/=\s*(\d+)/) ?? value.match(/(\d+)/);

  return match ? Number(match[1]) : 96;
}

function parseKeySignature(value: string, warnings: string[]) {
  const token = value.trim().split(/\s+/)[0] ?? 'C';

  if (isKeySignature(token)) {
    return token;
  }

  warnings.push(`Unsupported key signature "${value}", using C`);
  return 'C';
}

function parseVoiceHeader(value: string): [string, StaffId] {
  const [id = 'T', ...attributes] = value.trim().split(/\s+/);
  const details = attributes.join(' ').toLowerCase();
  const staffId =
    details.includes('clef=bass') ||
    /\b(left|bass|lh)\b/i.test(id) ||
    /\b(left|bass|lh)\b/i.test(details)
      ? 'bass'
      : 'treble';

  return [id, staffId];
}

function splitHeadersAndBody(abc: string, warnings: string[]): ParsedAbcHeaders & {
  bodyLines: string[];
} {
  const headers: ParsedAbcHeaders = {
    composer: '',
    keySignature: 'C',
    tempo: 96,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    title: 'Imported ABC Score',
    unitBeats: DEFAULT_ABC_UNIT_BEATS,
    voiceStaffById: new Map(),
  };
  const bodyLines: string[] = [];
  let hasSeenKeyHeader = false;

  abc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%'))
    .forEach((line) => {
      const headerMatch = line.match(/^([A-Za-z]):\s*(.*)$/);

      if (headerMatch && !hasSeenKeyHeader) {
        const [, key, value = ''] = headerMatch;

        if (key === 'T') {
          headers.title = value.trim() || headers.title;
        } else if (key === 'C') {
          headers.composer = value.trim();
        } else if (key === 'M') {
          headers.timeSignature = parseTimeSignature(value, warnings);
        } else if (key === 'L') {
          headers.unitBeats = parseUnitBeats(value, warnings);
        } else if (key === 'Q') {
          headers.tempo = parseTempo(value);
        } else if (key === 'V') {
          const [voiceId, staffId] = parseVoiceHeader(value);
          headers.voiceStaffById.set(voiceId, staffId);
        } else if (key === 'K') {
          headers.keySignature = parseKeySignature(value, warnings);
          hasSeenKeyHeader = true;
        }
        return;
      }

      if (headerMatch?.[1] === 'V') {
        const [, , value = ''] = headerMatch;
        const [voiceId, staffId] = parseVoiceHeader(value);
        headers.voiceStaffById.set(voiceId, staffId);
        bodyLines.push(`[V:${voiceId}]`);
        return;
      }

      bodyLines.push(line);
    });

  if (headers.voiceStaffById.size === 0) {
    headers.voiceStaffById.set('T', 'treble');
  }

  return {
    ...headers,
    bodyLines,
  };
}

function parseDurationMultiplier(text: string) {
  if (!text) {
    return 1;
  }

  if (/^\d+$/.test(text)) {
    return Number(text);
  }

  if (/^\/+$/.test(text)) {
    return 1 / 2 ** text.length;
  }

  const fractionMatch = text.match(/^(\d*)\/(\d*)$/);

  if (!fractionMatch) {
    return null;
  }

  const numerator = fractionMatch[1] ? Number(fractionMatch[1]) : 1;
  const denominator = fractionMatch[2] ? Number(fractionMatch[2]) : 2;

  return denominator === 0 ? null : numerator / denominator;
}

function getDurationFromBeats(beats: number) {
  return SUPPORTED_DURATION_BEATS.find(
    (entry) => Math.abs(entry.beats - beats) < 0.0001,
  );
}

function parseAbcPitch(token: string): Pitch | null {
  const match = token.match(/^([_=^]?)([A-Ga-g])([,']*)$/);

  if (!match) {
    return null;
  }

  const [, accidentalToken = '', note = 'C', octaveMarks = ''] = match;
  const isLower = note === note.toLowerCase();
  const accidental: Accidental | undefined =
    accidentalToken === '^'
      ? 'sharp'
      : accidentalToken === '_'
        ? 'flat'
        : accidentalToken === '='
          ? 'natural'
          : undefined;
  const step = note.toUpperCase() as NoteStep;
  const octaveBase = isLower ? 5 : 4;
  const octave =
    octaveBase +
    [...octaveMarks].reduce((offset, mark) => {
      if (mark === "'") {
        return offset + 1;
      }
      if (mark === ',') {
        return offset - 1;
      }
      return offset;
    }, 0);

  return {
    step,
    octave,
    accidental,
  };
}

function readDurationSuffix(source: string, startIndex: number) {
  let index = startIndex;

  while (index < source.length && /[0-9/]/.test(source[index] ?? '')) {
    index += 1;
  }

  return {
    nextIndex: index,
    text: source.slice(startIndex, index),
  };
}

function readPitchToken(source: string, startIndex: number) {
  let index = startIndex;
  let token = '';

  if (/[_=^]/.test(source[index] ?? '')) {
    token += source[index];
    index += 1;
  }

  if (!/[A-Ga-g]/.test(source[index] ?? '')) {
    return null;
  }

  token += source[index];
  index += 1;

  while (index < source.length && /[,']/.test(source[index] ?? '')) {
    token += source[index];
    index += 1;
  }

  return {
    nextIndex: index,
    pitch: parseAbcPitch(token),
  };
}

function createVoiceState(): ParseVoiceState {
  return {
    beat: 0,
    eventsByMeasure: new Map(),
    measureIndex: 0,
  };
}

function getVoiceState(states: Map<StaffId, ParseVoiceState>, staffId: StaffId) {
  const existingState = states.get(staffId);

  if (existingState) {
    return existingState;
  }

  const nextState = createVoiceState();

  states.set(staffId, nextState);
  return nextState;
}

function pushEvent(
  state: ParseVoiceState,
  event: ScoreEvent,
  timeSignature: TimeSignature,
) {
  const measureBeats = getMeasureBeats(timeSignature);

  if (state.beat >= measureBeats) {
    state.measureIndex += 1;
    state.beat = 0;
  }

  const events = state.eventsByMeasure.get(state.measureIndex) ?? [];
  events.push(event);
  state.eventsByMeasure.set(state.measureIndex, events);
  state.beat += getDurationBeats(event.duration, event.dots);
}

function advanceMeasure(state: ParseVoiceState) {
  state.measureIndex += 1;
  state.beat = 0;
}

function parseAbcBody(
  bodyLines: string[],
  headers: ParsedAbcHeaders,
  warnings: string[],
) {
  const statesByStaff = new Map<StaffId, ParseVoiceState>();
  let activeVoiceId = headers.voiceStaffById.keys().next().value ?? 'T';
  let eventCounter = 1;

  function getActiveStaffId() {
    return headers.voiceStaffById.get(activeVoiceId) ?? 'treble';
  }

  function createEvent(
    kind: 'chord' | 'note' | 'rest',
    beat: number,
    duration: DurationValue,
    dots: number,
    pitches: Pitch[] = [],
  ): ScoreEvent {
    const id = `abc-${eventCounter}`;
    eventCounter += 1;

    if (kind === 'rest') {
      return {
        id,
        beat,
        duration,
        dots: dots || undefined,
        kind: 'rest',
      };
    }

    if (kind === 'chord' && pitches.length > 1) {
      return {
        id,
        beat,
        duration,
        dots: dots || undefined,
        kind: 'chord',
        pitches,
      };
    }

    return {
      id,
      beat,
      duration,
      dots: dots || undefined,
      kind: 'note',
      pitch: pitches[0] ?? {
        octave: 4,
        step: 'C',
      },
    };
  }

  const body = bodyLines.join(' ');
  let index = 0;

  while (index < body.length) {
    const char = body[index] ?? '';

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (body.startsWith('[V:', index)) {
      const endIndex = body.indexOf(']', index);

      if (endIndex === -1) {
        warnings.push('Unclosed ABC voice marker ignored');
        break;
      }

      activeVoiceId = body.slice(index + 3, endIndex).trim() || activeVoiceId;
      index = endIndex + 1;
      continue;
    }

    if (char === '|') {
      const state = getVoiceState(statesByStaff, getActiveStaffId());
      advanceMeasure(state);
      index += body[index + 1] === ':' || body[index + 1] === '|' ? 2 : 1;
      continue;
    }

    if (char === ':' && body[index + 1] === '|') {
      const state = getVoiceState(statesByStaff, getActiveStaffId());
      advanceMeasure(state);
      index += 2;
      continue;
    }

    if (char === '[') {
      const endIndex = body.indexOf(']', index);

      if (endIndex === -1) {
        warnings.push('Unclosed ABC chord ignored');
        break;
      }

      const chordText = body.slice(index + 1, endIndex);
      const pitches: Pitch[] = [];
      let chordIndex = 0;

      while (chordIndex < chordText.length) {
        const parsedPitch = readPitchToken(chordText, chordIndex);

        if (!parsedPitch) {
          chordIndex += 1;
          continue;
        }

        if (parsedPitch.pitch) {
          pitches.push(parsedPitch.pitch);
        }
        chordIndex = parsedPitch.nextIndex;
      }

      const durationSuffix = readDurationSuffix(body, endIndex + 1);
      const multiplier = parseDurationMultiplier(durationSuffix.text);
      const duration = multiplier
        ? getDurationFromBeats(headers.unitBeats * multiplier)
        : null;

      if (duration && pitches.length > 0) {
        const staffId = getActiveStaffId();
        const state = getVoiceState(statesByStaff, staffId);
        pushEvent(
          state,
          createEvent(
            pitches.length > 1 ? 'chord' : 'note',
            state.beat,
            duration.duration,
            duration.dots,
            pitches,
          ),
          headers.timeSignature,
        );
      } else {
        warnings.push(`Unsupported ABC chord "${chordText}" ignored`);
      }

      index = durationSuffix.nextIndex;
      continue;
    }

    if (/[zZxX]/.test(char)) {
      const durationSuffix = readDurationSuffix(body, index + 1);
      const multiplier = parseDurationMultiplier(durationSuffix.text);
      const duration = multiplier
        ? getDurationFromBeats(headers.unitBeats * multiplier)
        : null;

      if (duration) {
        const state = getVoiceState(statesByStaff, getActiveStaffId());
        pushEvent(
          state,
          createEvent('rest', state.beat, duration.duration, duration.dots),
          headers.timeSignature,
        );
      } else {
        warnings.push(`Unsupported ABC rest duration "${durationSuffix.text}" ignored`);
      }

      index = durationSuffix.nextIndex;
      continue;
    }

    const parsedPitch = readPitchToken(body, index);

    if (parsedPitch?.pitch) {
      const durationSuffix = readDurationSuffix(body, parsedPitch.nextIndex);
      const multiplier = parseDurationMultiplier(durationSuffix.text);
      const duration = multiplier
        ? getDurationFromBeats(headers.unitBeats * multiplier)
        : null;

      if (duration) {
        const state = getVoiceState(statesByStaff, getActiveStaffId());
        pushEvent(
          state,
          createEvent(
            'note',
            state.beat,
            duration.duration,
            duration.dots,
            [parsedPitch.pitch],
          ),
          headers.timeSignature,
        );
      } else {
        warnings.push(
          `Unsupported ABC note duration "${durationSuffix.text}" ignored`,
        );
      }

      index = durationSuffix.nextIndex;
      continue;
    }

    index += 1;
  }

  return statesByStaff;
}

function copyEventsIntoScore(score: Score, statesByStaff: Map<StaffId, ParseVoiceState>) {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => {
        const state = statesByStaff.get(staff.id);

        if (!state) {
          return staff;
        }

        return {
          ...staff,
          measures: staff.measures.map((measure) => ({
            ...measure,
            voices: measure.voices.map((voice, voiceIndex) =>
              voiceIndex === 0
                ? {
                    ...voice,
                    events: [...(state.eventsByMeasure.get(measure.index) ?? [])],
                  }
                : voice,
            ),
          })),
        };
      }),
    })),
  };
}

export function importScoreFromAbc(abc: string): AbcImportResult {
  const warnings: string[] = [];
  const headers = splitHeadersAndBody(abc, warnings);
  const statesByStaff = parseAbcBody(headers.bodyLines, headers, warnings);
  const scoreType: ScoreType = [...headers.voiceStaffById.values()].includes('bass')
    ? 'grand'
    : 'treble';
  const measureCount = Math.max(
    4,
    ...[...statesByStaff.values()].map((state) => state.measureIndex + 1),
  );
  const baseScore = createEmptyScore(scoreType, {
    composer: headers.composer,
    measureCount,
    tempo: headers.tempo,
    timeSignature: headers.timeSignature,
    title: headers.title,
  });
  const scoreWithKey = setMeasureKeySignature(baseScore, 0, headers.keySignature);

  return {
    score: copyEventsIntoScore(scoreWithKey, statesByStaff),
    warnings,
  };
}
