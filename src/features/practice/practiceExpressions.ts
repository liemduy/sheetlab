import type { Score, ScoreEvent } from '../../domain/score/types';
import type { PracticeTarget } from './practiceTimeline';

function getScoreEventById(score: Score) {
  return new Map(
    score.parts.flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.measures.flatMap((measure) =>
          measure.voices.flatMap((voice) =>
            voice.events.map((event) => [event.id, event] as const),
          ),
        ),
      ),
    ),
  );
}

function getEventExpressionLabels(event: ScoreEvent) {
  return [
    event.pedal ? `Pedal ${event.pedal}` : null,
    event.dynamic ? `Dynamic ${event.dynamic}` : null,
    event.hairpin ? `Hairpin ${event.hairpin}` : null,
    event.articulations?.length
      ? `Articulation ${event.articulations.join(', ')}`
      : null,
    event.fermata ? 'Fermata' : null,
  ].filter(Boolean) as string[];
}

export function getPracticeTargetExpressionLabels(
  score: Score,
  target: PracticeTarget | null,
) {
  if (!target) {
    return [];
  }

  const eventById = getScoreEventById(score);

  return [
    ...new Set(
      target.eventIds.flatMap((eventId) => {
        const event = eventById.get(eventId);

        return event ? getEventExpressionLabels(event) : [];
      }),
    ),
  ];
}

export function getPracticeExpressionCapabilitySummary(score: Score) {
  const labels = new Set<string>();

  getScoreEventById(score).forEach((event) => {
    if (event.pedal) labels.add('pedal');
    if (event.dynamic) labels.add('dynamics');
    if (event.hairpin) labels.add('hairpins');
    if (event.articulations?.length) labels.add('articulations');
    if (event.fermata) labels.add('fermatas');
  });

  return [...labels];
}
