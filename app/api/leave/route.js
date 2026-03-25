import { NextResponse } from "next/server";
import { removeQueuedPlayer } from "../../../lib/courts";

export async function POST(request) {
  try {
    const { courtId, playerId } = await request.json();
    await removeQueuedPlayer(courtId, playerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
