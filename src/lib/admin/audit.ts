import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { AuditQuery } from '@/lib/admin/schemas';

export interface AuditEntryView {
  id: string;
  partyId: string | null;
  guestId: string | null;
  action: string;
  actorType: string;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
}

// Snapshots are stored as JSON text by writeAuditEntry. A parse failure
// indicates stored data corruption. The raw text is surfaced and the failure
// logged so one bad row cannot hide the rest of the change log.
function parseSnapshot(value: string | null, entryId: string, field: 'before' | 'after'): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(`Audit entry ${entryId} has an unparseable ${field} snapshot`, error);
    return value;
  }
}

export async function queryAuditLog(
  client: PrismaClient,
  query: AuditQuery,
): Promise<{ entries: AuditEntryView[]; total: number }> {
  const where: Prisma.AuditEntryWhereInput = {
    ...(query.partyId ? { partyId: query.partyId } : {}),
    ...(query.guestId ? { guestId: query.guestId } : {}),
    ...(query.action ? { action: query.action } : {}),
  };

  const [rows, total] = await Promise.all([
    client.auditEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: query.offset,
    }),
    client.auditEntry.count({ where }),
  ]);

  return {
    entries: rows.map((row) => ({
      id: row.id,
      partyId: row.partyId,
      guestId: row.guestId,
      action: row.action,
      actorType: row.actorType,
      actorEmail: row.actorEmail,
      before: parseSnapshot(row.before, row.id, 'before'),
      after: parseSnapshot(row.after, row.id, 'after'),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
}
