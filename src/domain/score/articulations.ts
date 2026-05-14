import type { ArticulationKind } from './types';

export const ARTICULATION_KINDS = [
  'caesura',
  'breath',
  'marcato',
  'accent',
  'tenuto',
  'staccato',
  'staccatissimo',
] as const satisfies readonly ArticulationKind[];

export const ARTICULATION_LABEL = {
  accent: 'Accent',
  breath: 'Breath mark',
  caesura: 'Caesura',
  marcato: 'Marcato',
  staccato: 'Staccato',
  staccatissimo: 'Staccatissimo',
  tenuto: 'Tenuto',
} satisfies Record<ArticulationKind, string>;

export const ARTICULATION_SYMBOL = {
  accent: '>',
  breath: ',',
  caesura: '//',
  marcato: '^',
  staccato: '.',
  staccatissimo: '\u25be',
  tenuto: '-',
} satisfies Record<ArticulationKind, string>;

const ARTICULATION_ORDER = new Map<ArticulationKind, number>(
  ARTICULATION_KINDS.map((kind, index) => [kind, index]),
);

export function isArticulationKind(value: unknown): value is ArticulationKind {
  return ARTICULATION_KINDS.includes(value as ArticulationKind);
}

export function normalizeArticulations(
  articulations: readonly ArticulationKind[] | null | undefined,
) {
  if (articulations === undefined) {
    return undefined;
  }

  if (articulations === null) {
    return null;
  }

  const normalized = [...new Set(articulations)]
    .filter(isArticulationKind)
    .sort(
      (first, second) =>
        (ARTICULATION_ORDER.get(first) ?? 0) -
        (ARTICULATION_ORDER.get(second) ?? 0),
    );

  return normalized.length > 0 ? normalized : null;
}

export function toggleArticulationKind(
  articulations: readonly ArticulationKind[] | undefined,
  kind: ArticulationKind,
) {
  const nextArticulations = new Set(articulations ?? []);

  if (nextArticulations.has(kind)) {
    nextArticulations.delete(kind);
  } else {
    nextArticulations.add(kind);
  }

  return normalizeArticulations([...nextArticulations]);
}
