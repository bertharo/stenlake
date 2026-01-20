import { getUserGoal, isStravaConnected, getStravaAuthUrl, syncMockActivities, getUserDistanceUnit } from "@/lib/actions";
import SettingsClient from "./settings-client";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SettingsPage() {
  try {
    const goal = await getUserGoal().catch(() => null);
    const stravaConnected = await isStravaConnected().catch(() => false);
    const distanceUnit = await getUserDistanceUnit().catch(() => "km" as const);
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
        distanceUnit={distanceUnit}
      />
    );
  } catch (error: any) {
    console.error("[SETTINGS] Error loading page:", error);
    // Return error state UI
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-light tracking-tight mb-4">Settings</h1>
          <div className="border border-red-800 rounded-lg p-6 bg-red-900/30">
            <h2 className="text-lg font-medium text-red-300 mb-2">Error Loading Settings</h2>
            <p className="text-sm text-red-400 mb-4">
              {process.env.NODE_ENV === "development" ? error.message : "An error occurred while loading settings."}
            </p>
            <p className="text-xs text-red-500">
              Please check your database connection and try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
