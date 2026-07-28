export interface RowError {
  line: number;
  reason: string;
}

interface ImportSuccess {
  status: 'success';
  partiesCreated: number;
  guestsCreated: number;
}

interface ImportFailure {
  status: 'failure';
  message: string;
  rowErrors?: RowError[];
}

export type ImportOutcome = ImportSuccess | ImportFailure;

interface ImportResultProps {
  result: ImportOutcome;
}

const partyNoun = (count: number): string => (count === 1 ? 'party' : 'parties');
const guestNoun = (count: number): string => (count === 1 ? 'guest' : 'guests');

const SuccessMessage: React.FC<ImportSuccess> = ({ partiesCreated, guestsCreated }) => (
  <p role='status' className='mt-5 text-sm text-sage-800'>
    Imported {partiesCreated} {partyNoun(partiesCreated)} and {guestsCreated} {guestNoun(guestsCreated)}.
  </p>
);

const FailureMessage: React.FC<ImportFailure> = ({ message, rowErrors }) => (
  <div role='alert' className='mt-5 text-sm text-red-700'>
    <p>{message}</p>
    <p className='mt-1'>Nothing was saved.</p>

    {rowErrors && rowErrors.length > 0 && (
      <ul className='mt-3 max-h-64 overflow-y-auto rounded-lg border border-red-200 bg-red-50/60 p-3'>
        {rowErrors.map((rowError, index) => (
          <li key={`${rowError.line}-${index}`}>
            Line {rowError.line}: {rowError.reason}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const ImportResult: React.FC<ImportResultProps> = ({ result }) =>
  result.status === 'success' ? <SuccessMessage {...result} /> : <FailureMessage {...result} />;
