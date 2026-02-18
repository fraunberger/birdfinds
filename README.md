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
4. `data/sql/add_profile_visibility.sql`

## Clerk Production Cutover + User Migration

1. In Clerk Dashboard, switch to **Production** instance and copy production keys.
2. In Vercel project env vars, set:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. In Vercel env vars, confirm backend keys are set:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. In Supabase SQL Editor, run:
   - `data/sql/create_clerk_user_links.sql`
   - `data/sql/migrate_clerk_users_to_existing_profiles.sql`
5. For step 4 migration script:
   - Export users from Clerk as CSV.
   - Generate SQL values block from CSV:
     - `npm run clerk:csv-to-sql -- path/to/clerk-users.csv`
   - Copy output and paste it into the `insert into tmp_clerk_users ...` block in `data/sql/migrate_clerk_users_to_existing_profiles.sql`.
   - Run script and review unmatched rows query at the end.
6. Deploy and verify:
   - Existing users can sign in with Clerk and still see old posts/items/habits.
   - `/api/social/me` returns both `clerkUserId` and `linkedUserId`.
   - Creating/updating posts works for migrated and new users.

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Production build
- `npm run start` - Run production build
- `npm run lint` - Run ESLint
- `npm run test:highlight` - Run highlight parser + segmentation unit tests
- `npm run clerk:csv-to-sql -- <csv-path>` - Convert Clerk CSV export to SQL `INSERT` rows for user migration

## Highlighting Model (Composer)

The composer highlighting pipeline uses a deterministic document model:

- `rawText`: the textarea value (authoritative, updated immediately on `onChange`)
- `decorations`: parsed highlight ranges:
  - `{ id, entityType, entityId, start, end, displayText, source, color }`

### Pipeline

1. `onChange` updates `rawText` immediately.
2. Debounced parsing (`parseHighlights`) runs from `rawText` + current entities.
3. Overlaps are resolved deterministically.
4. `decorations` state is only updated when deep-equality differs (`decorationsEqual`).
5. Rendering uses `segmentText(rawText, decorations)` and never does string replace in render.

### Overlap Rule

When overlaps occur:

1. higher entity priority wins
2. if tied, longer match wins
3. if tied, earlier start wins

Output decorations are always non-overlapping and ordered by `start` ascending.

### Prior Failure Modes (fixed)

- Highlight duplication from render-time string replacements
- Highlight drift/offset after rapid edits, paste, or alias linking
- Non-deterministic placement when multiple entities shared substrings

### Reproduction Scenario (before vs after)

1. Type: `Watched Dune then Dune: Part Two`
2. Tag/link `Dune` and `Dune: Part Two`
3. Rapidly paste/delete around both matches

Before: duplicated/misplaced highlights could appear.
After: decorations re-parse deterministically and segment rendering stays stable.

### Developer Trace

The composer has a small `Trace` toggle that records highlight pipeline events.
Use `Export JSON` to download logs for LLM/Mermaid flow diagramming.
