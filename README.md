# Court Queue

Barebones badminton court queueing app.

## Stack

- `client/`: React + Vite
- `server/`: Node + Express + Prisma + PostgreSQL
- Frontend deploy target: Vercel
- Backend deploy target: Render
- Database target: Railway PostgreSQL
- Email provider target: Resend

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env files and fill them in:

```bash
cp .env.example .env
cp client/.env.example client/.env
cp server/.env.example server/.env
```

3. Start Postgres and set `DATABASE_URL`.

4. Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

5. Seed the courts:

```bash
npm run seed
```

6. Run both apps:

```bash
npm run dev
```

## MVP behavior

- 10 courts
- 4 players max per court
- Players can only join the queue once at a time
- Courts rotate independently every 15 minutes
- Current players are removed at rotation and must rejoin manually
- Admin users can pause, resume, and force-rotate courts

## Deploy

- Deploy `client` to Vercel
- Deploy `server` to Render
- Provision PostgreSQL on Railway
- Configure `APP_URL`, `API_URL`, `DATABASE_URL`, `RESEND_API_KEY`, and `ALLOWED_EMAIL_DOMAIN`
