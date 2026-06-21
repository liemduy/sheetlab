import type { PedalMark } from '../../domain/score/types';

export const PEDAL_MARK_TEXT = {
  release: '*',
  start: 'Ped.',
  'start-release': '* Ped.',
} as const satisfies Record<PedalMark, string>;

export const PEDAL_MARK_LABEL = {
  release: 'Pedal up',
  start: 'Pedal down',
  'start-release': 'Pedal change',
} as const satisfies Record<PedalMark, string>;

export const PEDAL_PED_GLYPH = String.fromCodePoint(0x1d1ae);
export const PEDAL_UP_GLYPH = String.fromCodePoint(0x1d1af);

const PEDAL_MARK_FROM_TEXT = new Map<string, PedalMark>(
  Object.entries(PEDAL_MARK_TEXT).map(([mark, text]) => [
    text,
    mark as PedalMark,
  ]),
);

export const PEDAL_MARK_METRICS = {
  release: { descent: 7, height: 22, width: 18 },
  start: { descent: 7, height: 28, width: 36 },
  'start-release': { descent: 7, height: 28, width: 54 },
} as const satisfies Record<
  PedalMark,
  { descent: number; height: number; width: number }
>;

export interface PedalGlyphPart {
  glyph: string;
  part: 'ped' | 'release';
  xOffset: number;
}

export function getPedalMarkFromText(text: string) {
  return PEDAL_MARK_FROM_TEXT.get(text) ?? null;
}

export function getPedalMarkText(mark: PedalMark) {
  return PEDAL_MARK_TEXT[mark];
}

export function getPedalMarkLabel(mark: PedalMark) {
  return PEDAL_MARK_LABEL[mark];
}

export function getPedalMarkMetrics(mark: PedalMark) {
  return PEDAL_MARK_METRICS[mark];
}

export function getPedalGlyphParts(mark: PedalMark): PedalGlyphPart[] {
  if (mark === 'release') {
    return [{ glyph: PEDAL_UP_GLYPH, part: 'release', xOffset: 0 }];
  }

  if (mark === 'start-release') {
    return [
      { glyph: PEDAL_UP_GLYPH, part: 'release', xOffset: -17 },
      { glyph: PEDAL_PED_GLYPH, part: 'ped', xOffset: 8 },
    ];
  }

  return [{ glyph: PEDAL_PED_GLYPH, part: 'ped', xOffset: 0 }];
}
