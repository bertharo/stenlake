"use client";

import { Goal } from "@prisma/client";
import { useState } from "react";
import { setUserGoal, syncMockActivities } from "@/lib/actions";
import { useRouter } from "next/navigation";

interface SettingsClientProps {
  goal: Goal | null;
  stravaConnected: boolean;
  stravaAuthUrl: string | null;
}

export default function SettingsClient({ goal, stravaConnected, stravaAuthUrl }: SettingsClientProps) {
  const router = useRouter();
  const [distance, setDistance] = useState(goal ? (goal.distance / 1000).toString() : "42.2");
  const [hours, setHours] = useState(goal ? Math.floor(goal.targetTimeSeconds / 3600).toString() : "3");
  const [minutes, setMinutes] = useState(goal ? Math.floor((goal.targetTimeSeconds % 3600) / 60).toString() : "30");
  const [raceDate, setRaceDate] = useState(goal ? goal.raceDate.toISOString().split("T")[0] : "");
  const [loading, setLoading] = useState(false);

  const handleSetGoal = async () => {
    setLoading(true);
    try {
      const targetTimeSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60;
      await setUserGoal(parseFloat(distance) * 1000, targetTimeSeconds, new Date(raceDate));
      router.refresh();
      alert("Goal saved");
    } catch (error) {
      console.error("Failed to set goal:", error);
      alert("Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncMock = async () => {
    setLoading(true);
    try {
      await syncMockActivities();
      router.refresh();
      alert("Mock activities synced");
    } catch (error) {
      console.error("Failed to sync:", error);
      alert("Failed to sync activities");
    } finally {
      setLoading(false);
    }
  };

  const handleStravaConnect = () => {
    if (stravaAuthUrl) {
      window.location.href = stravaAuthUrl;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-light tracking-tight mb-8">Settings</h1>

        {/* Goal Section */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f] mb-6">
          <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-4">Race Goal</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Distance (km)</label>
              <input
                type="number"
                step="0.1"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-gray-700"
                placeholder="42.2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Target Time (hours)</label>
                <input
                  type="number"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-gray-700"
                  placeholder="3"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Minutes</label>
                <input
                  type="number"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-gray-700"
                  placeholder="30"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Race Date</label>
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-gray-700"
              />
            </div>

            <button
              onClick={handleSetGoal}
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              Save Goal
            </button>
          </div>
        </div>

        {/* Data Source Section */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f] mb-6">
          <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-4">Data Source</h2>
          
          <div className="space-y-4">
            {/* Strava */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium mb-1">Strava</div>
                <div className="text-xs text-gray-500">
                  {stravaConnected ? "Connected" : "Not connected"}
                </div>
              </div>
              <button
                onClick={handleStravaConnect}
                disabled={!stravaAuthUrl || loading}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors disabled:opacity-50"
              >
                {stravaConnected ? "Reconnect" : "Connect"}
              </button>
            </div>

            {/* Mock Data */}
            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium mb-1">Mock Data</div>
                  <div className="text-xs text-gray-500">Use sample running data for testing</div>
                </div>
                <button
                  onClick={handleSyncMock}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors disabled:opacity-50"
                >
                  Sync Mock Data
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
