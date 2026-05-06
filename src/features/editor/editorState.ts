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
  entryMode: EntryMode;
  placementMode: PlacementMode;
  accidental: AccidentalChoice;
  tempo: number;
}

export const DURATION_OPTIONS: DurationValue[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  'sixteenth',
];

export const DEFAULT_EDITOR_TOOL_STATE: EditorToolState = {
  scoreType: 'treble',
  duration: 'quarter',
  entryMode: 'note',
  placementMode: 'place',
  accidental: 'none',
  tempo: 96,
};

export const DURATION_LABEL: Record<DurationValue, string> = {
  whole: 'Whole',
  half: 'Half',
  quarter: 'Quarter',
  eighth: 'Eighth',
  sixteenth: 'Sixteenth',
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
