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

/**
 * Snapshots are stored as JSON text. A row written by an older shape should
 * still be readable in the change log, so an unparseable value is surfaced
 * verbatim rather than failing the whole query.
 */
function parseSnapshot(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
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
      before: parseSnapshot(row.before),
      after: parseSnapshot(row.after),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
}
