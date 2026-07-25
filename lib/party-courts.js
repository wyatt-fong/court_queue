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

function mapParty(party, user, userMembership, userIsAdmin, courtQueueDisabled = false) {
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
    canJoinParty: userIsFree && partyIsQueued && partyHasOpenSlots && !courtQueueDisabled,
    canSwitchToParty:
      userIsQueued &&
      partyIsQueued &&
      partyHasOpenSlots &&
      userMembership.court_parties.id !== party.id &&
      !courtQueueDisabled,
    canJoinActiveCourt: userIsFree && partyIsActive && partyHasOpenSlots && !courtQueueDisabled,
    canLeave: currentUserIsMember,
    canCancel: userIsAdmin && (partyIsQueued || partyIsActive),
  };
}

export async function fetchPartyCourtsForUser(user, gym) {
    if (!["MAIN", "REC"].includes(gym)) {
        throw new Error("Invalid gym.");
    }

    const startCourt = gym === "MAIN" ? 1 : 7;
    const endCourt = gym === "MAIN" ? 6 : 10;
    const supabase = getSupabaseAdmin();

    const [
        userMembership,
        { data: courts, error },
    ] = await Promise.all([
        getUserActiveMembership(user.id),
        supabase
            .from("courts")
            .select(`
                id,
                number,
                rotation_minutes,
                paused,
                queue_disabled,
                last_rotated_at
                `)
            .gte("number", startCourt)
            .lte("number", endCourt)
            .order("number"),
    ]);

    if (error) {
        throw new Error(error.message);
    }

    const userIsQueued = userMembership?.court_parties?.status === "queued";
    const userIsActive = userMembership?.court_parties?.status === "active";
    const userIsFree = !userMembership;
    const userIsAdmin = Boolean(user.is_admin);
    const courtIds = (courts ?? []).map((court) => court.id);

    const [
        { data: activeParties, error: activePartiesError },
        { data: queuedParties, error: queuedPartiesError },
    ] = courtIds.length
        ? await Promise.all([
            supabase
                .from("court_parties")
                .select(`
                    id,
                    court_id,
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
                `)
                .in("court_id", courtIds)
                .eq("status", "active"),
            supabase
                .from("court_parties")
                .select("id, court_id, status, position")
                .in("court_id", courtIds)
                .eq("status", "queued"),
        ])
        : [
            { data: [], error: null },
            { data: [], error: null },
        ];

    if (activePartiesError) {
        throw new Error(activePartiesError.message);
    }

    if (queuedPartiesError) {
        throw new Error(queuedPartiesError.message);
    }

    const activePartiesByCourtId = new Map(
        (activeParties ?? []).map((party) => [party.court_id, party]),
    );
    const queuedPartiesByCourtId = new Map();

    for (const party of queuedParties ?? []) {
        const parties = queuedPartiesByCourtId.get(party.court_id) ?? [];
        parties.push(party);
        queuedPartiesByCourtId.set(party.court_id, parties);
    }

    return {
        courts: (courts ?? []).map((court) => {
        const activePartyRow = activePartiesByCourtId.get(court.id) ?? null;
        const activeParty = activePartyRow
            ? mapParty(activePartyRow, user, userMembership, userIsAdmin, court.queue_disabled)
            : null;
        const queuedPartiesForCourt = queuedPartiesByCourtId.get(court.id) ?? [];
        const queuedPartyCount = queuedPartiesForCourt.length;
        const activeOpenSlots = activeParty?.openSlots ?? 4;
        const userParty = userMembership?.court_parties?.court_id === court.id
            ? {
                id: userMembership.court_parties.id,
                status: userMembership.court_parties.status,
                position: userMembership.court_parties.position,
                canLeave: true,
            }
            : null;

        return {
            id: court.id,
            number: court.number,
            rotationMinutes: court.rotation_minutes,
            paused: court.paused,
            queueDisabled: court.queue_disabled,
            lastRotatedAt: court.last_rotated_at,
            activeParty,
            activeOpenSlots,
            queuedPartyCount,
            userParty,
            canJoinNewParty: userIsFree && !court.queue_disabled,
            canSwitchToNewParty: userIsQueued && !court.queue_disabled,
            canJoinActiveCourt:
            userIsFree &&
            Boolean(activeParty) &&
            activeOpenSlots > 0 &&
            !court.queue_disabled,
            canSwitchToActiveCourt: false,
            canLeave: userMembership?.court_parties?.court_id === court.id,
            userQueueStatus: userIsActive ? "active" : userIsQueued ? "queued" : "none",
        };
        }),
    };
}

export async function fetchQueuedPartiesForCourt(user, courtId) {
    const supabase = getSupabaseAdmin();
    const userMembership = await getUserActiveMembership(user.id);
    const userIsAdmin = Boolean(user.is_admin);

    const { data: court, error: courtError } = await supabase
        .from("courts")
        .select("id, queue_disabled")
        .eq("id", courtId)
        .single();

    if (courtError) {
        throw new Error(courtError.message);
    }

    const { data: parties, error } = await supabase
        .from("court_parties")
        .select(`
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
        `)
        .eq("court_id", courtId)
        .eq("status", "queued")
        .order("position");

    if (error) {
        throw new Error(error.message);
    }

    return {
        queuedParties: (parties ?? []).map((party) =>
            mapParty(party, user, userMembership, userIsAdmin, court.queue_disabled),
        ),
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

export async function adminToggleCourtQueueDisabled(adminUser, courtId) {
    if (!adminUser.is_admin) {
        throw new Error("Admin access required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: queueDisabled, error } = await supabase.rpc(
        "toggle_court_queue_disabled_atomic",
        { p_court_id: courtId },
    );

    if (error) throw new Error(error.message);

    return { ok: true, queueDisabled };
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

export async function adminCreateDummyPlayer(adminUser, { courtId, displayName, partyId }) {
    if (!adminUser.is_admin) {
        throw new Error("Admin access required.");
    }

    const normalizedDisplayName = displayName?.trim();

    if (!normalizedDisplayName) {
        throw new Error("Dummy name is required.");
    }

    if (normalizedDisplayName.length > 80) {
        throw new Error("Dummy name must be 80 characters or less.");
    }

    if (!courtId && !partyId) {
        throw new Error("Choose a court or party for the dummy player.");
    }

    const supabase = getSupabaseAdmin();
    const batchKey = crypto.randomUUID();
    let dummyUser;
    let party;

    const { data: createdUser, error: createUserError } = await supabase
        .from("users")
        .insert({
            email: `dummy+${batchKey}@court-queue.test`,
            google_sub: `dummy:${batchKey}`,
            display_name: normalizedDisplayName,
            is_admin: false,
        })
        .select("*")
        .single();

    if (createUserError) throw new Error(createUserError.message);

    dummyUser = createdUser;

    try {
        if (partyId) {
            const { data: destinationParty, error: partyError } = await supabase
                .from("court_parties")
                .select("id, status")
                .eq("id", partyId)
                .single();

            if (partyError) throw new Error(partyError.message);

            if (!["queued", "active"].includes(destinationParty.status)) {
                throw new Error("Dummy players can only be added to active or queued parties.");
            }

            const { error: joinError } = await supabase.rpc("join_party_atomic", {
                p_party_id: partyId,
                p_user_id: dummyUser.id,
                p_display_name: dummyUser.display_name,
                p_required_status: destinationParty.status,
            });

            if (joinError) throw new Error(joinError.message);
        } else {
            const { data: createdParty, error: createPartyError } = await supabase.rpc(
                "create_queued_party_atomic",
                {
                    p_court_id: courtId,
                    p_user_id: dummyUser.id,
                    p_display_name: dummyUser.display_name,
                },
            );

            if (createPartyError) throw new Error(createPartyError.message);

            party = createdParty;
        }
    } catch (error) {
        if (party?.id) {
            await supabase.rpc("delete_party_atomic", { p_party_id: party.id });
        }

        if (dummyUser?.id) {
            await supabase.from("users").delete().eq("id", dummyUser.id);
        }

        throw error;
    }

    return { ok: true, party };
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
