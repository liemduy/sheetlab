import type {
  Accidental,
  ArticulationKind,
  AnnotationKind,
  AnnotationOffset,
  AnnotationPlacementSide,
  Clef,
  ClefChange,
  DurationValue,
  GraceNoteAttachment,
  HairpinMark,
  KeySignature,
  KeySignatureAccidental,
  LyricMap,
  NoteStep,
  PageSize,
  PedalMark,
  RepeatJumpKind,
  Score,
  ScoreEvent,
  SlurMark,
  ScoreType,
  StemDirection,
  StaffId,
  TieMark,
  TupletInfo,
} from './types';
import { isArticulationKind } from './articulations';
import { ANNOTATION_OFFSET_LIMIT } from './annotationOffsets';
import { isRepeatJumpKind } from './repeatJumps';
import { isStemDirection } from './stemDirection';

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
  'sixtyFourth',
]);
const PEDAL_MARKS = new Set<PedalMark>([
  'start',
  'release',
  'start-release',
]);
const HAIRPIN_MARKS = new Set<HairpinMark>(['crescendo', 'diminuendo']);
const ANNOTATION_KINDS = new Set<AnnotationKind>([
  'chordSymbol',
  'dynamic',
  'fermata',
  'lyric',
  'pedal',
]);
const ANNOTATION_PLACEMENT_SIDES = new Set<AnnotationPlacementSide>([
  'auto',
  'above',
  'below',
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

function isClefChange(value: unknown): value is ClefChange {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNumber(value.beat) &&
    value.beat >= 0 &&
    CLEFS.has(value.clef as Clef)
  );
}

function isAnnotationPlacements(value: unknown) {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, side]) =>
        ANNOTATION_KINDS.has(key as AnnotationKind) &&
        ANNOTATION_PLACEMENT_SIDES.has(side as AnnotationPlacementSide),
    )
  );
}

function isAnnotationOffset(value: unknown): value is AnnotationOffset {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    Math.abs(value.x) <= ANNOTATION_OFFSET_LIMIT.x &&
    isNumber(value.y) &&
    Math.abs(value.y) <= ANNOTATION_OFFSET_LIMIT.y
  );
}

function isAnnotationOffsets(value: unknown) {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, offset]) =>
        ANNOTATION_KINDS.has(key as AnnotationKind) &&
        isAnnotationOffset(offset),
    )
  );
}

function isLyricMap(value: unknown): value is LyricMap {
  return (
    isRecord(value) &&
    Array.isArray(value.eventIds) &&
    value.eventIds.every(isString)
  );
}

function isArticulations(value: unknown): value is ArticulationKind[] {
  return Array.isArray(value) && value.every(isArticulationKind);
}

function isScoreStemDirection(value: unknown): value is StemDirection {
  return isStemDirection(value);
}

function isTupletInfo(value: unknown): value is TupletInfo {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNumber(value.actualNotes) &&
    Number.isInteger(value.actualNotes) &&
    value.actualNotes >= 2 &&
    value.actualNotes <= 9 &&
    isNumber(value.normalNotes) &&
    Number.isInteger(value.normalNotes) &&
    value.normalNotes >= 1 &&
    isNumber(value.index) &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    value.index < value.actualNotes
  );
}

function isTieMark(value: unknown): value is TieMark {
  return (
    isRecord(value) &&
    isNumber(value.pitchIndex) &&
    Number.isInteger(value.pitchIndex) &&
    value.pitchIndex >= 0 &&
    isString(value.targetEventId) &&
    isNumber(value.targetPitchIndex) &&
    Number.isInteger(value.targetPitchIndex) &&
    value.targetPitchIndex >= 0
  );
}

function isSlurMark(value: unknown): value is SlurMark {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.targetEventId)
  );
}

function isGraceNoteAttachment(value: unknown): value is GraceNoteAttachment {
  return (
    isRecord(value) &&
    DURATIONS.has(value.duration as DurationValue) &&
    Array.isArray(value.pitches) &&
    value.pitches.length > 0 &&
    value.pitches.every(isPitch) &&
    (value.slash === undefined || typeof value.slash === 'boolean')
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
    (value.arpeggio === undefined || typeof value.arpeggio === 'boolean') &&
    (value.articulations === undefined ||
      isArticulations(value.articulations)) &&
    (value.stemDirection === undefined ||
      isScoreStemDirection(value.stemDirection)) &&
    (value.chordSymbol === undefined || isString(value.chordSymbol)) &&
    (value.dynamic === undefined || isString(value.dynamic)) &&
    (value.fermata === undefined || typeof value.fermata === 'boolean') &&
    (value.graceNotes === undefined ||
      (Array.isArray(value.graceNotes) &&
        value.graceNotes.every(isGraceNoteAttachment))) &&
    (value.glissando === undefined || typeof value.glissando === 'boolean') &&
    (value.hairpin === undefined ||
      HAIRPIN_MARKS.has(value.hairpin as HairpinMark)) &&
    (value.annotationPlacements === undefined ||
      isAnnotationPlacements(value.annotationPlacements)) &&
    (value.annotationOffsets === undefined ||
      isAnnotationOffsets(value.annotationOffsets)) &&
    (value.lyric === undefined || isString(value.lyric)) &&
    (value.lyricMap === undefined || isLyricMap(value.lyricMap)) &&
    (value.pedal === undefined || PEDAL_MARKS.has(value.pedal as PedalMark)) &&
    (value.slurs === undefined ||
      (Array.isArray(value.slurs) && value.slurs.every(isSlurMark))) &&
    (value.ties === undefined ||
      (Array.isArray(value.ties) && value.ties.every(isTieMark))) &&
    (value.tuplet === undefined || isTupletInfo(value.tuplet)) &&
    (value.dots === undefined ||
      (isNumber(value.dots) && value.dots >= 0 && value.dots <= 3));

  if (!baseIsValid) {
    return false;
  }

  if (value.kind === 'rest') {
    return (
      value.articulations === undefined &&
      value.arpeggio === undefined &&
      value.graceNotes === undefined &&
      value.hairpin === undefined &&
      value.stemDirection === undefined &&
      value.slurs === undefined &&
      value.ties === undefined
    );
  }

  if (value.duration === 'whole' && value.stemDirection !== undefined) {
    return false;
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
                (measure.clefChanges === undefined ||
                  (Array.isArray(measure.clefChanges) &&
                    measure.clefChanges.every(isClefChange))) &&
                (measure.keySignature === undefined ||
                  KEY_SIGNATURES.has(measure.keySignature as KeySignature)) &&
                (measure.keySignatureSymbols === undefined ||
                  (Array.isArray(measure.keySignatureSymbols) &&
                    measure.keySignatureSymbols.every(isKeySignatureSymbol))) &&
                (measure.repeatJump === undefined ||
                  isRepeatJumpKind(measure.repeatJump as RepeatJumpKind)) &&
                (measure.sectionMarker === undefined ||
                  isString(measure.sectionMarker)) &&
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
