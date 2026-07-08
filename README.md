# Court Queue

Simple badminton court queue app.

## What this version is

- One Next.js app
- One database
- Google Workspace sign-in for all users
- Admins granted by allowlisted emails

## Core behavior

- 10 courts
- 4 players per court
- Signed-in members create or join parties of up to four players
- Members may switch queued parties without leaving first
- Courts rotate transactionally when enough time has passed
- Admins can rotate, pause, remove members, and delete parties

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env.local
```

3. Create a Supabase project, link it with the Supabase CLI, and apply all migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

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
