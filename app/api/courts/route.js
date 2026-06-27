import { NextResponse } from "next/server";
import { reconcileAndSaveCourts } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";
import { fetchDemoCourts } from "../../../lib/demo-courts";

export async function GET() {
  try {
    const user = await requireSessionUser();
    // TODO(party-slots): Replace this legacy flat queue response with
    // fetchPartyCourtsForUser(user), including activeParty and queuedParties.
    const courts = user.is_demo ? fetchDemoCourts() : await reconcileAndSaveCourts();
    return NextResponse.json({ courts });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
