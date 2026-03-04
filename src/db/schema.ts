import { pgTable, uuid, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const rsvpStatusEnum = pgEnum('rsvp_status', ['pending', 'attending', 'not_attending']);

export const guestGroups = pgTable('guest_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => guestGroups.id),
  name: varchar('name').notNull(),
  isPrimary: boolean('is_primary').notNull(),
  email: varchar('email'),
  dietaryRestrictions: varchar('dietary_restrictions'),
  rsvpStatus: rsvpStatusEnum('rsvp_status').notNull().default('pending'),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
