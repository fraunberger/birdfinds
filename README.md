# BirdFinds

BirdFinds is a Next.js App Router project that uses bird slugs as routes for a set of mini-apps.

## What Is In Here

- Bird launcher grid at `/` (`src/app/page.tsx`)
- Slug router at `/:slug` (`src/app/[slug]/page.tsx`)
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

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Production build
- `npm run start` - Run production build
- `npm run lint` - Run ESLint
