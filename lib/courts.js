import { getSupabaseAdmin } from "./supabase-admin";

function nowIso() {
  return new Date().toISOString();
}

function createPlayer(name, kind = "member") {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    kind,
    joined_at: nowIso(),
  };
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

export async function joinCourtQueue(name, courtId) {
  const supabase = getSupabaseAdmin();
  const courts = await reconcileAndSaveCourts();
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Name is required.");
  }

  const existingName = [...court.current_players, ...court.queue].find(
    (player) => player.name.toLowerCase() === trimmedName.toLowerCase(),
  );

  if (existingName) {
    throw new Error("That name is already on this court.");
  }

  const updatedQueue = [...court.queue, createPlayer(trimmedName)];
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

  const updatedQueue = [...court.queue, createPlayer(name, "dummy")];
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

