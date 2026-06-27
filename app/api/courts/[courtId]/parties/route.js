import { NextResponse } from "next/server";

export async function POST() {
  // TODO(party-slots): Require session, then call createQueuedParty(user, courtId).
  // This replaces the legacy POST /api/join path once the party model is live.
  return NextResponse.json(
    { error: "TODO: create queued party endpoint is not implemented yet." },
    { status: 501 },
  );
}
