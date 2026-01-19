import { NextResponse } from "next/server";
import { StravaClient } from "@/lib/strava";

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = new StravaClient();
  
  const debug = {
    clientId: client['clientId'] || 'NOT SET',
    clientSecret: client['clientSecret'] ? 'SET (hidden)' : 'NOT SET',
    redirectUri: client['redirectUri'] || 'NOT SET',
    redirectUriLength: client['redirectUri']?.length || 0,
    redirectUriBytes: client['redirectUri'] ? Array.from(client['redirectUri']).map(c => c.charCodeAt(0)) : [],
    isConfigured: client.isConfigured(),
    authUrl: client.isConfigured() ? client.getAuthorizationUrl() : 'NOT CONFIGURED',
  };

  return NextResponse.json(debug, { status: 200 });
}
