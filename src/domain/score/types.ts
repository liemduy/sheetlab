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
  | 'thirtySecond';

export type PedalMark = 'start' | 'release' | 'start-release';

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

export interface BaseScoreEvent {
  id: string;
  duration: DurationValue;
  beat: number;
  dots?: number;
  chordSymbol?: string;
  dynamic?: string;
  fermata?: boolean;
  glissando?: boolean;
  lyric?: string;
  pedal?: PedalMark;
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
