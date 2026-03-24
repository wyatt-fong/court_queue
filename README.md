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

### Production setup

#### 1. Push the repo to GitHub

Both Vercel and Render work best from the same GitHub repo.

#### 2. Create a Railway PostgreSQL database

- Create a new Railway project
- Add a PostgreSQL service
- Copy the `DATABASE_URL`

Railway provides `DATABASE_URL` automatically for Postgres services:
https://docs.railway.com/guides/postgresql

#### 3. Deploy the backend on Render

- Create a new Web Service from this repo
- Let Render detect [render.yaml](./render.yaml)
- Keep the service `rootDir` as `server`

Set these environment variables in Render:

- `DATABASE_URL=<Railway database url>`
- `APP_URL=<your Vercel frontend url>`
- `ALLOWED_EMAIL_DOMAIN=ucsd.edu`
- `ADMIN_EMAILS=your-admin-email@ucsd.edu`
- `GOOGLE_CLIENT_ID=<your google oauth client id>`
- `JWT_SECRET=<long random string>`
- `RESEND_API_KEY=<your resend api key>`
- `RESEND_FROM_EMAIL=<verified resend sender>`
- `NODE_ENV=production`

Important:

- `preDeployCommand` already runs `prisma migrate deploy` on Render
- You should run the seed once after first deploy using a Render shell or one-off job:

```bash
npm run seed
```

Render deploy docs:
https://render.com/docs/deploys

Blueprint docs:
https://render.com/docs/blueprint-spec

#### 4. Deploy the frontend on Vercel

- Import the same GitHub repo into Vercel
- Keep the project rooted at the repo root
- Vercel will use [vercel.json](./vercel.json)

Set these Vercel environment variables:

- `VITE_API_URL=https://<your-render-service>.onrender.com`
- `VITE_GOOGLE_CLIENT_ID=<your google oauth client id>`

Vercel Vite docs:
https://vercel.com/docs/frameworks/frontend/vite

#### 5. Update Google OAuth settings

In Google Cloud Console, update the OAuth client:

- Authorized JavaScript origins:
  - `http://localhost:5173`
  - `https://<your-vercel-site>.vercel.app`
- If you later add a custom domain, add that too

Google Identity docs:
https://developers.google.com/identity/

#### 6. Update Resend sender domain

For production email, `RESEND_FROM_EMAIL` must use a domain you actually verified in Resend.

Resend domain docs:
https://resend.com/docs/dashboard/domains/introduction

### First production test

1. Open the Vercel frontend URL
2. Sign in with a valid `@ucsd.edu` Google account
3. Confirm login works and the backend sets a session cookie
4. Queue onto a court
5. If needed, use an admin account to add a dummy player or force-rotate a court
