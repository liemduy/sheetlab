import type {
  Accidental,
  DurationValue,
  PageSize,
  ScoreType,
} from '../../domain/score/types';

export type EntryMode = 'note' | 'rest';

export type PlacementMode = 'place' | 'insert';

export type AccidentalChoice = Accidental | 'none';

export interface EditorToolState {
  scoreType: ScoreType;
  duration: DurationValue;
  dots: number;
  entryMode: EntryMode;
  placementMode: PlacementMode;
  accidental: AccidentalChoice;
  isInputArmed: boolean;
  tempo: number;
}

export const DURATION_OPTIONS: DurationValue[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  'sixteenth',
  'thirtySecond',
];

export const DEFAULT_EDITOR_TOOL_STATE: EditorToolState = {
  scoreType: 'grand',
  duration: 'quarter',
  dots: 0,
  entryMode: 'note',
  placementMode: 'place',
  accidental: 'none',
  isInputArmed: false,
  tempo: 96,
};

export const DURATION_LABEL: Record<DurationValue, string> = {
  whole: 'Whole',
  half: 'Half',
  quarter: 'Quarter',
  eighth: 'Eighth',
  sixteenth: 'Sixteenth',
  thirtySecond: 'Thirty-second',
};

export const DURATION_SYMBOL: Record<DurationValue, string> = {
  whole: String.fromCodePoint(0x1d15d),
  half: String.fromCodePoint(0x1d15e),
  quarter: '\u2669',
  eighth: '\u266a',
  sixteenth: String.fromCodePoint(0x1d161),
  thirtySecond: String.fromCodePoint(0x1d162),
};

export const SCORE_TYPE_LABEL: Record<ScoreType, string> = {
  treble: 'Treble only',
  grand: 'Grand staff piano',
};

export const PAGE_SIZE_LABEL: Record<PageSize, string> = {
  a4: 'A4',
  letter: 'Letter',
};

export const PLACEMENT_MODE_LABEL: Record<PlacementMode, string> = {
  place: 'Place',
  insert: 'Insert',
};

export const ACCIDENTAL_LABEL: Record<AccidentalChoice, string> = {
  none: 'None',
  natural: 'Natural',
  sharp: 'Sharp',
  flat: 'Flat',
};

export const ACCIDENTAL_SYMBOL: Record<AccidentalChoice, string> = {
  none: '\u00d8',
  natural: '\u266e',
  sharp: '\u266f',
  flat: '\u266d',
};
