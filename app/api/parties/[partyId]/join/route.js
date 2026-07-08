import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/auth";
import {
  joinQueuedParty,
  switchQueuedParty,
} from "../../../../../lib/party-courts";

export async function POST(request, { params }) {
  try {
    const user = await requireSessionUser();
    const { partyId } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.switchQueue) {
      await switchQueuedParty(user, partyId);
    } else {
      await joinQueuedParty(user, partyId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
