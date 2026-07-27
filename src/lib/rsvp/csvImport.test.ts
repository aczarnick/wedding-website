import { describe, expect, it } from 'vitest';
import { parseImportCsv } from '@/lib/rsvp/csvImport';

const HEADER = 'partyDisplayName,firstName,lastName,message,addGuestCap';

function errorsOf(text: string) {
  const result = parseImportCsv(text);
  if (result.ok) throw new Error('expected parse to fail');
  return result.rowErrors;
}

function partiesOf(text: string) {
  const result = parseImportCsv(text);
  if (!result.ok) throw new Error(`expected parse to succeed: ${JSON.stringify(result.rowErrors)}`);
  return result.parties;
}

describe('parseImportCsv', () => {
  it('groups rows sharing a display name into one party', () => {
    const parties = partiesOf(
      `${HEADER}\nThe Smith Family,John,Smith,,5\nThe Smith Family,Jane,Smith,,5\n`,
    );

    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ displayName: 'The Smith Family', addGuestCap: 5, line: 2 });
    expect(parties[0].guests).toEqual([
      { firstName: 'John', lastName: 'Smith' },
      { firstName: 'Jane', lastName: 'Smith' },
    ]);
  });

  it('groups non-contiguous rows of the same party', () => {
    const parties = partiesOf(
      `${HEADER}\nSmiths,John,Smith,,\nRivera,Alex,Rivera,,\nSmiths,Jane,Smith,,\n`,
    );

    expect(parties).toHaveLength(2);
    expect(parties.find((party) => party.displayName === 'Smiths')?.guests).toHaveLength(2);
  });

  it('groups case-insensitively and keeps the first spelling', () => {
    const parties = partiesOf(`${HEADER}\nThe Smiths,John,Smith,,\nTHE SMITHS,Jane,Smith,,\n`);

    expect(parties).toHaveLength(1);
    expect(parties[0].displayName).toBe('The Smiths');
  });

  it('lets a blank party-level value inherit a specified one', () => {
    const parties = partiesOf(`${HEADER}\nSmiths,John,Smith,Hi!,3\nSmiths,Jane,Smith,,\n`);

    expect(parties[0]).toMatchObject({ message: 'Hi!', addGuestCap: 3 });
  });

  it('leaves an entirely blank addGuestCap null for the caller to default', () => {
    expect(partiesOf(`${HEADER}\nSmiths,John,Smith,,\n`)[0].addGuestCap).toBeNull();
  });

  it('preserves a quoted comma, quote, and newline in a message', () => {
    const parties = partiesOf(
      `${HEADER}\nSmiths,John,Smith,"He said ""hi"", then\nleft",\n`,
    );

    expect(parties[0].message).toBe('He said "hi", then\nleft');
  });

  it('ignores unknown columns so an export can be re-imported', () => {
    const parties = partiesOf(
      'partyDisplayName,firstName,lastName,rsvpStatus,guestId\n' +
        'Smiths,John,Smith,attending,abc-123\n',
    );

    expect(parties[0].guests).toEqual([{ firstName: 'John', lastName: 'Smith' }]);
  });

  it('reports a missing required column once, without row errors', () => {
    const errors = errorsOf('partyDisplayName,firstName\nSmiths,John\n');

    expect(errors).toEqual([{ line: 1, reason: 'Missing required column: lastName' }]);
  });

  it('reports an empty file', () => {
    expect(errorsOf('   ')).toEqual([{ line: 1, reason: 'The file is empty' }]);
  });

  it('reports a header with no data rows', () => {
    expect(errorsOf(`${HEADER}\n`)).toEqual([{ line: 1, reason: 'The file has no data rows' }]);
  });

  it('collects every bad row rather than stopping at the first', () => {
    const errors = errorsOf(
      `${HEADER}\nSmiths,,Smith,,\nSmiths,Jane,Smith,,99\nSmiths,Bob,,,\n`,
    );

    expect(errors).toHaveLength(3);
    expect(errors.map((error) => error.line)).toEqual([2, 3, 4]);
  });

  it('reports a duplicate guest within a party, case- and whitespace-insensitively', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,\nSmiths,  john ,SMITH,,\n`);

    expect(errors).toEqual([
      {
        line: 3,
        reason: 'john SMITH appears twice in party "Smiths" (also on line 2)',
      },
    ]);
  });

  it('allows the same guest name in two different parties', () => {
    const parties = partiesOf(`${HEADER}\nSmiths,John,Smith,,\nJoneses,John,Smith,,\n`);

    expect(parties).toHaveLength(2);
  });

  it('reports conflicting party-level values', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,Hello,5\nSmiths,Jane,Smith,Goodbye,5\n`);

    expect(errors).toEqual([
      { line: 3, reason: 'message conflicts with line 2 for party "Smiths"' },
    ]);
  });

  it('reports conflicting addGuestCap values', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,5\nSmiths,Jane,Smith,,2\n`);

    expect(errors).toEqual([
      { line: 3, reason: 'addGuestCap conflicts with line 2 for party "Smiths"' },
    ]);
  });

  it('reports a ragged row as a file-level parse failure', () => {
    const errors = errorsOf(`${HEADER}\nSmiths,John,Smith,,5,extra\n`);

    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/column/i);
  });

  it('reports the real recordCount from a mid-file ragged row, not zero', () => {
    const result = parseImportCsv(
      `${HEADER}\nSmiths,John,Smith,,\nJoneses,Jane,Jones,,\nRiveras,Alex,Rivera,,\nBroken,Bob,Smith,,5,extra\n`,
    );

    expect(result.ok).toBe(false);
    expect(result.recordCount).toBe(3);
  });

  it('reports recordCount even when the file is invalid', () => {
    const result = parseImportCsv(`${HEADER}\nSmiths,,Smith,,\nSmiths,Jane,Smith,,\n`);

    expect(result.recordCount).toBe(2);
  });
});
