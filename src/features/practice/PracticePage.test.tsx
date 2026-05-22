import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pianoPracticeLoopFixture } from '../../domain/score/fixtures';
import { PracticePage } from './PracticePage';

describe('PracticePage', () => {
  it('renders practice controls and returns to the editor', () => {
    const onBackToEditor = vi.fn();

    render(
      <PracticePage
        score={pianoPracticeLoopFixture}
        onBackToEditor={onBackToEditor}
      />,
    );

    expect(screen.getByTestId('practice-page')).toBeInTheDocument();
    expect(screen.getByTestId('practice-mode-wait')).toHaveClass('is-active');
    expect(screen.getByTestId('practice-summary')).toHaveTextContent('M1 beat 1');
    expect(screen.getByTestId('practice-reference')).toBeInTheDocument();
    expect(screen.getByTestId('practice-count-in')).toHaveValue('1');
    expect(screen.getByTestId('practice-reference-mute')).toHaveValue('none');
    expect(screen.getByTestId('practice-timing')).toHaveValue('normal');

    fireEvent.click(screen.getByTestId('practice-mode-listen'));

    expect(screen.getByTestId('practice-mode-listen')).toHaveClass('is-active');

    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));

    expect(onBackToEditor).toHaveBeenCalledTimes(1);
  });
});
