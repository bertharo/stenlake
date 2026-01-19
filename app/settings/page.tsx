import { getUserGoal, isStravaConnected, getStravaAuthUrl, syncMockActivities } from "@/lib/actions";
import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const goal = await getUserGoal();
  const stravaConnected = await isStravaConnected();
  let stravaAuthUrl: string | null = null;

  try {
    stravaAuthUrl = await getStravaAuthUrl();
  } catch {
    // Strava not configured
  }

  return (
    <SettingsClient
      goal={goal}
      stravaConnected={stravaConnected}
      stravaAuthUrl={stravaAuthUrl}
    />
  );
}
