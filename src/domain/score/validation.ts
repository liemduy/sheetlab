import type {
  Accidental,
  Clef,
  DurationValue,
  KeySignature,
  KeySignatureAccidental,
  NoteStep,
  PageSize,
  RepeatJumpKind,
  Score,
  ScoreEvent,
  ScoreType,
  StaffId,
} from './types';
import { isRepeatJumpKind } from './repeatJumps';

const SCORE_TYPES = new Set<ScoreType>(['treble', 'grand']);
const PAGE_SIZES = new Set<PageSize>(['a4', 'letter']);
const STAFF_IDS = new Set<StaffId>(['treble', 'bass']);
const CLEFS = new Set<Clef>(['treble', 'bass']);
const NOTE_STEPS = new Set<NoteStep>(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const ACCIDENTALS = new Set<Accidental>(['natural', 'sharp', 'flat']);
const KEY_SIGNATURE_ACCIDENTALS = new Set<KeySignatureAccidental>([
  'sharp',
  'flat',
]);
const DURATIONS = new Set<DurationValue>([
  'whole',
  'half',
  'quarter',
  'eighth',
  'sixteenth',
  'thirtySecond',
]);
const KEY_SIGNATURES = new Set<KeySignature>([
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPitch(value: unknown) {
  return (
    isRecord(value) &&
    NOTE_STEPS.has(value.step as NoteStep) &&
    isNumber(value.octave) &&
    (value.accidental === undefined ||
      ACCIDENTALS.has(value.accidental as Accidental))
  );
}

function isKeySignatureSymbol(value: unknown) {
  return (
    isRecord(value) &&
    isString(value.id) &&
    KEY_SIGNATURE_ACCIDENTALS.has(
      value.accidental as KeySignatureAccidental,
    ) &&
    NOTE_STEPS.has(value.step as NoteStep)
  );
}

function isScoreEvent(value: unknown): value is ScoreEvent {
  if (!isRecord(value)) {
    return false;
  }

  const baseIsValid =
    isString(value.id) &&
    DURATIONS.has(value.duration as DurationValue) &&
    isNumber(value.beat) &&
    (value.dots === undefined ||
      (isNumber(value.dots) && value.dots >= 0 && value.dots <= 1));

  if (!baseIsValid) {
    return false;
  }

  if (value.kind === 'rest') {
    return true;
  }

  if (value.kind === 'note') {
    return isPitch(value.pitch);
  }

  return (
    value.kind === 'chord' &&
    Array.isArray(value.pitches) &&
    value.pitches.length > 0 &&
    value.pitches.every(isPitch)
  );
}

export function isScore(value: unknown): value is Score {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.composer) &&
    SCORE_TYPES.has(value.type as ScoreType) &&
    PAGE_SIZES.has(value.pageSize as PageSize) &&
    isNumber(value.tempo) &&
    isRecord(value.timeSignature) &&
    isNumber(value.timeSignature.beats) &&
    isNumber(value.timeSignature.beatUnit) &&
    Array.isArray(value.parts) &&
    value.parts.every(
      (part) =>
        isRecord(part) &&
        isString(part.id) &&
        isString(part.name) &&
        Array.isArray(part.staves) &&
        part.staves.every(
          (staff) =>
            isRecord(staff) &&
            STAFF_IDS.has(staff.id as StaffId) &&
            CLEFS.has(staff.clef as Clef) &&
            Array.isArray(staff.measures) &&
            staff.measures.every(
              (measure) =>
                isRecord(measure) &&
                isString(measure.id) &&
                isNumber(measure.index) &&
                (measure.keySignature === undefined ||
                  KEY_SIGNATURES.has(measure.keySignature as KeySignature)) &&
                (measure.keySignatureSymbols === undefined ||
                  (Array.isArray(measure.keySignatureSymbols) &&
                    measure.keySignatureSymbols.every(isKeySignatureSymbol))) &&
                (measure.repeatJump === undefined ||
                  isRepeatJumpKind(measure.repeatJump as RepeatJumpKind)) &&
                Array.isArray(measure.voices) &&
                measure.voices.every(
                  (voice) =>
                    isRecord(voice) &&
                    isString(voice.id) &&
                    Array.isArray(voice.events) &&
                    voice.events.every(isScoreEvent),
                ),
            ),
        ),
    )
  );
}

export function assertScore(value: unknown): asserts value is Score {
  if (!isScore(value)) {
    throw new Error('Invalid SheetLab score project');
  }
}
