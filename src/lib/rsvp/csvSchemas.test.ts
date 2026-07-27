import { describe, expect, it } from 'vitest';
import { importRowSchema } from '@/lib/rsvp/csvSchemas';

function parseRow(row: Record<string, string>) {
  return importRowSchema.safeParse(row);
}

const validRow = {
  partyDisplayName: 'The Smith Family',
  firstName: 'John',
  lastName: 'Smith',
};

describe('importRowSchema', () => {
  it('normalizes whitespace in names', () => {
    const result = parseRow({
      partyDisplayName: '  The   Smith  Family ',
      firstName: ' John ',
      lastName: '  Smith',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      partyDisplayName: 'The Smith Family',
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('defaults absent optional columns to null', () => {
    const result = parseRow(validRow);

    expect(result.data).toMatchObject({ message: null, addGuestCap: null });
  });

  it('treats a blank message as null', () => {
    const result = parseRow({ ...validRow, message: '   ' });

    expect(result.data?.message).toBeNull();
  });

  it('strips the exporter\'s formula-escape apostrophe on round trip', () => {
    const result = parseRow({ ...validRow, message: "'- Can't wait!" });

    expect(result.data?.message).toBe("- Can't wait!");
  });

  it('preserves a message that legitimately starts with an apostrophe', () => {
    const result = parseRow({ ...validRow, message: "'twas a lovely day" });

    expect(result.data?.message).toBe("'twas a lovely day");
  });

  it('strips only one apostrophe from a doubled leading escape', () => {
    const result = parseRow({ ...validRow, message: "''=x" });

    expect(result.data?.message).toBe("'=x");
  });

  it('rejects a blank required name', () => {
    const result = parseRow({ ...validRow, firstName: '  ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('firstName is required');
  });

  it('rejects a name longer than 100 characters', () => {
    const result = parseRow({ ...validRow, lastName: 'x'.repeat(101) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('100 characters or fewer');
  });

  it('rejects a message longer than 1000 characters', () => {
    const result = parseRow({ ...validRow, message: 'x'.repeat(1001) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('1000 characters or fewer');
  });

  it('coerces a numeric addGuestCap', () => {
    const result = parseRow({ ...validRow, addGuestCap: ' 3 ' });

    expect(result.data?.addGuestCap).toBe(3);
  });

  it('accepts a zero addGuestCap', () => {
    expect(parseRow({ ...validRow, addGuestCap: '0' }).data?.addGuestCap).toBe(0);
  });

  it.each(['abc', '2.5', '-1', '21'])('rejects addGuestCap %s', (value) => {
    const result = parseRow({ ...validRow, addGuestCap: value });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('between 0 and 20');
  });
});
