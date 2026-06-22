import type { Score } from '../../domain/score/types';

export function drawKeySignatureSymbols(
  container: HTMLDivElement,
  score: Score,
  visibleMeasureIndexes?: ReadonlySet<number> | null,
) {
  void score;
  void visibleMeasureIndexes;

  const svg = container.querySelector('svg');

  if (!svg) {
    return;
  }

  svg
    .querySelectorAll('.sheetlab-key-signature-symbol')
    .forEach((element) => element.remove());
  svg.querySelectorAll('.vf-keysignature').forEach((element) => {
    element.removeAttribute('data-sheetlab-hidden-standard-key-signature');
  });
}
