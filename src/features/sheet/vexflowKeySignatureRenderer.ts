import type { Score } from '../../domain/score/types';
import { getKeySignatureSymbolLayouts } from './keySignatureLayout';

const KEY_SIGNATURE_SYMBOL_TEXT = {
  flat: '♭',
  sharp: '♯',
} as const;

export function drawKeySignatureSymbols(
  container: HTMLDivElement,
  score: Score,
) {
  const svg = container.querySelector('svg');

  if (!svg) {
    return;
  }

  svg
    .querySelectorAll('.sheetlab-key-signature-symbol')
    .forEach((element) => element.remove());
  svg
    .querySelectorAll('.vf-keysignature')
    .forEach((element) =>
      element.setAttribute('data-sheetlab-hidden-standard-key-signature', 'true'),
    );

  getKeySignatureSymbolLayouts(score).forEach((layout) => {
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'text');

    symbol.classList.add('sheetlab-key-signature-symbol');
    symbol.setAttribute('data-testid', 'rendered-key-signature-symbol');
    symbol.setAttribute('data-source-measure-index', String(layout.sourceMeasureIndex));
    symbol.setAttribute('data-measure-index', String(layout.measureIndex));
    symbol.setAttribute('data-staff-id', layout.staffId);
    symbol.setAttribute('data-symbol-index', String(layout.symbolIndex));
    symbol.setAttribute('data-step', layout.pitch.step);
    symbol.setAttribute('data-accidental', layout.accidental);
    symbol.setAttribute('x', layout.x.toFixed(2));
    symbol.setAttribute('y', layout.y.toFixed(2));
    symbol.setAttribute('dominant-baseline', 'central');
    symbol.setAttribute('text-anchor', 'middle');
    symbol.textContent = KEY_SIGNATURE_SYMBOL_TEXT[layout.accidental];
    svg.appendChild(symbol);
  });
}
