import { parse } from 'csv-parse/sync';
import { CsvError, type Info } from 'csv-parse';
import {
  REQUIRED_IMPORT_COLUMNS,
  importRowSchema,
  type ImportRow,
  type RowError,
} from '@/lib/rsvp/csvSchemas';

export interface ImportGuest {
  firstName: string;
  lastName: string;
}

export interface ImportParty {
  key: string;
  displayName: string;
  line: number;
  message: string | null;
  addGuestCap: number | null;
  guests: ImportGuest[];
}

export type ImportParseResult =
  | { ok: true; recordCount: number; parties: ImportParty[] }
  | { ok: false; recordCount: number; rowErrors: RowError[] };

interface ParsedRecord {
  record: Record<string, string>;
  info: Info;
}

const HEADER_LINE = 1;

function failure(recordCount: number, rowErrors: RowError[]): ImportParseResult {
  return { ok: false, recordCount, rowErrors };
}

/**
 * csv-parse throws mid-stream on a malformed row, but the error still carries
 * how many records it had already parsed. Task 5 checks `recordCount` against
 * the row limit before it inspects `ok`, so that count must survive the throw
 * rather than being zeroed out.
 */
function recordCountFrom(error: unknown): number {
  if (error instanceof CsvError && typeof error.records === 'number') {
    return error.records;
  }

  return 0;
}

/**
 * Reads the file into records, capturing the header so a missing required
 * column is reported once rather than as an error on every row.
 */
function readRecords(text: string): { header: string[]; records: ParsedRecord[] } {
  let header: string[] = [];

  const records = parse(text, {
    bom: true,
    info: true,
    skip_empty_lines: true,
    columns: (firstRow: string[]) => {
      header = firstRow;
      return firstRow;
    },
  }) as unknown as ParsedRecord[];

  return { header, records };
}

/** Accumulates one party's rows, recording the line each value first appeared on. */
class PartyAccumulator {
  readonly guests: ImportGuest[] = [];
  readonly errors: RowError[] = [];
  private readonly guestKeys = new Map<string, number>();
  private messageLine: number | null = null;
  private capLine: number | null = null;
  message: string | null = null;
  addGuestCap: number | null = null;

  constructor(
    readonly key: string,
    readonly displayName: string,
    readonly line: number,
  ) {}

  add(row: ImportRow, line: number): void {
    this.addGuest(row, line);
    this.mergeMessage(row, line);
    this.mergeCap(row, line);
  }

  private addGuest(row: ImportRow, line: number): void {
    const guestKey = `${row.firstName.toLowerCase()} ${row.lastName.toLowerCase()}`;
    const firstSeen = this.guestKeys.get(guestKey);

    if (firstSeen !== undefined) {
      this.errors.push({
        line,
        reason: `${row.firstName} ${row.lastName} appears twice in party "${this.displayName}" (also on line ${firstSeen})`,
      });
      return;
    }

    this.guestKeys.set(guestKey, line);
    this.guests.push({ firstName: row.firstName, lastName: row.lastName });
  }

  private mergeMessage(row: ImportRow, line: number): void {
    if (row.message === null) {
      return;
    }

    if (this.messageLine === null) {
      this.message = row.message;
      this.messageLine = line;
      return;
    }

    if (this.message !== row.message) {
      this.errors.push({
        line,
        reason: `message conflicts with line ${this.messageLine} for party "${this.displayName}"`,
      });
    }
  }

  private mergeCap(row: ImportRow, line: number): void {
    if (row.addGuestCap === null) {
      return;
    }

    if (this.capLine === null) {
      this.addGuestCap = row.addGuestCap;
      this.capLine = line;
      return;
    }

    if (this.addGuestCap !== row.addGuestCap) {
      this.errors.push({
        line,
        reason: `addGuestCap conflicts with line ${this.capLine} for party "${this.displayName}"`,
      });
    }
  }

  toParty(): ImportParty {
    return {
      key: this.key,
      displayName: this.displayName,
      line: this.line,
      message: this.message,
      addGuestCap: this.addGuestCap,
      guests: this.guests,
    };
  }
}

/**
 * Parses import CSV text into grouped parties, or into an exhaustive list of
 * line-numbered problems. Never throws for bad input: a malformed file comes
 * back as a `rowErrors` entry so the caller renders one consistent report.
 */
export function parseImportCsv(text: string): ImportParseResult {
  if (text.trim().length === 0) {
    return failure(0, [{ line: HEADER_LINE, reason: 'The file is empty' }]);
  }

  let header: string[];
  let records: ParsedRecord[];

  try {
    ({ header, records } = readRecords(text));
  } catch (error) {
    return failure(recordCountFrom(error), [
      { line: HEADER_LINE, reason: error instanceof Error ? error.message : 'Could not read the file' },
    ]);
  }

  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !header.includes(column));

  if (missing.length > 0) {
    return failure(records.length, [
      { line: HEADER_LINE, reason: `Missing required column: ${missing.join(', ')}` },
    ]);
  }

  if (records.length === 0) {
    return failure(0, [{ line: HEADER_LINE, reason: 'The file has no data rows' }]);
  }

  const rowErrors: RowError[] = [];
  const accumulators = new Map<string, PartyAccumulator>();

  for (const { record, info } of records) {
    const line = info.lines;
    const parsed = importRowSchema.safeParse(record);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ line, reason: issue.message });
      }
      continue;
    }

    const row = parsed.data;
    const key = row.partyDisplayName.toLowerCase();
    let accumulator = accumulators.get(key);

    if (!accumulator) {
      accumulator = new PartyAccumulator(key, row.partyDisplayName, line);
      accumulators.set(key, accumulator);
    }

    accumulator.add(row, line);
  }

  for (const accumulator of accumulators.values()) {
    rowErrors.push(...accumulator.errors);
  }

  if (rowErrors.length > 0) {
    rowErrors.sort((left, right) => left.line - right.line);
    return failure(records.length, rowErrors);
  }

  return {
    ok: true,
    recordCount: records.length,
    parties: [...accumulators.values()].map((accumulator) => accumulator.toParty()),
  };
}
