import { NextResponse } from "next/server";
import { removeQueuedPlayer, removeQueuedPlayerForUser } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";

export async function POST(request) {
  try {
    const { courtId, playerId } = await request.json();
    const user = await requireSessionUser();

    if (playerId && user.is_admin) {
      await removeQueuedPlayer(courtId, playerId);
    } else {
      await removeQueuedPlayerForUser(courtId, user);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
