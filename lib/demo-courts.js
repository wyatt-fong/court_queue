function nowIso() {
  return new Date().toISOString();
}

// TODO(party-slots): This mirrors the legacy flat-player queue for demo mode.
// Update it to the same party-slot shape as lib/party-courts.js so p1-p4 can test
// party creation, party joining, active court joining, and party leaving locally.

function createPlayer({ id, name, kind = "member", email = null }) {
  return {
    id: id || crypto.randomUUID(),
    name: name.trim(),
    kind,
    email,
    joined_at: nowIso(),
  };
}

function createDemoCourt(number) {
  return {
    id: `demo-court-${number}`,
    number,
    rotation_minutes: 15,
    paused: false,
    current_players: [],
    queue: [],
    last_rotated_at: nowIso(),
    created_at: nowIso(),
  };
}

function getDemoState() {
  if (!globalThis.__courtQueueDemoCourts) {
    globalThis.__courtQueueDemoCourts = Array.from({ length: 10 }, (_, index) =>
      createDemoCourt(index + 1),
    );
  }

  return globalThis.__courtQueueDemoCourts;
}

function cloneCourts(courts) {
  return JSON.parse(JSON.stringify(courts));
}

function getAllPlayers(courts) {
  return courts.flatMap((court) => [...court.current_players, ...court.queue]);
}

function reconcileCourt(court) {
  if (court.paused) {
    return court;
  }

  const lastRotated = new Date(court.last_rotated_at).getTime();
  const elapsedMs = Date.now() - lastRotated;
  const rotationMs = court.rotation_minutes * 60 * 1000;

  if (elapsedMs < rotationMs) {
    return court;
  }

  court.current_players = court.queue.slice(0, 4);
  court.queue = court.queue.slice(4);
  court.last_rotated_at = nowIso();
  return court;
}

export function fetchDemoCourts() {
  const courts = getDemoState();
  courts.forEach(reconcileCourt);
  return cloneCourts(courts);
}

export function joinDemoCourtQueue(user, courtId) {
  const courts = getDemoState();
  courts.forEach(reconcileCourt);
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
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

  if (court.current_players.length === 0) {
    court.current_players = updatedQueue.slice(0, 4);
    court.queue = updatedQueue.slice(4);
    court.last_rotated_at = nowIso();
  } else {
    court.queue = updatedQueue;
  }
}

export function removeDemoQueuedPlayer(courtId, playerId) {
  const courts = getDemoState();
  courts.forEach(reconcileCourt);
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  court.queue = court.queue.filter((player) => player.id !== playerId);
}

export function removeDemoQueuedPlayerForUser(courtId, user) {
  removeDemoQueuedPlayer(courtId, user.id);
}

export function adminRotateDemoCourt(courtId) {
  const courts = getDemoState();
  courts.forEach(reconcileCourt);
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  court.current_players = court.queue.slice(0, 4);
  court.queue = court.queue.slice(4);
  court.last_rotated_at = nowIso();
}

export function adminToggleDemoPause(courtId) {
  const court = getDemoState().find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  court.paused = !court.paused;
}

export function adminAddDemoDummy(courtId, name) {
  const courts = getDemoState();
  courts.forEach(reconcileCourt);
  const court = courts.find((entry) => entry.id === courtId);

  if (!court) {
    throw new Error("Court not found.");
  }

  if (!name.trim()) {
    throw new Error("Dummy player name is required.");
  }

  const updatedQueue = [...court.queue, createPlayer({ name, kind: "dummy" })];

  if (court.current_players.length === 0) {
    court.current_players = updatedQueue.slice(0, 4);
    court.queue = updatedQueue.slice(4);
    court.last_rotated_at = nowIso();
  } else {
    court.queue = updatedQueue;
  }
}
