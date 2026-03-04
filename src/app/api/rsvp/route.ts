import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { guests, guestGroups } from '@/db/schema';
import { eq, sql, and } from 'drizzle-orm';

const VALID_RSVP_STATUSES = ['pending', 'attending', 'not_attending'] as const;
type RsvpStatus = (typeof VALID_RSVP_STATUSES)[number];

function isValidRsvpStatus(value: string): value is RsvpStatus {
  return VALID_RSVP_STATUSES.includes(value as RsvpStatus);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
  }

  try {
    const primaryGuests = await db
      .select()
      .from(guests)
      .where(
        and(
          sql`LOWER(${guests.name}) = LOWER(${name.trim()})`,
          eq(guests.isPrimary, true)
        )
      );

    if (primaryGuests.length === 0) {
      return NextResponse.json({ error: 'No guest found with that name' }, { status: 404 });
    }

    const groupIds = [...new Set(primaryGuests.map((g) => g.groupId))];

    const results = await Promise.all(
      groupIds.map(async (groupId) => {
        const group = await db
          .select()
          .from(guestGroups)
          .where(eq(guestGroups.id, groupId))
          .then((rows) => rows[0]);

        const members = await db
          .select()
          .from(guests)
          .where(eq(guests.groupId, groupId));

        return {
          groupId: group.id,
          groupName: group.name,
          members: members.map((m) => ({
            id: m.id,
            name: m.name,
            isPrimary: m.isPrimary,
            rsvpStatus: m.rsvpStatus,
          })),
        };
      })
    );

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET /api/rsvp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { groupId?: string; members?: { id: string; rsvpStatus: string }[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { groupId, members } = body;

  if (!groupId || typeof groupId !== 'string') {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
  }

  try {
    const group = await db
      .select()
      .from(guestGroups)
      .where(eq(guestGroups.id, groupId))
      .then((rows) => rows[0]);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const allGuests = await db
      .select()
      .from(guests)
      .where(eq(guests.groupId, groupId));

    const submittedAt = new Date();
    const memberMap = new Map((members ?? []).map((m) => [m.id, m.rsvpStatus]));

    await Promise.all(
      allGuests.map((guest) => {
        const rawStatus = memberMap.get(guest.id) ?? 'not_attending';
        const status: RsvpStatus = isValidRsvpStatus(rawStatus) ? rawStatus : 'not_attending';
        return db
          .update(guests)
          .set({
            rsvpStatus: status,
            submittedAt,
            updatedAt: submittedAt,
          })
          .where(eq(guests.id, guest.id));
      })
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('POST /api/rsvp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
