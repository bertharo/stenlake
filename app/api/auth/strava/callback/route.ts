import { NextRequest, NextResponse } from "next/server";
import { handleStravaCallback } from "@/lib/actions";
import { redirect } from "next/navigation";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?error=strava_auth_failed", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no_code", request.url));
  }

  try {
    await handleStravaCallback(code);
    return NextResponse.redirect(new URL("/settings?success=strava_connected", request.url));
  } catch (error) {
    console.error("Strava callback error:", error);
    return NextResponse.redirect(new URL("/settings?error=strava_callback_failed", request.url));
  }
}
