import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SideLinesDivider } from './SideLinesDivider';

const getVerticalLine = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-hidden="true"].hidden.md\\:block');

describe('SideLinesDivider', () => {
  it('fills the line with lineColor when lineStyle is solid (default)', () => {
    const { container } = render(<SideLinesDivider lineColor="#123456">content</SideLinesDivider>);
    const line = getVerticalLine(container);

    expect(line?.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(line?.style.borderLeftStyle).toBe('none');
  });

  it('renders a dashed border instead of a filled background when lineStyle is dashed', () => {
    const { container } = render(
      <SideLinesDivider lineColor="#123456" lineStyle="dashed">
        content
      </SideLinesDivider>
    );
    const line = getVerticalLine(container);

    expect(line?.style.backgroundColor).toBe('transparent');
    expect(line?.style.borderLeft).toBe('2px dashed rgb(18, 52, 86)');
  });

  it('renders a dotted border instead of a filled background when lineStyle is dotted', () => {
    const { container } = render(
      <SideLinesDivider lineColor="#123456" lineStyle="dotted">
        content
      </SideLinesDivider>
    );
    const line = getVerticalLine(container);

    expect(line?.style.backgroundColor).toBe('transparent');
    expect(line?.style.borderLeft).toBe('2px dotted rgb(18, 52, 86)');
  });
});
