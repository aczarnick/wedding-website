import { stringify } from 'csv-stringify/sync';
import { EXPORT_COLUMNS } from '@/lib/rsvp/csvSchemas';

export interface ExportRecord {
  partyDisplayName: string;
  firstName: string;
  lastName: string;
  message: string | null;
  addGuestCap: number;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
  flaggedForReview: boolean;
  partyId: string;
  guestId: string;
}

/**
 * Renders export records as RFC 4180 CSV. Emits a BOM so Excel reads the file
 * as UTF-8, and escapes leading formula characters so guest-supplied text
 * cannot execute when the export is opened in a spreadsheet.
 */
export function toExportCsv(records: readonly ExportRecord[]): string {
  return stringify(records as unknown as Record<string, unknown>[], {
    header: true,
    columns: [...EXPORT_COLUMNS],
    bom: true,
    escape_formulas: true,
    cast: {
      boolean: (value) => (value ? 'true' : 'false'),
    },
  });
}
