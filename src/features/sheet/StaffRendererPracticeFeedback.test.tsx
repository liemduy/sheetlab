import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { trebleStudyFixture } from '../../domain/score/fixtures';
import { StaffRenderer } from './StaffRenderer';

describe('StaffRenderer practice feedback', () => {
  it('marks rendered notes with practice feedback classes', async () => {
    const { container } = render(
      <StaffRenderer
        score={trebleStudyFixture}
        practiceFeedbackByEventId={{ 'treble-m1-e1': 'correct' }}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(
          '.vf-user-event[data-event-id="treble-m1-e1"]',
        ),
      ).toHaveClass('is-practice-correct');
    });
  });
});
