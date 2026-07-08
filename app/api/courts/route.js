import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth";
import {
  fetchPartyCourtsForUser,
  rotateDuePartyCourts,
} from "../../../lib/party-courts";

export async function GET(request) {
  try {
    const user = await requireSessionUser();
    const gym = request.nextUrl.searchParams.get("gym") || "MAIN";

    await rotateDuePartyCourts();
    const result = await fetchPartyCourtsForUser(user, gym);

    return NextResponse.json(result);
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
