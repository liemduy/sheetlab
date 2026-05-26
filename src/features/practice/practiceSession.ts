export type PracticeSessionStatus = 'idle' | 'countin' | 'running' | 'paused' | 'review';

const ALLOWED_TRANSITIONS: Record<PracticeSessionStatus, readonly PracticeSessionStatus[]> = {
  idle: ['countin', 'running'],
  countin: ['running', 'paused', 'idle'],
  running: ['paused', 'review', 'idle', 'countin'],
  paused: ['running', 'countin', 'idle'],
  review: ['idle', 'running', 'countin'],
};

export function canTransitionPracticeSession(
  from: PracticeSessionStatus,
  to: PracticeSessionStatus,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function getPracticeSessionStatusLabel(status: PracticeSessionStatus): string {
  switch (status) {
    case 'countin':
      return 'Count-in';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'review':
      return 'Review';
    case 'idle':
    default:
      return 'Idle';
  }
}
