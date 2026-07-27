import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyLookup } from './PartyLookup';

const renderLookup = (props: Partial<React.ComponentProps<typeof PartyLookup>> = {}) => {
  const onSearch = vi.fn();
  render(
    <PartyLookup
      isSearching={false}
      errorMessage={null}
      showNotFound={false}
      onSearch={onSearch}
      {...props}
    />,
  );
  return onSearch;
};

describe('PartyLookup', () => {
  it('submits the typed name', () => {
    const onSearch = renderLookup();

    fireEvent.change(screen.getByLabelText(/first and last name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find my invitation/i }));

    expect(onSearch).toHaveBeenCalledWith('John Smith');
  });

  it('shows the error message from the server', () => {
    renderLookup({ errorMessage: 'Enter a first and last name' });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a first and last name');
  });

  it('points an unmatched guest at the bride or groom, with no mailto', () => {
    renderLookup({ showNotFound: true });

    expect(screen.getByText(/contact the bride or groom/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('hides the not-found message until a search has come back empty', () => {
    renderLookup();

    expect(screen.queryByText(/contact the bride or groom/i)).not.toBeInTheDocument();
  });

  it('disables the button while a search is in flight', () => {
    renderLookup({ isSearching: true });

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
