import { NextResponse } from "next/server";

export async function POST() {
  // TODO(party-slots): Require session, then call joinActiveCourt(user, courtId).
  return NextResponse.json(
    { error: "TODO: join active court endpoint is not implemented yet." },
    { status: 501 },
  );
}
