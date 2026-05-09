import type { ScoreEvent } from '../../domain/score/types';

export interface RenderedPitchLayout {
  isDisplaced: boolean;
  maxX: number;
  minX: number;
  pitchIndex: number;
  x: number;
  y: number;
}

export interface RenderedEventLayout {
  beat: number;
  isGeneratedRest: boolean;
  kind: ScoreEvent['kind'];
  maxX: number;
  maxY: number;
  measureIndex: number;
  minX: number;
  minY: number;
  pitchLayouts: RenderedPitchLayout[];
  staffId: string;
  x: number;
  y: number;
}
