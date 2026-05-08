import type { Accidental, KeySignature, Measure, NoteStep, Pitch, Score } from './types';

export const KEY_SIGNATURE_OPTIONS: readonly KeySignature[] = [
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
];

const SHARP_ORDER: readonly NoteStep[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: readonly NoteStep[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const KEY_SIGNATURE_ACCIDENTAL_COUNT = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
} satisfies Record<KeySignature, number>;

export function getKeySignatureLabel(keySignature: KeySignature) {
  const count = KEY_SIGNATURE_ACCIDENTAL_COUNT[keySignature];

  if (count === 0) {
    return 'C / A minor (no accidentals)';
  }

  const accidental = count > 0 ? 'sharp' : 'flat';
  const plural = Math.abs(count) === 1 ? '' : 's';

  return `${keySignature} (${Math.abs(count)} ${accidental}${plural})`;
}

export function getKeySignatureAccidentalCount(keySignature: KeySignature) {
  return KEY_SIGNATURE_ACCIDENTAL_COUNT[keySignature];
}

export function isKeySignature(value: unknown): value is KeySignature {
  return (
    typeof value === 'string' &&
    (KEY_SIGNATURE_OPTIONS as readonly string[]).includes(value)
  );
}

export function getKeySignatureAccidentalMap(keySignature: KeySignature) {
  const count = KEY_SIGNATURE_ACCIDENTAL_COUNT[keySignature];
  const accidentalByStep = new Map<NoteStep, Accidental>();

  if (count > 0) {
    SHARP_ORDER.slice(0, count).forEach((step) => {
      accidentalByStep.set(step, 'sharp');
    });
  }

  if (count < 0) {
    FLAT_ORDER.slice(0, Math.abs(count)).forEach((step) => {
      accidentalByStep.set(step, 'flat');
    });
  }

  return accidentalByStep;
}

export function applyKeySignatureToPitch(
  pitch: Pitch,
  keySignature: KeySignature,
) {
  if (pitch.accidental) {
    return pitch;
  }

  const accidental = getKeySignatureAccidentalMap(keySignature).get(pitch.step);

  return accidental
    ? {
        ...pitch,
        accidental,
      }
    : pitch;
}

function findMeasureAtIndex(score: Score, measureIndex: number): Measure | undefined {
  return score.parts[0]?.staves[0]?.measures.find(
    (measure) => measure.index === measureIndex,
  );
}

export function getActiveKeySignature(score: Score, measureIndex: number) {
  let activeKeySignature: KeySignature = 'C';

  for (let index = 0; index <= measureIndex; index += 1) {
    const measure = findMeasureAtIndex(score, index);

    if (measure?.keySignature) {
      activeKeySignature = measure.keySignature;
    }
  }

  return activeKeySignature;
}

export function measureStartsKeySignatureChange(
  score: Score,
  measureIndex: number,
) {
  return Boolean(findMeasureAtIndex(score, measureIndex)?.keySignature);
}
