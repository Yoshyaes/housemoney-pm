import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LabelChip } from './label-chip';

describe('LabelChip', () => {
  it('renders label name', () => {
    render(<LabelChip name="Feature" color="#185FA5" bgColor="rgba(53,138,221,.12)" />);
    expect(screen.getByText('Feature')).toBeInTheDocument();
  });

  it('applies custom colors', () => {
    const { container } = render(
      <LabelChip name="Infra" color="#0F6E56" bgColor="rgba(29,158,117,.12)" />
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.style.color).toBe('rgb(15, 110, 86)');
    expect(chip.style.backgroundColor).toBe('rgba(29, 158, 117, 0.12)');
  });

  it('applies additional className', () => {
    const { container } = render(
      <LabelChip name="Test" color="#000" bgColor="#fff" className="extra-class" />
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.className).toContain('extra-class');
  });
});
