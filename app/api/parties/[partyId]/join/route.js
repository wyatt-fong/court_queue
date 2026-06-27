import { NextResponse } from "next/server";

export async function POST() {
  // TODO(party-slots): Require session, then call joinQueuedParty(user, partyId).
  return NextResponse.json(
    { error: "TODO: join queued party endpoint is not implemented yet." },
    { status: 501 },
  );
}
