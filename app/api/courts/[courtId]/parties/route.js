import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/auth";
import {
  createQueuedParty,
  fetchQueuedPartiesForCourt,
  switchToNewQueuedParty,
} from "../../../../../lib/party-courts";

export async function GET(_request, { params }) {
  try {
    const user = await requireSessionUser();
    const { courtId } = await params;
    const result = await fetchQueuedPartiesForCourt(user, courtId);

    return NextResponse.json(result);
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 404;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireSessionUser();
    const { courtId } = await params;
    const body = await request.json().catch(() => ({}));
    const party = body.switchQueue
      ? await switchToNewQueuedParty(user, courtId)
      : await createQueuedParty(user, courtId);

    return NextResponse.json({ ok: true, party });
  } catch (error) {
    const status = error.message === "Authentication required." ? 401 : 404;
    return NextResponse.json({ error: error.message }, { status });
  }
}
