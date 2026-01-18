import { Activity } from "@prisma/client";
import mockActivitiesData from "./mockActivities.json";

export interface StravaActivity {
  id: number;
  type?: string; // "Run", "Ride", etc.
  start_date: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
  average_cadence?: number;
  perceived_exertion?: number;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/**
 * Strava OAuth client
 */
export class StravaClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.STRAVA_CLIENT_ID || "";
    this.clientSecret = process.env.STRAVA_CLIENT_SECRET || "";
    this.redirectUri = process.env.STRAVA_REDIRECT_URI || "";
  }

  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret && !!this.redirectUri;
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "activity:read",
      state: state || "",
    });
    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<StravaTokens> {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Strava token exchange failed: ${text}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
  }

  async refreshToken(refreshToken: string): Promise<StravaTokens> {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Strava token refresh failed");
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
  }

  async getActivities(accessToken: string, after?: Date): Promise<StravaActivity[]> {
    const afterUnix = after ? Math.floor(after.getTime() / 1000) : undefined;
    const params = new URLSearchParams({ per_page: "200" });
    if (afterUnix) params.append("after", String(afterUnix));

    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch Strava activities");
    }

    return response.json();
  }
}

/**
 * Mock activities adapter
 */
export class MockActivitiesAdapter {
  async getActivities(userId: string, after?: Date): Promise<Omit<Activity, "id" | "userId" | "createdAt" | "updatedAt">[]> {
    const cutoff = after || new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    return mockActivitiesData
      .filter((mock) => {
        const date = new Date(mock.startDate);
        return date >= cutoff;
      })
      .map((mock) => ({
        stravaId: null,
        startDate: new Date(mock.startDate),
        distanceMeters: mock.distanceMeters,
        movingTimeSeconds: mock.movingTimeSeconds,
        avgHeartRate: mock.avgHeartRate || null,
        elevationGainMeters: mock.elevationGainMeters || null,
        avgCadence: mock.avgCadence || null,
        perceivedEffort: mock.perceivedEffort || null,
        source: "mock" as const,
      }));
  }
}

/**
 * Convert Strava activity to Activity model
 */
export function stravaActivityToActivity(
  userId: string,
  sa: StravaActivity
): Omit<Activity, "id" | "createdAt" | "updatedAt"> {
  return {
    userId,
    stravaId: String(sa.id),
    startDate: new Date(sa.start_date),
    distanceMeters: sa.distance,
    movingTimeSeconds: sa.moving_time,
    avgHeartRate: sa.average_heartrate ? Math.round(sa.average_heartrate) : null,
    elevationGainMeters: sa.total_elevation_gain || null,
    avgCadence: sa.average_cadence || null,
    perceivedEffort: sa.perceived_exertion ? Math.round(sa.perceived_exertion) : null,
    source: "strava",
  };
}
