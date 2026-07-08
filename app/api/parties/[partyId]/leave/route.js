import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/auth";
import { leaveParty } from "../../../../../lib/party-courts";

export async function POST(_request, { params }) {
  try {
    const user = await requireSessionUser();
    const { partyId } = await params;

    await leaveParty(user, partyId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
