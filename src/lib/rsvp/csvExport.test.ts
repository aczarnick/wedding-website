import { describe, expect, it } from 'vitest';
import { toExportCsv, type ExportRecord } from '@/lib/rsvp/csvExport';

const BOM = '﻿';

function record(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    partyDisplayName: 'The Smith Family',
    firstName: 'John',
    lastName: 'Smith',
    message: null,
    addGuestCap: 5,
    rsvpStatus: 'attending',
    songRequest: null,
    source: 'admin',
    flaggedForReview: false,
    partyId: 'party-1',
    guestId: 'guest-1',
    ...overrides,
  };
}

function lines(csv: string): string[] {
  return csv.replace(BOM, '').trimEnd().split('\n');
}

describe('toExportCsv', () => {
  it('writes the header even with no records', () => {
    expect(lines(toExportCsv([]))).toEqual([
      'partyDisplayName,firstName,lastName,message,addGuestCap,' +
        'rsvpStatus,songRequest,source,flaggedForReview,partyId,guestId',
    ]);
  });

  it('prefixes a UTF-8 BOM so Excel reads it as UTF-8', () => {
    expect(toExportCsv([]).startsWith(BOM)).toBe(true);
  });

  it('renders null fields as empty', () => {
    const [, row] = lines(toExportCsv([record()]));

    expect(row).toBe('The Smith Family,John,Smith,,5,attending,,admin,false,party-1,guest-1');
  });

  it('renders booleans as true and false, not 1 and empty', () => {
    const [, row] = lines(toExportCsv([record({ flaggedForReview: true })]));

    expect(row).toContain(',true,');
  });

  it('quotes a value containing a comma', () => {
    const csv = toExportCsv([record({ songRequest: 'Smith, John' })]);

    expect(csv).toContain('"Smith, John"');
  });

  it('doubles an embedded quote', () => {
    const csv = toExportCsv([record({ message: 'He said "hi"' })]);

    expect(csv).toContain('"He said ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    const csv = toExportCsv([record({ message: 'line one\nline two' })]);

    expect(csv).toContain('"line one\nline two"');
  });

  it('neutralizes a leading formula character', () => {
    const csv = toExportCsv([record({ songRequest: '=SUM(A1:A9)' })]);

    expect(csv).not.toContain(',=SUM');
    expect(csv).toContain("'=SUM(A1:A9)");
  });

  it('round-trips through the import parser', async () => {
    const { parseImportCsv } = await import('@/lib/rsvp/csvImport');
    const csv = toExportCsv([record({ message: 'He said "hi", then\nleft' })]);
    const result = parseImportCsv(csv);

    expect(result.ok).toBe(true);
  });
});
