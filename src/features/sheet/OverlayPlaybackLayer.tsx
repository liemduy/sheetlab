import type { Score } from '../../domain/score/types';
import { isGeneratedRestEvent } from '../../domain/score/events';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
} from './layout';
import { getBeatX } from './notationGeometry';
import type { RenderedEventLayout } from './renderedEventLayout';

const BEAT_MATCH_EPSILON = 0.0001;

interface PlayheadAnchor {
  beat: number;
  x: number;
}

function getRenderedBeatAnchors(
  score: Score,
  measureIndex: number,
  beatsPerMeasure: number,
  eventLayouts: Record<string, RenderedEventLayout>,
) {
  const anchorsByBeat = new Map<number, number[]>();

  score.parts
    .flatMap((part) => part.staves)
    .forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice) => {
        voice.events.forEach((event) => {
          if (isGeneratedRestEvent(event)) {
            return;
          }

          const layout = eventLayouts[event.id];

          if (!layout || layout.measureIndex !== measureIndex) {
            return;
          }

          const beat = Number(Math.min(
            beatsPerMeasure,
            Math.max(0, event.beat),
          ).toFixed(4));
          const existing = anchorsByBeat.get(beat) ?? [];

          anchorsByBeat.set(beat, [...existing, layout.x]);
        });
      });
    });

  const anchors: PlayheadAnchor[] = [...anchorsByBeat.entries()].map(
    ([beat, xs]) => ({
      beat,
      x: xs.reduce((total, x) => total + x, 0) / xs.length,
    }),
  );

  if (!anchorsByBeat.has(0)) {
    anchors.push({
      beat: 0,
      x: getBeatX(measureIndex, 0, beatsPerMeasure, score),
    });
  }

  if (!anchorsByBeat.has(beatsPerMeasure)) {
    anchors.push({
      beat: beatsPerMeasure,
      x: getBeatX(measureIndex, beatsPerMeasure, beatsPerMeasure, score),
    });
  }

  return anchors.sort((a, b) => a.beat - b.beat);
}

function getRenderedPlaybackX({
  beat,
  beatsPerMeasure,
  eventLayouts,
  measureIndex,
  score,
}: {
  beat: number;
  beatsPerMeasure: number;
  eventLayouts: Record<string, RenderedEventLayout>;
  measureIndex: number;
  score: Score;
}) {
  const anchors = getRenderedBeatAnchors(
    score,
    measureIndex,
    beatsPerMeasure,
    eventLayouts,
  );
  const exactAnchor = anchors.find(
    (anchor) => Math.abs(anchor.beat - beat) <= BEAT_MATCH_EPSILON,
  );

  if (exactAnchor) {
    return exactAnchor.x;
  }

  const previousAnchor = [...anchors]
    .reverse()
    .find((anchor) => anchor.beat < beat);
  const nextAnchor = anchors.find((anchor) => anchor.beat > beat);

  if (
    previousAnchor &&
    nextAnchor &&
    nextAnchor.beat - previousAnchor.beat > BEAT_MATCH_EPSILON
  ) {
    const progress =
      (beat - previousAnchor.beat) / (nextAnchor.beat - previousAnchor.beat);

    return previousAnchor.x + (nextAnchor.x - previousAnchor.x) * progress;
  }

  return getBeatX(measureIndex, beat, beatsPerMeasure, score);
}

export function PlaybackLayer({
  beatsPerMeasure,
  eventLayouts,
  playbackBeat,
  score,
  staffCount,
}: {
  beatsPerMeasure: number;
  eventLayouts: Record<string, RenderedEventLayout>;
  playbackBeat?: number | null;
  score: Score;
  staffCount: number;
}) {
  const playheadMeasureIndex =
    playbackBeat !== null && playbackBeat !== undefined
      ? Math.floor(playbackBeat / beatsPerMeasure)
      : null;
  const playheadBeat =
    playbackBeat !== null && playbackBeat !== undefined
      ? playbackBeat % beatsPerMeasure
      : null;
  const playheadX =
    playheadMeasureIndex !== null && playheadBeat !== null
      ? getRenderedPlaybackX({
          beat: playheadBeat,
          beatsPerMeasure,
          eventLayouts,
          measureIndex: playheadMeasureIndex,
          score,
        })
      : null;

  return playheadX !== null && playheadMeasureIndex !== null ? (
    <line
      className="playhead"
      data-testid="playhead"
      data-beat={playheadBeat ?? undefined}
      data-measure-index={playheadMeasureIndex}
      x1={playheadX}
      x2={playheadX}
      y1={getScoreStaffTop(score, 0, playheadMeasureIndex) - 24}
      y2={
        getScoreStaffTop(score, Math.max(0, staffCount - 1), playheadMeasureIndex) +
        STAFF_LINE_SPACING * 4 +
        24
      }
    />
  ) : null;
}
