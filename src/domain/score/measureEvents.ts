import type { DurationValue, Score, ScoreEvent, StaffId } from './types';
import { isGeneratedRestEvent } from './events';
import { getEventDurationTicks } from './eventDuration';
import {
  beatToTick,
  getDurationTicks,
  getMeasureTicks,
  splitTicksIntoDurations,
  tickToBeat,
} from './ticks';

export function getEventEnd(event: ScoreEvent) {
  return tickToBeat(getEventEndTick(event));
}

export function getEventStartTick(event: ScoreEvent) {
  return beatToTick(event.beat);
}

export function getEventEndTick(event: ScoreEvent) {
  return getEventStartTick(event) + getEventDurationTicks(event);
}

export function eventsOverlapByTick(candidate: ScoreEvent, existing: ScoreEvent) {
  return (
    getEventStartTick(candidate) < getEventEndTick(existing) &&
    getEventEndTick(candidate) > getEventStartTick(existing)
  );
}

function createRestId(
  staffId: StaffId,
  measureIndex: number,
  startTick: number,
  duration: DurationValue,
) {
  return `rest-${staffId}-m${measureIndex + 1}-t${startTick}-${duration}`;
}

function createRestEventsForTickRange(
  staffId: StaffId,
  measureIndex: number,
  startTick: number,
  endTick: number,
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  let cursorTick = startTick;

  for (const duration of splitTicksIntoDurations(endTick - startTick)) {
    events.push({
      id: createRestId(staffId, measureIndex, cursorTick, duration),
      kind: 'rest',
      beat: tickToBeat(cursorTick),
      duration,
    });
    cursorTick += getDurationTicks(duration);
  }

  return events;
}

function compactRestRuns(
  events: ScoreEvent[],
  staffId: StaffId,
  measureIndex: number,
) {
  const compactedEvents: ScoreEvent[] = [];
  let restRunStartTick: number | null = null;
  let restRunEndTick: number | null = null;

  function flushRestRun() {
    if (restRunStartTick === null || restRunEndTick === null) {
      return;
    }

    compactedEvents.push(
      ...createRestEventsForTickRange(
        staffId,
        measureIndex,
        restRunStartTick,
        restRunEndTick,
      ),
    );
    restRunStartTick = null;
    restRunEndTick = null;
  }

  for (const event of [...events].sort((a, b) => getEventStartTick(a) - getEventStartTick(b))) {
    if (event.kind === 'rest') {
      if (!isGeneratedRestEvent(event)) {
        flushRestRun();
        compactedEvents.push(event);
        continue;
      }

      restRunStartTick = restRunStartTick ?? getEventStartTick(event);
      restRunEndTick = getEventEndTick(event);
      continue;
    }

    flushRestRun();
    compactedEvents.push(event);
  }

  flushRestRun();

  return compactedEvents.sort((a, b) => getEventStartTick(a) - getEventStartTick(b));
}

export function materializeMeasureEvents(
  events: ScoreEvent[],
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  const measureTicks = getMeasureTicks(score.timeSignature);
  const sortedEvents = [...events].sort(
    (a, b) => getEventStartTick(a) - getEventStartTick(b),
  );
  const materializedEvents: ScoreEvent[] = [];
  let cursorTick = 0;

  for (const event of sortedEvents) {
    const eventStartTick = getEventStartTick(event);
    const eventEndTick = getEventEndTick(event);

    if (eventStartTick < cursorTick) {
      throw new Error('Rhythm event overlap');
    }

    if (eventEndTick > measureTicks) {
      throw new Error('Rhythm event overflows measure');
    }

    if (eventStartTick > cursorTick) {
      materializedEvents.push(
        ...createRestEventsForTickRange(
          staffId,
          measureIndex,
          cursorTick,
          eventStartTick,
        ),
      );
    }

    materializedEvents.push(event);
    cursorTick = eventEndTick;
  }

  if (cursorTick < measureTicks) {
    materializedEvents.push(
      ...createRestEventsForTickRange(
        staffId,
        measureIndex,
        cursorTick,
        measureTicks,
      ),
    );
  }

  return compactRestRuns(materializedEvents, staffId, measureIndex);
}

export function materializeMeasureEventsAllowingInvalid(
  events: ScoreEvent[],
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  const measureTicks = getMeasureTicks(score.timeSignature);
  const sortedEvents = [...events]
    .filter((event) => !isGeneratedRestEvent(event))
    .sort((a, b) => getEventStartTick(a) - getEventStartTick(b));
  const materializedEvents: ScoreEvent[] = [];
  let cursorTick = 0;

  for (const event of sortedEvents) {
    const eventStartTick = getEventStartTick(event);
    const eventEndTick = getEventEndTick(event);
    const safeGapEndTick = Math.min(eventStartTick, measureTicks);

    if (safeGapEndTick > cursorTick) {
      materializedEvents.push(
        ...createRestEventsForTickRange(
          staffId,
          measureIndex,
          cursorTick,
          safeGapEndTick,
        ),
      );
    }

    materializedEvents.push(event);
    cursorTick = Math.max(cursorTick, eventEndTick);
  }

  if (cursorTick < measureTicks) {
    materializedEvents.push(
      ...createRestEventsForTickRange(
        staffId,
        measureIndex,
        cursorTick,
        measureTicks,
      ),
    );
  }

  return compactRestRuns(materializedEvents, staffId, measureIndex);
}
