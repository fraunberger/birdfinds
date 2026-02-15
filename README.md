# BirdFinds

BirdFinds is a Next.js App Router project that uses bird slugs as routes for a set of mini-apps.

## What Is In Here

- BirdPile social site at `/` (`src/app/page.tsx`)
- Apps launcher grid at `/apps` (`src/app/apps/page.tsx`)
- Legacy slug redirects from `/:slug` to `/apps/:slug`
- Mini-apps:
  - Bill splitter
  - Blackjack trainer
  - Restaurant voting/election flow
  - Social prototype
  - Bird log views

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase client
- Optional Redis/Vercel KV adapters for election storage

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` as needed:

```bash
# Clerk (required for auth UI)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CLERK_SECRET_KEY=YOUR_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Optional (used by election storage adapter when present)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Optional alternatives for election storage
KV_REST_API_URL=
KV_REST_API_TOKEN=
REDIS_URL=

# Optional (restaurant search API)
GOOGLE_PLACES_API_KEY=
```

3. Start dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Clerk + Social Write Migration

Run these SQL files in Supabase SQL Editor:

1. `data/sql/create_clerk_user_links.sql`
2. `data/sql/add_user_profile_category_configs.sql`
3. `data/sql/transfer_birdfinds_mike_to_michael_fraunberger.sql` (if migrating existing posts)

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Production build
- `npm run start` - Run production build
- `npm run lint` - Run ESLint
