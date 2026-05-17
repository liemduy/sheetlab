const REASON_LABELS: Record<string, string> = {
  'event-overlap': 'this beat is already occupied',
  'locked-tuplet-slot': 'tuplet slot duration is locked',
  'measure-overflow': 'the event would exceed this measure',
  'missing-event': 'the selected event was not found',
  'missing-stem': 'the selected event has no editable stem',
  'missing-target': 'the target staff or measure was not found',
  'next-slot-required': 'write at the next open rhythm slot',
  'out-of-measure': 'the target is outside this measure',
  'redundant-clef': 'that clef is already active here',
  'same-position': 'the clef change is already at that position',
  'source-not-pitched': 'select a note or chord first',
  'target-not-found': 'no following event was found',
  'target-note-required': 'choose an existing note boundary first',
  'target-occupied': 'that target is already occupied',
  'unsupported-tuplet': 'this tuplet is not supported here',
};

const REASON_PATTERN = new RegExp(
  Object.keys(REASON_LABELS)
    .sort((first, second) => second.length - first.length)
    .join('|'),
  'g',
);

function sentenceCase(value: string) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

export function formatEditorMessage(message: string) {
  const formattedMessage = message.replace(
    REASON_PATTERN,
    (reason) => REASON_LABELS[reason] ?? reason,
  );

  return sentenceCase(formattedMessage);
}
