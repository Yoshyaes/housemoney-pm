import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, StatusDot } from './status-badge';

describe('StatusBadge', () => {
  it('renders the status label', () => {
    render(<StatusBadge status="TODO" />);
    expect(screen.getByText('Todo')).toBeInTheDocument();
  });

  it('renders all status values', () => {
    const statuses = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'];
    const labels = ['Backlog', 'Todo', 'In progress', 'In review', 'Done', 'Cancelled'];

    statuses.forEach((status, i) => {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });

  it('shows dot when showDot is true', () => {
    const { container } = render(<StatusBadge status="TODO" showDot />);
    const dots = container.querySelectorAll('.rounded-full');
    // The badge itself is rounded-full plus the dot inside
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to raw status for unknown status', () => {
    render(<StatusBadge status="UNKNOWN" />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });
});

describe('StatusDot', () => {
  it('renders a colored dot', () => {
    const { container } = render(<StatusDot status="DONE" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.backgroundColor).toBeTruthy();
  });
});
