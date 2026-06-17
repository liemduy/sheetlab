export type ScoreType = 'treble' | 'grand';

export type PageSize = 'a4' | 'letter';

export type StaffId = 'treble' | 'bass';

export type Clef = 'treble' | 'bass';

export type NoteStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type Accidental = 'natural' | 'sharp' | 'flat';

export type KeySignature =
  | 'C'
  | 'G'
  | 'D'
  | 'A'
  | 'E'
  | 'B'
  | 'F#'
  | 'C#'
  | 'F'
  | 'Bb'
  | 'Eb'
  | 'Ab'
  | 'Db'
  | 'Gb'
  | 'Cb';

export type KeySignatureAccidental = 'sharp' | 'flat';

export type RepeatJumpKind =
  | 'repeat-start'
  | 'repeat-end'
  | 'repeat-both'
  | 'ending-1'
  | 'ending-2'
  | 'ending-3'
  | 'segno'
  | 'coda'
  | 'fine'
  | 'to-coda'
  | 'dc'
  | 'dc-al-fine'
  | 'dc-al-coda'
  | 'ds'
  | 'ds-al-fine'
  | 'ds-al-coda';

export type DurationValue =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirtySecond'
  | 'sixtyFourth';

export type PedalMark = 'start' | 'release' | 'start-release';

export type HairpinMark = 'crescendo' | 'diminuendo';

export type ArticulationKind =
  | 'accent'
  | 'marcato'
  | 'staccatissimo'
  | 'tenuto'
  | 'staccato'
  | 'breath'
  | 'caesura';

export type StemDirection = 'up' | 'down';

export type AnnotationKind =
  | 'chordSymbol'
  | 'dynamic'
  | 'fermata'
  | 'lyric'
  | 'pedal';

export type AnnotationPlacementSide = 'auto' | 'above' | 'below';

export type AnnotationPlacements = Partial<
  Record<AnnotationKind, AnnotationPlacementSide>
>;

export interface AnnotationOffset {
  x: number;
  y: number;
}

export type AnnotationOffsets = Partial<Record<AnnotationKind, AnnotationOffset>>;

export interface LyricMap {
  eventIds: string[];
}

export interface TupletInfo {
  actualNotes: number;
  id: string;
  index: number;
  normalNotes: number;
}

export interface TieMark {
  pitchIndex: number;
  targetEventId: string;
  targetPitchIndex: number;
}

export interface SlurMark {
  id: string;
  targetEventId: string;
}

export interface GraceNoteAttachment {
  id?: string;
  kind?: GraceNoteKind;
  displayDuration?: DurationValue;
  duration?: DurationValue;
  playback?: GraceNotePlaybackPolicy;
  pitches: Pitch[];
  slurToMain?: boolean;
  slash?: boolean;
}

export type GraceNoteKind = 'acciaccatura' | 'appoggiatura';

export type GraceNotePlaybackTiming = 'beforeBeat' | 'onBeat';

export type GraceNoteStealTime = 'main' | 'none' | 'previous';

export interface GraceNotePlaybackPolicy {
  durationRatio?: number;
  fixedMs?: number;
  stealTimeFrom?: GraceNoteStealTime;
  timing?: GraceNotePlaybackTiming;
}

export interface ScorePosition {
  beat: number;
  measureIndex: number;
  staffId: StaffId;
  voiceIndex?: number;
}

export type OttavaKind = '8va' | '8vb' | '15ma' | '15mb';

export type NoteNotationMarkKind =
  | 'articulation'
  | 'chordSymbol'
  | 'dynamic'
  | 'fermata'
  | 'glissando'
  | 'hairpin'
  | 'lyric'
  | 'pedal';

export type RangeNotationMarkKind = 'ottava' | 'slur' | 'tie';

export type MeasureNotationMarkKind = 'repeatJump' | 'sectionMarker';

export type BarlineNotationMarkKind = 'repeatStart' | 'repeatEnd';

export interface NoteNotationMark {
  eventId: string;
  id: string;
  kind: NoteNotationMarkKind;
  scope: 'note';
  value?: string;
}

export interface RangeNotationMark {
  end: ScorePosition;
  id: string;
  kind: RangeNotationMarkKind;
  ottava?: OttavaKind;
  placement?: AnnotationPlacementSide;
  scope: 'range';
  sourceEventId?: string;
  start: ScorePosition;
  targetEventId?: string;
}

export interface MeasureNotationMark {
  id: string;
  kind: MeasureNotationMarkKind;
  measureIndex: number;
  scope: 'measure';
  value: string;
}

export interface BarlineNotationMark {
  id: string;
  kind: BarlineNotationMarkKind;
  measureIndex: number;
  scope: 'barline';
}

export type NotationMark =
  | NoteNotationMark
  | RangeNotationMark
  | MeasureNotationMark
  | BarlineNotationMark;

export interface TimeSignature {
  beats: number;
  beatUnit: number;
}

export interface Pitch {
  step: NoteStep;
  octave: number;
  accidental?: Accidental;
}

export interface KeySignatureSymbol {
  id: string;
  accidental: KeySignatureAccidental;
  step: NoteStep;
}

export interface ClefChange {
  id: string;
  beat: number;
  clef: Clef;
}

export interface BaseScoreEvent {
  id: string;
  duration: DurationValue;
  beat: number;
  arpeggio?: boolean;
  articulations?: ArticulationKind[];
  dots?: number;
  stemDirection?: StemDirection;
  chordSymbol?: string;
  dynamic?: string;
  fermata?: boolean;
  graceNotes?: GraceNoteAttachment[];
  glissando?: boolean;
  hairpin?: HairpinMark;
  annotationPlacements?: AnnotationPlacements;
  annotationOffsets?: AnnotationOffsets;
  lyric?: string;
  lyricMap?: LyricMap;
  pedal?: PedalMark;
  slurs?: SlurMark[];
  ties?: TieMark[];
  tuplet?: TupletInfo;
}

export interface NoteEvent extends BaseScoreEvent {
  kind: 'note';
  pitch: Pitch;
}

export interface ChordEvent extends BaseScoreEvent {
  kind: 'chord';
  pitches: Pitch[];
}

export interface RestEvent extends BaseScoreEvent {
  kind: 'rest';
}

export type ScoreEvent = NoteEvent | ChordEvent | RestEvent;

export interface Voice {
  id: string;
  events: ScoreEvent[];
}

export interface Measure {
  id: string;
  index: number;
  clefChanges?: ClefChange[];
  keySignature?: KeySignature;
  keySignatureSymbols?: KeySignatureSymbol[];
  repeatJump?: RepeatJumpKind;
  sectionMarker?: string;
  voices: Voice[];
}

export interface Staff {
  id: StaffId;
  clef: Clef;
  measures: Measure[];
}

export interface ScorePart {
  id: string;
  name: string;
  staves: Staff[];
}

export interface Score {
  id: string;
  title: string;
  composer: string;
  type: ScoreType;
  pageSize: PageSize;
  tempo: number;
  timeSignature: TimeSignature;
  marks?: NotationMark[];
  parts: ScorePart[];
}

export interface CreateScoreOptions {
  id?: string;
  title?: string;
  composer?: string;
  tempo?: number;
  pageSize?: PageSize;
  measureCount?: number;
  timeSignature?: TimeSignature;
}
