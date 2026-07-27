'use client';

import { useState } from 'react';
import { PartyForm } from './PartyForm';
import { PartyLookup } from './PartyLookup';
import { PartyPicker } from './PartyPicker';
import { RsvpClosed } from './RsvpClosed';
import { RsvpConfirmation } from './RsvpConfirmation';
import { RsvpApiError, fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import type { PartyDetail, PartySearchResult, SubmitRsvpBody } from '@/lib/rsvp/types';

type WizardState =
  | { step: 'lookup'; errorMessage: string | null; showNotFound: boolean }
  | { step: 'picking'; matches: PartySearchResult[] }
  | {
      step: 'editing';
      party: PartyDetail;
      notice: string | null;
      errorMessage: string | null;
      formKey: number;
    }
  | { step: 'confirmed'; party: PartyDetail }
  | { step: 'closed'; deadline: string | null };

const LOOKUP_START: WizardState = { step: 'lookup', errorMessage: null, showNotFound: false };

const PARTY_CHANGED_NOTICE =
  'Your party was updated by the couple, so we reloaded it. Please check the answers below and submit again.';
const PARTY_MISSING_MESSAGE =
  'That invitation is no longer available. Please contact the bride or groom.';
const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

const asApiError = (error: unknown): RsvpApiError =>
  error instanceof RsvpApiError
    ? error
    : new RsvpApiError(0, 'unknown_error', UNEXPECTED_MESSAGE);

const closedState = (error: RsvpApiError): WizardState => ({
  step: 'closed',
  deadline: typeof error.details.deadline === 'string' ? error.details.deadline : null,
});

const lookupWithError = (message: string): WizardState => ({
  step: 'lookup',
  errorMessage: message,
  showNotFound: false,
});

export const RsvpWizard: React.FC = () => {
  const [state, setState] = useState<WizardState>(LOOKUP_START);
  const [isBusy, setIsBusy] = useState(false);

  const openParty = async (partyId: string) => {
    setIsBusy(true);

    try {
      const party = await fetchParty(partyId);
      setState({ step: 'editing', party, notice: null, errorMessage: null, formKey: 0 });
    } catch (caught) {
      const error = asApiError(caught);

      if (error.code === 'rsvp_closed') {
        setState(closedState(error));
        return;
      }

      setState(
        lookupWithError(error.code === 'party_not_found' ? PARTY_MISSING_MESSAGE : error.message),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSearch = async (query: string) => {
    setIsBusy(true);

    try {
      const matches = await searchParties(query);

      if (matches.length === 0) {
        setState({ step: 'lookup', errorMessage: null, showNotFound: true });
        return;
      }

      if (matches.length === 1) {
        await openParty(matches[0].id);
        return;
      }

      setState({ step: 'picking', matches });
    } catch (caught) {
      const error = asApiError(caught);
      setState(error.code === 'rsvp_closed' ? closedState(error) : lookupWithError(error.message));
    } finally {
      setIsBusy(false);
    }
  };

  const reloadAfterConflict = async (party: PartyDetail, formKey: number, conflict: RsvpApiError) => {
    try {
      const refreshed = await fetchParty(party.id);
      setState({
        step: 'editing',
        party: refreshed,
        notice: conflict.code === 'party_changed' ? PARTY_CHANGED_NOTICE : conflict.message,
        errorMessage: null,
        formKey: formKey + 1,
      });
    } catch (caught) {
      const error = asApiError(caught);
      setState(error.code === 'rsvp_closed' ? closedState(error) : lookupWithError(PARTY_MISSING_MESSAGE));
    }
  };

  const handleSubmit = async (body: SubmitRsvpBody) => {
    if (state.step !== 'editing') {
      return;
    }

    const { party, formKey } = state;
    setIsBusy(true);

    try {
      const updated = await submitRsvp(party.id, body);
      setState({ step: 'confirmed', party: updated });
    } catch (caught) {
      const error = asApiError(caught);

      if (error.code === 'rsvp_closed') {
        setState(closedState(error));
        return;
      }

      if (error.code === 'party_changed' || error.code === 'add_guest_cap_exceeded') {
        await reloadAfterConflict(party, formKey, error);
        return;
      }

      setState({ step: 'editing', party, notice: null, errorMessage: error.message, formKey });
    } finally {
      setIsBusy(false);
    }
  };

  switch (state.step) {
    case 'lookup':
      return (
        <PartyLookup
          isSearching={isBusy}
          errorMessage={state.errorMessage}
          showNotFound={state.showNotFound}
          onSearch={handleSearch}
        />
      );

    case 'picking':
      return (
        <PartyPicker
          matches={state.matches}
          onSelect={openParty}
          onStartOver={() => setState(LOOKUP_START)}
        />
      );

    case 'editing':
      return (
        <PartyForm
          key={state.formKey}
          party={state.party}
          notice={state.notice}
          errorMessage={state.errorMessage}
          isSubmitting={isBusy}
          onSubmit={handleSubmit}
        />
      );

    case 'confirmed':
      return (
        <RsvpConfirmation
          party={state.party}
          onEdit={() =>
            setState({
              step: 'editing',
              party: state.party,
              notice: null,
              errorMessage: null,
              formKey: 0,
            })
          }
        />
      );

    case 'closed':
      return <RsvpClosed deadline={state.deadline} />;
  }
};
