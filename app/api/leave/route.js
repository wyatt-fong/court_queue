import { NextResponse } from "next/server";
import { removeQueuedPlayer, removeQueuedPlayerForUser } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";
import {
  removeDemoQueuedPlayer,
  removeDemoQueuedPlayerForUser,
} from "../../../lib/demo-courts";

export async function POST(request) {
  try {
    // TODO(party-slots): Retire this legacy endpoint after the frontend calls
    // POST /api/parties/:partyId/leave for both queued and active parties.
    const { courtId, playerId } = await request.json();
    const user = await requireSessionUser();

    if (user.is_demo && playerId && user.is_admin) {
      removeDemoQueuedPlayer(courtId, playerId);
    } else if (user.is_demo) {
      removeDemoQueuedPlayerForUser(courtId, user);
    } else if (playerId && user.is_admin) {
      await removeQueuedPlayer(courtId, playerId);
    } else {
      await removeQueuedPlayerForUser(courtId, user);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
