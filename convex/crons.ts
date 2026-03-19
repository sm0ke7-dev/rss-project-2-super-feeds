import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every 30 minutes: aggregate stale sources only (TTL-filtered)
crons.interval(
  "aggregate-all-feeds",
  { minutes: 30 },
  internal.actions.aggregation.runAggregationCycle
);

// Daily at 2am UTC: full refresh ignoring TTL
crons.daily(
  "daily-full-refresh",
  { hourUTC: 2, minuteUTC: 0 },
  internal.actions.aggregation.runFullRefresh
);

export default crons;
