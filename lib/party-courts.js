// TODO(party-slots): Replace the legacy flat queue in lib/courts.js with this model.
// This file is intentionally contract-only for now so the party-slot feature can be
// implemented in focused chunks without breaking the current app.
import { getSupabaseAdmin } from "./supabase-admin";

async function getUserActiveMembership(userId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("court_party_members")
    .select(`
      id,
      party_id,
      court_parties!inner (
        id,
        court_id,
        status,
        position
      )
    `)
    .eq("user_id", userId)
    .in("court_parties.status", ["queued", "active"])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function mapPartyMembers(members, user, userIsAdmin) {
    return [...(members ?? [])]
        .sort((left, right) => left.joined_order - right.joined_order)
        .map((member) => ({
        id: member.id,
        userId: member.user_id,
        displayName: member.display_name,
        joinedOrder: member.joined_order,
        joinedAt: member.joined_at,
        isCurrentUser: member.user_id === user.id,
        canAdminRemove: userIsAdmin && member.user_id !== user.id,
        }));
}

function mapParty(party, user, userMembership, userIsAdmin) {
  const members = mapPartyMembers(party.court_party_members, user, userIsAdmin);
  const currentUserIsMember = members.some((member) => member.isCurrentUser);
  const userIsFree = !userMembership;
  const userIsQueued = userMembership?.court_parties?.status === "queued";
  const userIsActive = userMembership?.court_parties?.status === "active";
  const partyIsQueued = party.status === "queued";
  const partyIsActive = party.status === "active";
  const partyHasOpenSlots = members.length < 4;

  return {
    id: party.id,
    status: party.status,
    position: party.position,
    createdAt: party.created_at,
    activatedAt: party.activated_at,
    members,
    openSlots: Math.max(0, 4 - members.length),
    canJoinParty: userIsFree && partyIsQueued && partyHasOpenSlots,
    canSwitchToParty:
      userIsQueued &&
      partyIsQueued &&
      partyHasOpenSlots &&
      userMembership.court_parties.id !== party.id,
    canJoinActiveCourt: userIsFree && partyIsActive && partyHasOpenSlots,
    canLeave: currentUserIsMember,
    canCancel: userIsAdmin && partyIsQueued,
  };
}

async function compactQueuedPartyPositions(supabase, courtId) {
  const { data: queuedParties, error } = await supabase
    .from("court_parties")
    .select("id, position")
    .eq("court_id", courtId)
    .eq("status", "queued")
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  for (const [index, party] of (queuedParties ?? []).entries()) {
    const nextPosition = index + 1;

    if (party.position === nextPosition) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("court_parties")
      .update({ position: nextPosition })
      .eq("id", party.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

export async function fetchPartyCourtsForUser(user, gym) {
    if (!["MAIN", "REC"].includes(gym)) {
        throw new Error("Invalid gym.");
    }

    const supabase = getSupabaseAdmin();
    const userMembership = await getUserActiveMembership(user.id);
    const userIsQueued = userMembership?.court_parties?.status === "queued";
    const userIsActive = userMembership?.court_parties?.status === "active";
    const userIsFree = !userMembership;
    const userIsAdmin = Boolean(user.is_admin);

    const startCourt = gym === "MAIN" ? 1 : 7;
    const endCourt = gym === "MAIN" ? 6 : 10;

    const { data: courts, error } = await supabase
        .from("courts")
        .select(`
            id,
            number,
            rotation_minutes,
            paused,
            last_rotated_at,
            court_parties (
                id,
                status,
                position,
                created_at,
                activated_at,
                court_party_members (
                id,
                user_id,
                display_name,
                joined_order,
                joined_at
                )
            )
            `)
        .gte("number", startCourt)
        .lte("number", endCourt)
        .order("number");

    if (error) {
        throw new Error(error.message);
    }

    return {
        courts: (courts ?? []).map((court) => {
        const parties = court.court_parties ?? [];
        const activePartyRow = parties.find((party) => party.status === "active") ?? null;
        const activeParty = activePartyRow
            ? mapParty(activePartyRow, user, userMembership, userIsAdmin)
            : null;
        const queuedParties = parties
            .filter((party) => party.status === "queued")
            .sort((left, right) => left.position - right.position)
            .slice(0, 5)
            .map((party) => mapParty(party, user, userMembership, userIsAdmin));
        const activeOpenSlots = activeParty?.openSlots ?? 4;

        return {
            id: court.id,
            number: court.number,
            rotationMinutes: court.rotation_minutes,
            paused: court.paused,
            lastRotatedAt: court.last_rotated_at,
            activeParty,
            activeOpenSlots,
            queuedParties,
            canJoinNewParty: userIsFree && queuedParties.length < 5,
            canSwitchToNewParty: userIsQueued && queuedParties.length < 5,
            canJoinActiveCourt:
            userIsFree &&
            Boolean(activeParty) &&
            activeOpenSlots > 0,
            canSwitchToActiveCourt: false,
            canLeave: parties.some((party) =>
            (party.court_party_members ?? []).some((member) => member.user_id === user.id),
            ),
            userQueueStatus: userIsActive ? "active" : userIsQueued ? "queued" : "none",
        };
        }),
    };
}

export async function createQueuedParty(_user, _courtId) {
  // TODO(party-slots): Create a queued party at the end of this court's queue and add
  // the signed-in user as its first member. Reject if the user is already queued/active.
    // Connect to supabase
    const supabase = getSupabaseAdmin();

    // Check if the user is already in a party
    const existing = await getUserActiveMembership(_user.id);
    if (existing) {
        throw new Error("User is already in a party.");
    }

    // Fetch the last party for the court to determine the next position
    const { data: lastParty, error: lastError } = await supabase
        .from("parties")
        .select("id")
        .eq("court_id", _courtId)
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

export async function joinQueuedParty(user, partyId) {
    const supabase = getSupabaseAdmin();

    const existing = await getUserActiveMembership(user.id);
    if (existing) {
        throw new Error("You are already on a court or in a queue.");
    }
    
    // Obtain the party details to check its status and member count
    const { data: party, error: partyError } = await supabase
        .from("court_parties")
        .select("id, status")
        .eq("id", partyId)
        .maybeSingle();

    if (partyError) throw new Error(partyError.message);
    if (!party) throw new Error("Party not found.");
    if (party.status !== "queued") {
        throw new Error("You can only join queued parties.");
    }

    // Check the number of members in the party to ensure it is not full
    const { data: members, error: membersError } = await supabase
        .from("court_party_members")
        .select("id")
        .eq("party_id", partyId);

    if (membersError) throw new Error(membersError.message);
    if (members.length >= 4) throw new Error("Party is full.");

    // Add the user to the party members
    const { error: memberError } = await supabase
        .from("court_party_members")
        .insert({
        party_id: partyId,
        user_id: user.id,
        display_name: user.display_name,
        joined_order: members.length + 1,
        });

    if (memberError) throw new Error(memberError.message);

    return { ok: true };
}

export async function leaveParty(_user, _partyId) {
  // (party-slots): Remove the signed-in user from a queued or active party. If a
  // queued party becomes empty, delete/cancel it and preserve other queue positions.
    const supabase = getSupabaseAdmin();

    const { data: party, error: partyError } = await supabase
        .from("court_parties")
        .select("id, status")
        .eq("id", partyId)
        .maybeSingle();

    if (partyError) throw new Error(partyError.message);
    if (!party) throw new Error("Party not found.");

    // Remove the user from the party members
    const { error: memberError } = await supabase
        .from("court_party_members")
        .delete()
        .eq("party_id", partyId)
        .eq("user_id", user.id);

    if (memberError) throw new Error(memberError.message);

    // Check if the party is now empty and delete it if so
    const { data: remainingMembers, error: remainingError } = await supabase
        .from("court_party_members")
        .select("id")
        .eq("party_id", partyId);

    if (remainingError) throw new Error(remainingError.message);
    if (remainingMembers.length === 0) {
        const { error: deleteError } = await supabase
            .from("court_parties")
            .delete()
            .eq("id", partyId);

        if (deleteError) throw new Error(deleteError.message);
    }
    
    return { ok: true };
}

export async function joinActiveCourt(user, courtId) {
    const supabase = getSupabaseAdmin();

    const existing = await getUserActiveMembership(user.id);
    if (existing) {
        throw new Error("You are already on a court or in a queue.");
    }

    const { data: activeParty, error: activeError } = await supabase
        .from("court_parties")
        .select("id, status")
        .eq("court_id", courtId)
        .eq("status", "active")
        .maybeSingle();

    if (activeError) throw new Error(activeError.message);
    if (!activeParty) throw new Error("No active party available for this court.");

    const { data: members, error: membersError } = await supabase
        .from("court_party_members")
        .select("id")
        .eq("party_id", activeParty.id);

    if (membersError) throw new Error(membersError.message);
    if (members.length >= 4) throw new Error("Active court is full.");

    const { error: memberError } = await supabase
        .from("court_party_members")
        .insert({
        party_id: activeParty.id,
        user_id: user.id,
        display_name: user.display_name,
        joined_order: members.length + 1,
        });

    if (memberError) throw new Error(memberError.message);

    return { ok: true };
}

export async function rotateDuePartyCourts() {
  // TODO(party-slots): For each unpaused due court, clear the active party and promote
  // the first queued party to active, even if it has fewer than 4 members.
    const supabase = getSupabaseAdmin();

  throw new Error("TODO: implement party-slot due rotations.");
}

export async function adminCancelParty(adminUser, partyId) {
  if (!adminUser.is_admin) {
    throw new Error("Admin access required.");
  }

  const supabase = getSupabaseAdmin();

  const { data: party, error: partyError } = await supabase
    .from("court_parties")
    .select("id, court_id, status")
    .eq("id", partyId)
    .maybeSingle();

  if (partyError) throw new Error(partyError.message);
  if (!party) throw new Error("Party not found.");
  const { error: deleteError } = await supabase
    .from("court_parties")
    .delete()
    .eq("id", partyId);

  if (deleteError) throw new Error(deleteError.message);

  if (party.status === "queued") {
    await compactQueuedPartyPositions(supabase, party.court_id);
  }

  return { ok: true };
}

export async function adminRemovePartyMember(_adminUser, _partyId, _userId) {
  // TODO(party-slots): Let admins remove a specific member from queued/active parties.
  // Empty queued parties should be removed; empty active parties should become open.
  throw new Error("TODO: implement admin member removal.");
}
