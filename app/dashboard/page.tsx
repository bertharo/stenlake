import { getTrainingSignals, getCurrentPlan, getUserGoal, getActivities, getUserDistanceUnit } from "@/lib/actions";
import { computeSignals } from "@/lib/training";
import DashboardClient from "./dashboard-client";

// Force dynamic rendering - dashboard requires database access
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  try {
    const activities = await getActivities(30).catch(() => []);
    const signals = computeSignals(activities);
    const plan = await getCurrentPlan().catch(() => null);
    const goal = await getUserGoal().catch(() => null);
    const distanceUnit = await getUserDistanceUnit().catch(() => "km" as const);

    return <DashboardClient signals={signals} plan={plan} goal={goal} activities={activities} distanceUnit={distanceUnit} />;
  } catch (error: any) {
    console.error("[DASHBOARD] Error loading page:", error);
    // Return error state UI
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-light tracking-tight mb-4">Dashboard</h1>
          <div className="border border-red-800 rounded-lg p-6 bg-red-900/30">
            <h2 className="text-lg font-medium text-red-300 mb-2">Error Loading Dashboard</h2>
            <p className="text-sm text-red-400 mb-4">
              {process.env.NODE_ENV === "development" ? error.message : "An error occurred while loading the dashboard."}
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
