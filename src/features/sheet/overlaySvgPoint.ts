import type { MouseEvent } from 'react';
import { SVG_WIDTH } from './layout';

function getSvgViewBox(svg: SVGSVGElement, fallbackHeight: number) {
  const viewBox = svg.viewBox.baseVal;
  const parsedViewBox = svg
    .getAttribute('viewBox')
    ?.split(/\s+/)
    .map(Number);

  return Number.isFinite(viewBox.width) && viewBox.width > 0
    ? viewBox
    : {
        x: parsedViewBox?.[0] ?? 0,
        y: parsedViewBox?.[1] ?? 0,
        width: parsedViewBox?.[2] ?? SVG_WIDTH,
        height: parsedViewBox?.[3] ?? fallbackHeight,
      };
}

export function getSvgPoint(event: MouseEvent<SVGSVGElement>, svgHeight: number) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const viewBox = getSvgViewBox(event.currentTarget, svgHeight);

  if (bounds.width === 0 || bounds.height === 0) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    x: viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
    y: viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height,
  };
}

export function getNestedSvgPoint(event: MouseEvent<SVGElement>) {
  const svg = event.currentTarget.ownerSVGElement;

  if (!svg) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  const bounds = svg.getBoundingClientRect();
  const svgHeightAttribute = Number(svg.getAttribute('height'));
  const safeViewBox = getSvgViewBox(
    svg,
    Number.isFinite(svgHeightAttribute) && svgHeightAttribute > 0
      ? svgHeightAttribute
      : 1,
  );

  if (bounds.width === 0 || bounds.height === 0) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    x: safeViewBox.x + ((event.clientX - bounds.left) / bounds.width) * safeViewBox.width,
    y: safeViewBox.y + ((event.clientY - bounds.top) / bounds.height) * safeViewBox.height,
  };
}
