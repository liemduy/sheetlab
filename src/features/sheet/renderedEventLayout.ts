import type { ScoreEvent } from '../../domain/score/types';

export interface RenderedEventLayout {
  beat: number;
  isGeneratedRest: boolean;
  kind: ScoreEvent['kind'];
  maxX: number;
  maxY: number;
  measureIndex: number;
  minX: number;
  minY: number;
  staffId: string;
  x: number;
  y: number;
}
