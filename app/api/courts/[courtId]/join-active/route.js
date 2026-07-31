import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/auth";
import { joinActiveCourt } from "../../../../../lib/party-courts";

export async function POST(_request, { params }) {
  try {
    const user = await requireSessionUser();
    const { courtId } = await params;

    await joinActiveCourt(user, courtId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 404;
    return NextResponse.json({ error: error.message }, { status });
  }
}
