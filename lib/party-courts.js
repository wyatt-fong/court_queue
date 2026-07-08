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
    canCancel: userIsAdmin && (partyIsQueued || partyIsActive),
  };
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
        const userPartyRow = parties.find((party) =>
            (party.court_party_members ?? []).some((member) => member.user_id === user.id),
        );
        const userParty = userPartyRow
            ? mapParty(userPartyRow, user, userMembership, userIsAdmin)
            : null;

        return {
            id: court.id,
            number: court.number,
            rotationMinutes: court.rotation_minutes,
            paused: court.paused,
            lastRotatedAt: court.last_rotated_at,
            activeParty,
            activeOpenSlots,
            queuedParties,
            userParty,
            canJoinNewParty: userIsFree,
            canSwitchToNewParty: userIsQueued,
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
    const supabase = getSupabaseAdmin();

    const { data: party, error } = await supabase.rpc("create_queued_party_atomic", {
        p_court_id: _courtId,
        p_user_id: _user.id,
        p_display_name: _user.display_name,
    });

    if (error) throw new Error(error.message);

    return party;
}

export async function joinQueuedParty(user, partyId) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("join_party_atomic", {
        p_party_id: partyId,
        p_user_id: user.id,
        p_display_name: user.display_name,
        p_required_status: "queued",
    });

    if (error) throw new Error(error.message);

    return { ok: true };
}

export async function leaveParty(_user, _partyId) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("remove_party_member_atomic", {
        p_party_id: _partyId,
        p_user_id: _user.id,
    });

    if (error) throw new Error(error.message);

    return { ok: true };
}

export async function joinActiveCourt(user, courtId) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("join_active_court_atomic", {
        p_court_id: courtId,
        p_user_id: user.id,
        p_display_name: user.display_name,
    });

    if (error) throw new Error(error.message);

    return { ok: true };
}

export async function rotateDuePartyCourts() {
    const supabase = getSupabaseAdmin();

    const { data: rotatedCount, error } = await supabase.rpc(
        "rotate_due_party_courts_atomic",
    );

    if (error) throw new Error(error.message);

    return { ok: true, rotatedCount };
}

export async function adminRotatePartyCourt(adminUser, courtId) {
    if (!adminUser.is_admin) {
        throw new Error("Admin access required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: rotated, error } = await supabase.rpc(
        "rotate_party_court_atomic",
        {
            p_court_id: courtId,
            p_only_if_due: false,
        },
    );

    if (error) throw new Error(error.message);

    return { ok: true, rotated };
}

export async function adminTogglePartyPause(adminUser, courtId) {
    if (!adminUser.is_admin) {
        throw new Error("Admin access required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: paused, error } = await supabase.rpc(
        "toggle_party_court_pause_atomic",
        { p_court_id: courtId },
    );

    if (error) throw new Error(error.message);

    return { ok: true, paused };
}

export async function adminCancelParty(adminUser, partyId) {
  if (!adminUser.is_admin) {
    throw new Error("Admin access required.");
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.rpc("delete_party_atomic", {
    p_party_id: partyId,
  });

  if (error) throw new Error(error.message);

  return { ok: true };
}

export async function adminRemovePartyMember(_adminUser, _partyId, _userId) {
    if (!_adminUser.is_admin) {
        throw new Error("Admin access required.");
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("remove_party_member_atomic", {
        p_party_id: _partyId,
        p_user_id: _userId,
    });

    if (error) throw new Error(error.message);

    return { ok: true };
}

export async function switchQueuedParty(user, destinationPartyId) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("switch_queued_party_atomic", {
        p_destination_party_id: destinationPartyId,
        p_user_id: user.id,
        p_display_name: user.display_name,
    });

    if (error) throw new Error(error.message);

    return { ok: true };
}

export async function switchToNewQueuedParty(user, courtId) {
    const supabase = getSupabaseAdmin();

    const { data: party, error } = await supabase.rpc(
        "switch_to_new_queued_party_atomic",
        {
            p_court_id: courtId,
            p_user_id: user.id,
            p_display_name: user.display_name,
        },
    );

    if (error) throw new Error(error.message);

    return party;
}
