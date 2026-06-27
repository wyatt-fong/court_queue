// TODO(party-slots): Replace the legacy flat queue in lib/courts.js with this model.
// This file is intentionally contract-only for now so the party-slot feature can be
// implemented in focused chunks without breaking the current app.

export async function fetchPartyCourtsForUser(_user) {
  // TODO(party-slots): Return courts with activeParty, activeOpenSlots, queuedParties,
  // and UI-ready booleans: canJoinNewParty, canJoinParty, canJoinActiveCourt,
  // canLeave, canCancel, canAdminRemove.
  throw new Error("TODO: implement party-slot court fetch.");
}

export async function createQueuedParty(_user, _courtId) {
  // TODO(party-slots): Create a queued party at the end of this court's queue and add
  // the signed-in user as its first member. Reject if the user is already queued/active.
  throw new Error("TODO: implement queued party creation.");
}

export async function joinQueuedParty(_user, _partyId) {
  // TODO(party-slots): Add the signed-in user to a queued party with fewer than 4
  // members. Reject if full, active, canceled, or the user is already queued/active.
  throw new Error("TODO: implement queued party join.");
}

export async function leaveParty(_user, _partyId) {
  // TODO(party-slots): Remove the signed-in user from a queued or active party. If a
  // queued party becomes empty, delete/cancel it and preserve other queue positions.
  throw new Error("TODO: implement party leave.");
}

export async function joinActiveCourt(_user, _courtId) {
  // TODO(party-slots): Add the signed-in user to the active party on a court when it
  // has fewer than 4 members. Reject if the user is already queued/active elsewhere.
  throw new Error("TODO: implement active court join.");
}

export async function rotateDuePartyCourts() {
  // TODO(party-slots): For each unpaused due court, clear the active party and promote
  // the first queued party to active, even if it has fewer than 4 members.
  throw new Error("TODO: implement party-slot due rotations.");
}

export async function adminCancelParty(_adminUser, _partyId) {
  // TODO(party-slots): Let admins cancel queued parties or clear active parties.
  throw new Error("TODO: implement admin party cancel.");
}

export async function adminRemovePartyMember(_adminUser, _partyId, _userId) {
  // TODO(party-slots): Let admins remove a specific member from queued/active parties.
  // Empty queued parties should be removed; empty active parties should become open.
  throw new Error("TODO: implement admin member removal.");
}
