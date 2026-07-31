import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

function psqlBaseArgs() {
  if (process.env.TEST_DATABASE_URL) {
    return [process.env.TEST_DATABASE_URL];
  }

  return [
    "-h",
    process.env.TEST_DATABASE_HOST || "localhost",
    "-p",
    process.env.TEST_DATABASE_PORT || "54322",
    "-U",
    process.env.TEST_DATABASE_USER || "postgres",
    "-d",
    process.env.TEST_DATABASE_NAME || "postgres",
  ];
}

function psql(args, options = {}) {
  return execFileSync("psql", [...psqlBaseArgs(), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: process.env.TEST_DATABASE_PASSWORD || process.env.PGPASSWORD || "postgres",
    },
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
}

function sql(command) {
  return psql(["-At", "-F", "\t", "-c", command]).replace(/\r?\n$/, "");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rows(command) {
  const output = sql(command);
  if (!output) return [];
  return output.split("\n").map((line) => line.split("\t"));
}

function oneRow(command) {
  const result = rows(command);
  assert.equal(result.length, 1);
  return result[0];
}

function resetDatabase() {
  psql([
    "-c",
    `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
`,
  ]);

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    psql(["-f", path.join(migrationsDir, file)], { stdio: "pipe" });
  }
}

function createUser(name, options = {}) {
  const email = options.email || `${name.toLowerCase().replaceAll(/\s+/g, ".")}@ucsd.edu`;
  const googleSub = options.googleSub || `google:${name}:${crypto.randomUUID()}`;

  return sql(`
    insert into public.users (email, google_sub, display_name, is_admin)
    values (${quote(email)}, ${quote(googleSub)}, ${quote(name)}, ${options.isAdmin ? "true" : "false"})
    returning id;
  `);
}

function courtId(number) {
  return sql(`select id from public.courts where number = ${Number(number)};`);
}

function createParty(court, user, displayName = "Player") {
  return oneRow(`
    select id, status, coalesce(position::text, '')
    from public.create_queued_party_atomic(${quote(court)}, ${quote(user)}, ${quote(displayName)});
  `);
}

function joinParty(party, user, displayName, requiredStatus = "queued") {
  sql(`
    select public.join_party_atomic(
      ${quote(party)},
      ${quote(user)},
      ${quote(displayName)},
      ${quote(requiredStatus)}
    );
  `);
}

test("first party on an empty court becomes active; later parties are queued in order", () => {
  resetDatabase();

  const court = courtId(1);
  const alice = createUser("Alice");
  const bob = createUser("Bob");
  const carol = createUser("Carol");

  const [firstPartyId, firstPartyStatus, firstPartyPosition] = createParty(court, alice, "Alice");
  assert.match(firstPartyId, /^[0-9a-f-]{36}$/);
  assert.equal(firstPartyStatus, "active");
  assert.equal(firstPartyPosition, "");
  assert.deepEqual(createParty(court, bob, "Bob").slice(1), ["queued", "1"]);
  assert.deepEqual(createParty(court, carol, "Carol").slice(1), ["queued", "2"]);

  assert.deepEqual(
    rows(`
      select status, coalesce(position::text, ''), count(member.id)::text
      from public.court_parties party
      left join public.court_party_members member on member.party_id = party.id
      where party.court_id = ${quote(court)}
      group by party.id, party.status, party.position
      order by party.status, party.position nulls first;
    `),
    [
      ["active", "", "1"],
      ["queued", "1", "1"],
      ["queued", "2", "1"],
    ],
  );
});

test("due rotation clears the active party, promotes the first queued party, and compacts the queue", () => {
  resetDatabase();

  const court = courtId(5);
  const activeUser = createUser("Active Player");
  const firstQueuedUser = createUser("First Queued");
  const secondQueuedUser = createUser("Second Queued");

  const [activeParty] = createParty(court, activeUser, "Active Player");
  const [firstQueuedParty] = createParty(court, firstQueuedUser, "First Queued");
  const [secondQueuedParty] = createParty(court, secondQueuedUser, "Second Queued");

  sql(`
    update public.courts
    set last_rotated_at = now() - interval '20 minutes',
        rotation_minutes = 15
    where id = ${quote(court)};
  `);

  assert.equal(
    sql(`select public.rotate_party_court_atomic(${quote(court)}, true)::text;`),
    "true",
  );

  assert.deepEqual(
    rows(`
      select id, status, coalesce(position::text, '')
      from public.court_parties
      where id in (${quote(firstQueuedParty)}, ${quote(secondQueuedParty)})
      order by case id
        when ${quote(firstQueuedParty)} then 1
        else 3
      end;
    `),
    [
      [firstQueuedParty, "active", ""],
      [secondQueuedParty, "queued", "1"],
    ],
  );

  assert.equal(
    sql(`select count(*)::text from public.court_parties where id = ${quote(activeParty)};`),
    "0",
  );
});
