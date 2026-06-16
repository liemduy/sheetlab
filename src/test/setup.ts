import '@testing-library/jest-dom/vitest';

if (typeof HTMLCanvasElement !== 'undefined') {
  const canvasContext = {
    measureText: (text: string) => ({
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 8,
      fontBoundingBoxAscent: 8,
      fontBoundingBoxDescent: 2,
      width: text.length * 8,
    }),
  } as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = function getContext(contextId) {
    return contextId === '2d' ? canvasContext : null;
  } as HTMLCanvasElement['getContext'];
}

if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = () => undefined;
}
