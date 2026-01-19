import { getUserGoal, isStravaConnected, getStravaAuthUrl, syncMockActivities } from "@/lib/actions";
import SettingsClient from "./settings-client";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  try {
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
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";
    
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-light mb-4">Database Connection Error</h1>
          <div className="border border-red-800 rounded-lg p-6 bg-[#0f0f0f] mb-4">
            <p className="text-red-400 mb-2">Unable to connect to the database.</p>
            <p className="text-sm text-gray-400 mb-4">{errorMessage}</p>
            <div className="text-sm text-gray-500 space-y-2">
              <p><strong>Possible issues:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>DATABASE_URL environment variable is not set in Vercel</li>
                <li>Database tables haven&apos;t been created (run: npx prisma db push)</li>
                <li>Database connection is invalid or unreachable</li>
              </ul>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-sm text-gray-500 mb-2"><strong>Fix steps:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-400 ml-4">
                <li>Check <code className="bg-gray-900 px-2 py-1 rounded">/api/health</code> endpoint for detailed diagnostics</li>
                <li>Ensure DATABASE_URL is set in Vercel environment variables</li>
                <li>Run database migrations: <code className="bg-gray-900 px-2 py-1 rounded">npx prisma db push</code></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
