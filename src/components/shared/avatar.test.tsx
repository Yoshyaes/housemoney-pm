import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('renders initials when no avatarUrl', () => {
    render(<Avatar name="Fred Thompson" />);
    expect(screen.getByText('FT')).toBeInTheDocument();
  });

  it('renders image when avatarUrl provided', () => {
    render(<Avatar name="Fred Thompson" avatarUrl="https://example.com/avatar.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'Fred Thompson');
  });

  it('applies correct size classes', () => {
    const { container } = render(<Avatar name="Fred Thompson" size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('w-8');
    expect(el.className).toContain('h-8');
  });

  it('uses avatar color when provided', () => {
    const { container } = render(<Avatar name="Fred" avatarColor="#185FA5" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe('rgba(53, 138, 221, 0.15)');
    expect(el.style.color).toBe('rgb(24, 95, 165)');
  });

  it('falls back to default color for unknown avatarColor', () => {
    const { container } = render(<Avatar name="Fred" avatarColor="#000000" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.color).toBe('rgb(186, 117, 23)');
  });
});
