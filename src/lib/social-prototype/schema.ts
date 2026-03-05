import { pgTable, uuid, text, boolean, jsonb, timestamp, date, integer, unique } from 'drizzle-orm/pg-core';

export const userProfiles = pgTable('user_profiles', {
    id: uuid('id').primaryKey().notNull(), // References auth.users(id)
    username: text('username').notNull().unique(),
    avatarUrl: text('avatar_url'),
    categories: jsonb('categories').default([]),
    visibility: text('visibility'),
    isPrivate: boolean('is_private').default(false),
    categoryConfigs: jsonb('category_configs').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// We are keeping user habits relational since they represent the "definition" of a habit that can be edited globally
export const userHabits = pgTable('user_habits', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon').default('✓'),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const follows = pgTable('follows', {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id').notNull(),
    followingId: uuid('following_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (t) => ({
    unq: unique().on(t.followerId, t.followingId)
}));

// NEW CONSOLIDATED TABLE (Replaces social_statuses, social_items, habit_logs)
// This structure behaves like a NoSQL document but stays within Postgres
export const dailyPosts = pgTable('daily_posts', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    date: date('date').notNull(),

    // High-level content
    content: text('content'),
    published: boolean('published').default(false),

    // Embedded "Items" array
    // Looks like: [{ id: uuid, category: string, title: string, subtitle?: string, rating?: number, notes?: string, image?: string }]
    items: jsonb('items').default([]).notNull(),

    // Embedded "Habit Logs" array
    // Looks like: [{ habitId: uuid, completed: boolean }]
    habits: jsonb('habits').default([]).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, (t) => ({
    unq: unique().on(t.userId, t.date)
}));
