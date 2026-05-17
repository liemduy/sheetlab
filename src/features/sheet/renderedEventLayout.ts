import type {
  AnnotationKind,
  AnnotationPlacementSide,
  ScoreEvent,
  StemDirection,
} from '../../domain/score/types';

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
  stemDirection?: StemDirection | null;
  voiceIndex: number;
  x: number;
  y: number;
}

export interface RenderedAnnotationLayout {
  eventId: string;
  id: string;
  kind: AnnotationKind;
  maxX: number;
  maxY: number;
  measureIndex: number;
  minX: number;
  minY: number;
  offsetX: number;
  offsetY: number;
  row: number;
  side: Exclude<AnnotationPlacementSide, 'auto'>;
  staffId: string;
  text: string;
  voiceIndex: number;
  x: number;
  y: number;
}

export interface RenderedVoiceZoneLayout {
  above: {
    hasContent: boolean;
    maxY: number;
    minY: number;
  };
  below: {
    hasContent: boolean;
    maxY: number;
    minY: number;
  };
  id: string;
  maxX: number;
  measureIndexes: number[];
  minX: number;
  staffId: string;
  staffIndex: number;
  systemIndex: number;
  voice: {
    maxY: number;
    minY: number;
  };
  voiceIndex: number;
}
