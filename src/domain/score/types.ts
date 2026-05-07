export type ScoreType = 'treble' | 'grand';

export type PageSize = 'a4' | 'letter';

export type StaffId = 'treble' | 'bass';

export type Clef = 'treble' | 'bass';

export type NoteStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type Accidental = 'natural' | 'sharp' | 'flat';

export type DurationValue =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirtySecond';

export interface TimeSignature {
  beats: number;
  beatUnit: number;
}

export interface Pitch {
  step: NoteStep;
  octave: number;
  accidental?: Accidental;
}

export interface BaseScoreEvent {
  id: string;
  duration: DurationValue;
  beat: number;
}

export interface NoteEvent extends BaseScoreEvent {
  kind: 'note';
  pitch: Pitch;
}

export interface RestEvent extends BaseScoreEvent {
  kind: 'rest';
}

export type ScoreEvent = NoteEvent | RestEvent;

export interface Voice {
  id: string;
  events: ScoreEvent[];
}

export interface Measure {
  id: string;
  index: number;
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
