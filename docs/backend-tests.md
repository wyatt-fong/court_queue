# Backend Integration Tests

These tests exercise the Supabase/Postgres RPC functions directly. That is the most important backend surface for this app because queue creation, joining, switching, leaving, and rotation are implemented as transactional SQL functions.

## Local Test Backend

Recommended setup:

```bash
supabase start
npm test
```

If `supabase start` complains that the project is not initialized, run:

```bash
supabase init
supabase start
npm test
```

By default, the tests connect to the standard Supabase local database:

```txt
host: localhost
port: 54322
user: postgres
password: postgres
database: postgres
```

You can override that with either a full URL:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres npm test
```

or separate settings:

```bash
TEST_DATABASE_HOST=localhost \
TEST_DATABASE_PORT=54322 \
TEST_DATABASE_USER=postgres \
TEST_DATABASE_PASSWORD=postgres \
TEST_DATABASE_NAME=postgres \
npm test
```

## What The Starter Tests Do

Each test resets the `public` schema, applies all files in `supabase/migrations` in timestamp order, then runs SQL against the real RPC functions.

Current coverage:

- first party on an empty court becomes active
- later parties are queued in order
- due rotation clears active party and promotes first queued party

## Tests For You To Add

These are the remaining backend tests worth writing:

- parties are capped at four members
- a user cannot join two active/queued parties
- queued users can switch parties
- source queue positions compact after switching
- leaving the last member removes a queued party and compacts positions
- paused courts do not rotate automatically
- queue-disabled courts do not rotate automatically
- clearing an active party promotes the next queued party
- two users racing to join one open slot leave the party in a valid state

## Good Route Tests To Add Later

These tests cover the SQL/RPC backend. A separate route-level suite would still be useful for API behavior:

- unauthenticated users get `401` from protected routes
- non-admin users get `403` from admin routes
- invalid request bodies return `400`
- admin actions return the expected response shape
- Google auth route rejects missing or invalid ID tokens

## Important Safety Note

These tests intentionally drop and recreate the `public` schema. Run them only against a disposable local/test database, never against production or a shared staging database.
