import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth";
import {
  fetchPartyCourtForUser,
  maybeRotateDuePartyCourts,
} from "../../../../lib/party-courts";

export async function GET(_request, { params }) {
  try {
    const user = await requireSessionUser();
    const { courtId } = await params;

    await maybeRotateDuePartyCourts();
    const result = await fetchPartyCourtForUser(user, courtId);

    return NextResponse.json(result);
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
