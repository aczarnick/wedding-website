import type { Prisma } from '@/generated/prisma/client';
import { ACTOR_TYPE, type AuditAction } from '@/lib/enums';

export interface AuditContext {
  actorEmail: string;
  ipAddress: string | null;
}

export interface AuditWrite {
  partyId?: string | null;
  guestId?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

function serialize(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

/**
 * Records an admin mutation. Always called with the transaction client of the
 * write it describes, so an audit row exists if and only if the write committed.
 */
export async function writeAuditEntry(
  tx: Prisma.TransactionClient,
  context: AuditContext,
  entry: AuditWrite,
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      partyId: entry.partyId ?? null,
      guestId: entry.guestId ?? null,
      action: entry.action,
      actorType: ACTOR_TYPE.admin,
      actorEmail: context.actorEmail,
      before: serialize(entry.before),
      after: serialize(entry.after),
      ipAddress: context.ipAddress,
    },
  });
}
