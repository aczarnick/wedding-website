import type { PrismaClient } from '@/generated/prisma/client';
import { writeAuditEntry, type AuditContext } from '@/lib/admin/audit-log';
import type { UpdateSettingsInput } from '@/lib/admin/schemas';
import { AUDIT_ACTION } from '@/lib/enums';
import { requireSettings } from '@/lib/rsvp/parties';

export interface AdminSettings {
  rsvpDeadline: string;
  defaultAddGuestCap: number;
}

interface SettingsRow {
  rsvpDeadline: Date;
  defaultAddGuestCap: number;
}

function toAdminSettings(row: SettingsRow): AdminSettings {
  return {
    rsvpDeadline: row.rsvpDeadline.toISOString(),
    defaultAddGuestCap: row.defaultAddGuestCap,
  };
}

export async function getSettings(client: PrismaClient): Promise<AdminSettings> {
  return toAdminSettings(await requireSettings(client));
}

export async function updateSettings(
  client: PrismaClient,
  audit: AuditContext,
  input: UpdateSettingsInput,
): Promise<AdminSettings> {
  return client.$transaction(async (tx) => {
    const existing = await requireSettings(tx);
    const updated = await tx.settings.update({ where: { id: 1 }, data: input });

    await writeAuditEntry(tx, audit, {
      action: AUDIT_ACTION.settingsUpdated,
      before: toAdminSettings(existing),
      after: toAdminSettings(updated),
    });

    return toAdminSettings(updated);
  });
}
