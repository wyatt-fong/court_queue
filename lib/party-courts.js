// TODO(party-slots): Replace the legacy flat queue in lib/courts.js with this model.
// This file is intentionally contract-only for now so the party-slot feature can be
// implemented in focused chunks without breaking the current app.
import { getSupabaseAdmin } from "./supabase-admin";

export async function fetchPartyCourtsForUser(_user) {
  // TODO(party-slots): Return courts with activeParty, activeOpenSlots, queuedParties,
  // and UI-ready booleans: canJoinNewParty, canJoinParty, canJoinActiveCourt,
  // canLeave, canCancel, canAdminRemove.
  throw new Error("TODO: implement party-slot court fetch.");
}

export async function createQueuedParty(_user, _courtId) {
  // TODO(party-slots): Create a queued party at the end of this court's queue and add
  // the signed-in user as its first member. Reject if the user is already queued/active.
    // Connect to supabase
    const supabase = getSupabaseAdmin();

    // Check if the user is already in a party
    const existing = await getUserActiveMembership(user.id);
    if (existing) {
        throw new Error("User is already in a party.");
    }

    // Fetch the last party for the court to determine the next position
    const { data: lastParty, error: lastError } = await supabase
        .from("parties")
        .select("id")
        .eq("court_id", courtId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastError) throw new Error(`Error fetching last party: ${lastError.message}`);

    // Determine the next position for the new party
    const nextPosition = (lastParty?.position ?? 0) + 1;
    // Insert the new party into the database
    const { data: party, error: partyError } = await supabase
        .from("court_parties")
        .insert({
        court_id: courtId,
        status: "queued",
        position: nextPosition,
        created_by: user.id,
        })
        .select("*")
        .single();

    if (partyError) throw new Error(partyError.message);
    
    const { error: memberError } = await supabase
        .from("court_party_members")
        .insert({
        party_id: party.id,
        user_id: user.id,
        display_name: user.display_name,
        joined_order: 1,
        });

    if (memberError) throw new Error(memberError.message);

    return party;
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
  const supabase = getSupabaseAdmin();


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
