import { NextResponse } from "next/server";
import { reconcileAndSaveCourts } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";

export async function GET() {
  try {
    await requireSessionUser();
    const courts = await reconcileAndSaveCourts();
    return NextResponse.json({ courts });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
