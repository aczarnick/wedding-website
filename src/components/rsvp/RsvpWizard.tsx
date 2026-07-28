'use client';

import { useRef, useState } from 'react';
import { PartyForm } from './PartyForm';
import { PartyLookup } from './PartyLookup';
import { PartyPicker } from './PartyPicker';
import { RsvpClosed } from './RsvpClosed';
import { RsvpConfirmation } from './RsvpConfirmation';
import { fetchParty, searchParties, submitRsvp } from '@/lib/rsvp/client';
import { ApiError } from '@/lib/http/apiClient';
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
const CAP_EXCEEDED_NOTICE =
  'The couple changed how many guests you can add, so we reloaded your invitation. Please check the answers below and submit again.';
const PARTY_MISSING_MESSAGE =
  'That invitation is no longer available. Please contact the bride or groom.';
const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.';

const asApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'unknown_error', UNEXPECTED_MESSAGE);

const closedState = (error: ApiError): WizardState => ({
  step: 'closed',
  deadline: typeof error.details.deadline === 'string' ? error.details.deadline : null,
});

const lookupWithError = (message: string): WizardState => ({
  step: 'lookup',
  errorMessage: message,
  showNotFound: false,
});

/**
 * Server errors (5xx) are operator language, not guidance for a guest, so
 * they are replaced with the generic message. Everything else (validation
 * errors like `invalid_request`) is genuinely useful and passes through.
 */
const userMessage = (error: ApiError): string =>
  error.status >= 500 ? UNEXPECTED_MESSAGE : error.message;

/**
 * Maps the two error codes that resolve identically from every call site —
 * `rsvp_closed` and `party_not_found` — and otherwise defers to the
 * caller-specific `fallback` for everything else.
 */
const mapError = (
  error: ApiError,
  fallback: (error: ApiError) => WizardState,
): WizardState => {
  if (error.code === 'rsvp_closed') {
    return closedState(error);
  }

  if (error.code === 'party_not_found') {
    return lookupWithError(PARTY_MISSING_MESSAGE);
  }

  return fallback(error);
};

export const RsvpWizard: React.FC = () => {
  const [state, setState] = useState<WizardState>(LOOKUP_START);
  const [isBusy, setIsBusy] = useState(false);
  const openPartyRequestId = useRef(0);

  const openParty = async (partyId: string) => {
    const requestId = ++openPartyRequestId.current;
    setIsBusy(true);

    try {
      const party = await fetchParty(partyId);

      if (openPartyRequestId.current !== requestId) {
        return;
      }

      setState({ step: 'editing', party, notice: null, errorMessage: null, formKey: 0 });
    } catch (caught) {
      if (openPartyRequestId.current !== requestId) {
        return;
      }

      const error = asApiError(caught);
      setState(mapError(error, (resolvedError) => lookupWithError(userMessage(resolvedError))));
    } finally {
      if (openPartyRequestId.current === requestId) {
        setIsBusy(false);
      }
    }
  };

  const handleSearch = async (query: string) => {
    setState(LOOKUP_START);
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
      setState(mapError(error, (resolvedError) => lookupWithError(userMessage(resolvedError))));
    } finally {
      setIsBusy(false);
    }
  };

  const reloadAfterConflict = async (party: PartyDetail, formKey: number, conflict: ApiError) => {
    try {
      const refreshed = await fetchParty(party.id);
      setState({
        step: 'editing',
        party: refreshed,
        notice:
          conflict.code === 'party_changed' ? PARTY_CHANGED_NOTICE : CAP_EXCEEDED_NOTICE,
        errorMessage: null,
        formKey: formKey + 1,
      });
    } catch (caught) {
      const error = asApiError(caught);
      setState(
        mapError(error, (resolvedError) => ({
          step: 'editing',
          party,
          notice: null,
          errorMessage: userMessage(resolvedError),
          formKey,
        })),
      );
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

      if (error.code === 'party_changed' || error.code === 'add_guest_cap_exceeded') {
        await reloadAfterConflict(party, formKey, error);
        return;
      }

      setState(
        mapError(error, (resolvedError) => ({
          step: 'editing',
          party,
          notice: null,
          errorMessage: userMessage(resolvedError),
          formKey,
        })),
      );
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

    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled wizard step: ${JSON.stringify(unhandled)}`);
    }
  }
};
