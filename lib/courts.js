import { getSupabaseAdmin } from "./supabase-admin";

function nowIso() {
  return new Date().toISOString();
}

function createPlayer({ id, name, kind = "member", email = null }) {
  return {
    id: id || crypto.randomUUID(),
    name: name.trim(),
    kind,
    email,
    joined_at: nowIso(),
  };
}

function getAllPlayers(courts) {
  return courts.flatMap((court) => [...court.current_players, ...court.queue]);
}

export async function fetchCourts() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("courts").select("*").order("number");

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export function reconcileCourt(court) {
  if (court.paused) {
    return court;
  }

  const lastRotated = new Date(court.last_rotated_at).getTime();
  const elapsedMs = Date.now() - lastRotated;
  const rotationMs = court.rotation_minutes * 60 * 1000;

  if (elapsedMs < rotationMs) {
    return court;
  }

  return {
    ...court,
    current_players: court.queue.slice(0, 4),
    queue: court.queue.slice(4),
    last_rotated_at: nowIso(),
  };
}

export async function reconcileAndSaveCourts() {
  const supabase = getSupabaseAdmin();
  const courts = await fetchCourts();
  const changedCourts = courts
    .map(reconcileCourt)
    .filter((court, index) => JSON.stringify(court) !== JSON.stringify(courts[index]));

  for (const court of changedCourts) {
    const { error } = await supabase
      .from("courts")
      .update({
        current_players: court.current_players,
        queue: court.queue,
        last_rotated_at: court.last_rotated_at,
      })
      .eq("id", court.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  return changedCourts.length ? await fetchCourts() : courts;
}

export async function joinCourtQueue(user, courtId) {
  const supabase = getSupabaseAdmin();
  const courts = await reconcileAndSaveCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  if (!user?.id || !user.display_name) {
    throw new Error("Signed-in user is required.");
  }

  const existingPlayer = getAllPlayers(courts).find((player) => player.id === user.id);

  if (existingPlayer) {
    throw new Error("You are already on a court or in a queue.");
  }

  const updatedQueue = [
    ...court.queue,
    createPlayer({
      id: user.id,
      name: user.display_name,
      kind: "member",
      email: user.email,
    }),
  ];
  const shouldFillNow = court.current_players.length === 0;
  const nextCourt = shouldFillNow
    ? {
        ...court,
        current_players: updatedQueue.slice(0, 4),
        queue: updatedQueue.slice(4),
        last_rotated_at: nowIso(),
      }
    : {
        ...court,
        queue: updatedQueue,
      };

  const { error } = await supabase
    .from("courts")
    .update({
      current_players: nextCourt.current_players,
      queue: nextCourt.queue,
      last_rotated_at: nextCourt.last_rotated_at,
    })
    .eq("id", courtId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeQueuedPlayer(courtId, playerId) {
  const supabase = getSupabaseAdmin();
  const courts = await reconcileAndSaveCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  const nextQueue = court.queue.filter((player) => player.id !== playerId);

  const { error } = await supabase.from("courts").update({ queue: nextQueue }).eq("id", courtId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeQueuedPlayerForUser(courtId, user) {
  if (!user?.id) {
    throw new Error("Signed-in user is required.");
  }

  await removeQueuedPlayer(courtId, user.id);
}

export async function adminRotateCourt(courtId) {
  const supabase = getSupabaseAdmin();
  const courts = await reconcileAndSaveCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  const { error } = await supabase
    .from("courts")
    .update({
      current_players: court.queue.slice(0, 4),
      queue: court.queue.slice(4),
      last_rotated_at: nowIso(),
    })
    .eq("id", courtId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function adminTogglePause(courtId) {
  const supabase = getSupabaseAdmin();
  const courts = await fetchCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  const { error } = await supabase
    .from("courts")
    .update({ paused: !court.paused })
    .eq("id", courtId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function adminAddDummy(courtId, name) {
  const supabase = getSupabaseAdmin();
  const courts = await reconcileAndSaveCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  if (!name.trim()) {
    throw new Error("Dummy player name is required.");
  }

  const updatedQueue = [...court.queue, createPlayer({ name, kind: "dummy" })];
  const shouldFillNow = court.current_players.length === 0;
  const nextCourt = shouldFillNow
    ? {
        ...court,
        current_players: updatedQueue.slice(0, 4),
        queue: updatedQueue.slice(4),
        last_rotated_at: nowIso(),
      }
    : {
        ...court,
        queue: updatedQueue,
      };

  const { error } = await supabase
    .from("courts")
    .update({
      current_players: nextCourt.current_players,
      queue: nextCourt.queue,
      last_rotated_at: nextCourt.last_rotated_at,
    })
    .eq("id", courtId);

  if (error) {
    throw new Error(error.message);
  }
}
