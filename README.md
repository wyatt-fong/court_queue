# Court Queue

Simple badminton court queue app.

## What this version is

- One Next.js app
- One database
- No background worker
- Google Workspace sign-in for all users
- Admins granted by allowlisted emails

## Core behavior

- 10 courts
- 4 players per court
- Signed-in members join one court queue
- Courts rotate when enough time has passed and someone loads or changes data
- Admins can rotate a court immediately and add dummy players

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env.local
```

3. Create a Supabase project and run the SQL in [supabase/schema.sql](/Users/wyattfong/Projects/court_queue/supabase/schema.sql).

4. Fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_ID`
- `ALLOWED_EMAIL_DOMAIN`
- `ADMIN_EMAILS`
- `JWT_SECRET`

5. Run:

```bash
npm run dev
```

## Deploy

- Deploy this repo directly to Vercel
- Add the same env vars in Vercel
- Use Supabase as the hosted database
