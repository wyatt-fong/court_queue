import { NextResponse } from "next/server";
import { reconcileAndSaveCourts } from "../../../lib/courts";

export async function GET() {
  try {
    const courts = await reconcileAndSaveCourts();
    return NextResponse.json({ courts });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
