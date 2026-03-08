import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { guests, guestGroups } from '@/db/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only final attendance decisions are accepted in POST submissions
const SUBMITTED_RSVP_STATUSES = ['attending', 'not_attending'] as const;
type SubmittedRsvpStatus = (typeof SUBMITTED_RSVP_STATUSES)[number];

function isSubmittedRsvpStatus(value: string): value is SubmittedRsvpStatus {
  return SUBMITTED_RSVP_STATUSES.includes(value as SubmittedRsvpStatus);
}

export async function GET(request: NextRequest) {
  // request.nextUrl is the idiomatic Next.js way to access the parsed URL and its search params
  const name = request.nextUrl.searchParams.get('name');

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
  }

  try {
    // Query 1: find every group that has a primary guest matching this name
    const matchingGroups = await db
      .select({ groupId: guests.groupId })
      .from(guests)
      .where(
        and(
          sql`LOWER(${guests.name}) = LOWER(${name.trim()})`,
          eq(guests.isPrimary, true)
        )
      );

    if (matchingGroups.length === 0) {
      return NextResponse.json({ error: 'No guest found with that name' }, { status: 404 });
    }

    const groupIds = matchingGroups.map((r) => r.groupId);

    // Query 2: fetch all members + group info for every matching group in one JOIN
    const rows = await db
      .select({
        groupId: guestGroups.id,
        groupName: guestGroups.name,
        memberId: guests.id,
        memberName: guests.name,
        memberIsPrimary: guests.isPrimary,
        memberRsvpStatus: guests.rsvpStatus,
      })
      .from(guests)
      .innerJoin(guestGroups, eq(guests.groupId, guestGroups.id))
      .where(inArray(guests.groupId, groupIds));

    // Assemble results grouped by groupId — preserves all matching groups for disambiguation
    type GroupResult = {
      groupId: string;
      groupName: string;
      members: { id: string; name: string; isPrimary: boolean; rsvpStatus: string }[];
    };
    const groupMap = new Map<string, GroupResult>();
    for (const row of rows) {
      if (!groupMap.has(row.groupId)) {
        groupMap.set(row.groupId, { groupId: row.groupId, groupName: row.groupName, members: [] });
      }
      groupMap.get(row.groupId)!.members.push({
        id: row.memberId,
        name: row.memberName,
        isPrimary: row.memberIsPrimary,
        rsvpStatus: row.memberRsvpStatus,
      });
    }

    return NextResponse.json([...groupMap.values()], { status: 200 });
  } catch (error) {
    console.error('GET /api/rsvp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { groupId?: unknown; members?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { groupId, members } = body;

  if (!groupId || typeof groupId !== 'string' || !UUID_REGEX.test(groupId)) {
    return NextResponse.json({ error: 'groupId must be a valid UUID' }, { status: 400 });
  }

  if (!Array.isArray(members)) {
    return NextResponse.json({ error: 'members must be an array' }, { status: 400 });
  }

  for (const member of members) {
    const m = member as Record<string, unknown>;
    const id = m?.id;
    const rsvpStatus = m?.rsvpStatus;

    if (
      typeof member !== 'object' ||
      member === null ||
      typeof id !== 'string' ||
      !UUID_REGEX.test(id) ||
      typeof rsvpStatus !== 'string' ||
      !isSubmittedRsvpStatus(rsvpStatus)
    ) {
      return NextResponse.json(
        { error: "Each member must have a valid id (UUID) and rsvpStatus of 'attending' or 'not_attending'" },
        { status: 400 }
      );
    }
  }

  const validatedMembers = members as { id: string; rsvpStatus: SubmittedRsvpStatus }[];

  try {
    // Query guests directly by groupId — no need for a separate group existence check
    const allGuests = await db
      .select()
      .from(guests)
      .where(eq(guests.groupId, groupId));

    if (allGuests.length === 0) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const submittedAt = new Date();
    const memberMap = new Map(validatedMembers.map((m) => [m.id, m.rsvpStatus]));

    // Wrap all updates in a transaction so the group is never partially updated
    await db.transaction(async (tx) => {
      await Promise.all(
        allGuests.map((guest) => {
          // Members not explicitly included default to 'not_attending'
          const status: SubmittedRsvpStatus = memberMap.get(guest.id) ?? 'not_attending';
          return tx
            .update(guests)
            .set({
              rsvpStatus: status,
              submittedAt,
              updatedAt: submittedAt,
            })
            .where(eq(guests.id, guest.id));
        })
      );
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('POST /api/rsvp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
