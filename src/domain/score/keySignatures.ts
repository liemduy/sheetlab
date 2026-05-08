import type {
  Accidental,
  KeySignature,
  KeySignatureAccidental,
  KeySignatureSymbol,
  Measure,
  NoteStep,
  Pitch,
  Score,
} from './types';

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
  return getKeySignatureSymbolsAccidentalMap(
    createKeySignatureSymbols(keySignature),
  );
}

export function createKeySignatureSymbols(keySignature: KeySignature) {
  const count = KEY_SIGNATURE_ACCIDENTAL_COUNT[keySignature];
  const accidental: KeySignatureAccidental = count > 0 ? 'sharp' : 'flat';
  const steps = count > 0 ? SHARP_ORDER : FLAT_ORDER;

  if (count === 0) {
    return [];
  }

  return steps.slice(0, Math.abs(count)).map((step, index) => ({
    accidental,
    id: `ks-${keySignature}-${index + 1}`,
    step,
  })) satisfies KeySignatureSymbol[];
}

export function getKeySignatureSymbolsAccidentalMap(
  symbols: readonly KeySignatureSymbol[],
) {
  const accidentalByStep = new Map<NoteStep, Accidental>();

  symbols.forEach((symbol) => {
    accidentalByStep.set(symbol.step, symbol.accidental);
  });

  return accidentalByStep;
}

export function inferKeySignatureFromSymbols(
  symbols: readonly KeySignatureSymbol[],
): KeySignature | null {
  const matchingKeySignature = KEY_SIGNATURE_OPTIONS.find((keySignature) => {
    const expectedSymbols = createKeySignatureSymbols(keySignature);

    return (
      expectedSymbols.length === symbols.length &&
      expectedSymbols.every(
        (expectedSymbol, index) =>
          expectedSymbol.accidental === symbols[index]?.accidental &&
          expectedSymbol.step === symbols[index]?.step,
      )
    );
  });

  return matchingKeySignature ?? null;
}

export function applyKeySignatureToPitch(
  pitch: Pitch,
  keySignature: KeySignature,
) {
  return applyKeySignatureMapToPitch(
    pitch,
    getKeySignatureAccidentalMap(keySignature),
  );
}

export function applyKeySignatureMapToPitch(
  pitch: Pitch,
  accidentalByStep: ReadonlyMap<NoteStep, Accidental>,
) {
  if (pitch.accidental) {
    return pitch;
  }

  const accidental = accidentalByStep.get(pitch.step);

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

export function getActiveKeySignatureSymbolState(
  score: Score,
  measureIndex: number,
) {
  let sourceMeasureIndex = 0;
  let symbols: readonly KeySignatureSymbol[] = [];
  let keySignature: KeySignature = 'C';

  for (let index = 0; index <= measureIndex; index += 1) {
    const measure = findMeasureAtIndex(score, index);

    if (!measure) {
      continue;
    }

    if (measure.keySignatureSymbols !== undefined) {
      sourceMeasureIndex = index;
      symbols = measure.keySignatureSymbols;
      keySignature =
        inferKeySignatureFromSymbols(measure.keySignatureSymbols) ??
        measure.keySignature ??
        keySignature;
      continue;
    }

    if (measure.keySignature) {
      sourceMeasureIndex = index;
      keySignature = measure.keySignature;
      symbols = createKeySignatureSymbols(measure.keySignature);
    }
  }

  return {
    keySignature,
    sourceMeasureIndex,
    symbols,
  };
}

export function getActiveKeySignatureAccidentalMap(
  score: Score,
  measureIndex: number,
) {
  return getKeySignatureSymbolsAccidentalMap(
    getActiveKeySignatureSymbolState(score, measureIndex).symbols,
  );
}

export function applyActiveKeySignatureToPitch(
  score: Score,
  measureIndex: number,
  pitch: Pitch,
) {
  return applyKeySignatureMapToPitch(
    pitch,
    getActiveKeySignatureAccidentalMap(score, measureIndex),
  );
}

export function getActiveKeySignatureSelection(score: Score, measureIndex: number) {
  const { symbols } = getActiveKeySignatureSymbolState(score, measureIndex);

  return inferKeySignatureFromSymbols(symbols) ?? 'custom';
}

export function measureStartsKeySignatureChange(
  score: Score,
  measureIndex: number,
) {
  const measure = findMeasureAtIndex(score, measureIndex);

  return Boolean(
    measure?.keySignature || measure?.keySignatureSymbols !== undefined,
  );
}
