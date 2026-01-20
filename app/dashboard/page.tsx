import { getTrainingSignals, getCurrentPlan, getUserGoal, getActivities, getUserDistanceUnit } from "@/lib/actions";
import { computeSignals } from "@/lib/training";
import DashboardClient from "./dashboard-client";

// Force dynamic rendering - dashboard requires database access
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const activities = await getActivities(30);
  const signals = computeSignals(activities);
  const plan = await getCurrentPlan();
  const goal = await getUserGoal();
  const distanceUnit = await getUserDistanceUnit();

  return <DashboardClient signals={signals} plan={plan} goal={goal} activities={activities} distanceUnit={distanceUnit} />;
}
