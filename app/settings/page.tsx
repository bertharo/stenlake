import { getUserGoal, isStravaConnected, getStravaAuthUrl, syncMockActivities } from "@/lib/actions";
import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const goal = await getUserGoal();
  const stravaConnected = await isStravaConnected();
  let stravaAuthUrl: string | null = null;

  try {
    stravaAuthUrl = await getStravaAuthUrl();
  } catch (error) {
    // Strava not configured - this is expected if env vars aren't set
    console.log("Strava not configured:", error);
  }

  return (
    <SettingsClient
      goal={goal}
      stravaConnected={stravaConnected}
      stravaAuthUrl={stravaAuthUrl}
    />
  );
}
