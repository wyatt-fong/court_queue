import { NextResponse } from "next/server";
import { requireAdminUser } from "../../../lib/auth";
import {
  adminCancelParty,
  adminCreateDummyPlayer,
  adminRemovePartyMember,
  adminRotatePartyCourt,
  adminToggleCourtQueueDisabled,
  adminTogglePartyPause,
} from "../../../lib/party-courts";

export async function POST(request) {
  try {
    const { action, courtId, displayName, partyId, userId } = await request.json();
    const user = await requireAdminUser();

    if (action === "rotate") {
      await adminRotatePartyCourt(user, courtId);
    } else if (action === "toggle_pause") {
      await adminTogglePartyPause(user, courtId);
    } else if (action === "toggle_queue_disabled") {
      await adminToggleCourtQueueDisabled(user, courtId);
    } else if (action === "create_dummy_player") {
      await adminCreateDummyPlayer(user, { courtId, displayName, partyId });
    } else if (action === "remove_party_member") {
      await adminRemovePartyMember(user, partyId, userId);
    } else if (action === "clear_active_court" || action === "cancel_queued_party") {
      await adminCancelParty(user, partyId);
    } else {
      return NextResponse.json({ error: "Unknown admin action." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
