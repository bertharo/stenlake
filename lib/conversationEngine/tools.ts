/**
 * Tool Definitions for Agent Loop
 * 
 * Tools the model can call to access data and update memory.
 */

import { prisma } from "../prisma";
import { getActivities, getUserGoal, getCurrentPlan } from "../actions";
import { computeSignals } from "../training";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "../units";
import { updateMemory, ConversationMemory } from "./memory";

/**
 * Tool Definition
 */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; required?: boolean }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

export const TOOLS: Tool[] = [
  {
    name: "get_recent_strava_runs",
    description: "Get recent Strava runs. Returns formatted summaries of the most recent runs.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default: 7)",
        },
      },
    },
  },
  {
    name: "get_training_load",
    description: "Get current training load metrics including weekly mileage, fatigue signals, and intensity distribution.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_upcoming_race",
    description: "Get upcoming race goal details including race name, date, target time, and days remaining.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_memory",
    description: "Update conversation memory with new information. Use this to remember user preferences, context, or constraints.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Memory key: 'profile', 'context', or 'baselines'",
        },
        value: {
          type: "object",
          description: "Object with fields to update in the specified memory section",
        },
      },
      required: ["key", "value"],
    },
  },
];

/**
 * Execute tool call
 */
export async function executeTool(
  toolCall: ToolCall,
  userId: string,
  distanceUnit: DistanceUnit,
  memory: ConversationMemory | null
): Promise<ToolResult> {
  try {
    switch (toolCall.name) {
      case "get_recent_strava_runs": {
        const days = toolCall.arguments.days || 7;
        const activities = await getActivities(days);
        
        if (activities.length === 0) {
          return {
            tool_call_id: toolCall.id,
            content: "No recent runs found.",
          };
        }

        const summaries = activities.slice(0, 5).map((activity) => {
          const distance = formatDistance(activity.distanceMeters, distanceUnit);
          const pace = activity.avgHeartRate
            ? formatPace(activity.distanceMeters / activity.movingTimeSeconds, distanceUnit)
            : "N/A";
          const daysAgo = Math.floor((Date.now() - activity.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const dateLabel = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`;
          
          return `${dateLabel}: ${distance} at ${pace}${activity.avgHeartRate ? ` (HR: ${activity.avgHeartRate})` : ""}`;
        });

        return {
          tool_call_id: toolCall.id,
          content: `Recent runs:\n${summaries.join("\n")}`,
        };
      }

      case "get_training_load": {
        const activities = await getActivities(30);
        const signals = computeSignals(activities);
        
        const weeklyMileage = signals.weeklyMileage.length > 0
          ? signals.weeklyMileage[signals.weeklyMileage.length - 1]
          : null;

        const load = weeklyMileage
          ? metersToUnit(weeklyMileage.mileageKm * 1000, distanceUnit).toFixed(1)
          : "0";

        const intensity = signals.intensityDistribution;

        return {
          tool_call_id: toolCall.id,
          content: `Training load: ${load} ${distanceUnit === "mi" ? "mi" : "km"}/week. Intensity: ${intensity.easy}% easy, ${intensity.moderate}% moderate, ${intensity.hard}% hard. Fatigue risk: ${signals.fatigueRisk ? "Yes" : "No"}`,
        };
      }

      case "get_upcoming_race": {
        const goal = await getUserGoal();
        
        if (!goal) {
          return {
            tool_call_id: toolCall.id,
            content: "No upcoming race goal set.",
          };
        }

        const raceDistance = formatDistance(goal.distance, distanceUnit);
        const daysUntil = Math.ceil((goal.raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const hours = Math.floor(goal.targetTimeSeconds / 3600);
        const minutes = Math.floor((goal.targetTimeSeconds % 3600) / 60);
        const targetTime = `${hours}:${String(minutes).padStart(2, "0")}`;

        return {
          tool_call_id: toolCall.id,
          content: `Upcoming race: ${raceDistance} on ${goal.raceDate.toLocaleDateString()} (${daysUntil} days away). Target time: ${targetTime}`,
        };
      }

      case "update_memory": {
        const { key, value } = toolCall.arguments;
        
        if (!["profile", "context", "baselines"].includes(key)) {
          return {
            tool_call_id: toolCall.id,
            content: `Invalid memory key: ${key}. Must be 'profile', 'context', or 'baselines'.`,
            error: "Invalid key",
          };
        }

        await updateMemory(userId, { [key]: value });

        return {
          tool_call_id: toolCall.id,
          content: `Memory updated: ${key}`,
        };
      }

      default:
        return {
          tool_call_id: toolCall.id,
          content: `Unknown tool: ${toolCall.name}`,
          error: "Unknown tool",
        };
    }
  } catch (error: any) {
    return {
      tool_call_id: toolCall.id,
      content: `Error: ${error.message}`,
      error: error.message,
    };
  }
}
