import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth";
import {
  fetchPartyCourtsForUser,
  maybeRotateDuePartyCourts,
} from "../../../lib/party-courts";

export async function GET(request) {
  try {
    const user = await requireSessionUser();
    const gym = request.nextUrl.searchParams.get("gym") || "MAIN";

    await maybeRotateDuePartyCourts();
    const result = await fetchPartyCourtsForUser(user, gym);

    return NextResponse.json(result);
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 404;
    return NextResponse.json({ error: error.message }, { status });
  }
}
