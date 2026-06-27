import { NextResponse } from "next/server";

export async function POST() {
  // TODO(party-slots): Require session, then call leaveParty(user, partyId).
  return NextResponse.json(
    { error: "TODO: leave party endpoint is not implemented yet." },
    { status: 501 },
  );
}
