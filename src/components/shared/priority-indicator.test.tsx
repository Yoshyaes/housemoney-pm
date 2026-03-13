import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityIndicator, PriorityDot } from './priority-indicator';

describe('PriorityIndicator', () => {
  it('renders URGENT with triangle up icon', () => {
    const { container } = render(<PriorityIndicator priority="URGENT" />);
    expect(screen.getByText(/Urgent/)).toBeInTheDocument();
    expect(container.textContent).toContain('▲');
  });

  it('renders HIGH with triangle up icon', () => {
    const { container } = render(<PriorityIndicator priority="HIGH" />);
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(container.textContent).toContain('▲');
  });

  it('renders MEDIUM with square icon', () => {
    const { container } = render(<PriorityIndicator priority="MEDIUM" />);
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
    expect(container.textContent).toContain('■');
  });

  it('renders LOW with triangle down icon', () => {
    const { container } = render(<PriorityIndicator priority="LOW" />);
    expect(screen.getByText(/Low/)).toBeInTheDocument();
    expect(container.textContent).toContain('▼');
  });

  it('renders NONE with label only', () => {
    render(<PriorityIndicator priority="NONE" />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<PriorityIndicator priority="URGENT" showLabel={false} />);
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
  });
});

describe('PriorityDot', () => {
  it('renders a colored dot', () => {
    const { container } = render(<PriorityDot priority="HIGH" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.backgroundColor).toBeTruthy();
  });
});
