import type { PrismaClient } from '@/generated/prisma/client';
import { writeAuditEntry, type AuditContext } from '@/lib/admin/audit-log';
import type { UpdateSettingsInput } from '@/lib/admin/schemas';
import { AUDIT_ACTION } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';

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

function settingsMissing(): RsvpError {
  return new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
}

export async function getSettings(client: PrismaClient): Promise<AdminSettings> {
  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw settingsMissing();
  }

  return toAdminSettings(settings);
}

export async function updateSettings(
  client: PrismaClient,
  audit: AuditContext,
  input: UpdateSettingsInput,
): Promise<AdminSettings> {
  return client.$transaction(async (tx) => {
    const existing = await tx.settings.findUnique({ where: { id: 1 } });

    if (!existing) {
      throw settingsMissing();
    }

    const updated = await tx.settings.update({ where: { id: 1 }, data: input });

    await writeAuditEntry(tx, audit, {
      action: AUDIT_ACTION.settingsUpdated,
      before: toAdminSettings(existing),
      after: toAdminSettings(updated),
    });

    return toAdminSettings(updated);
  });
}
