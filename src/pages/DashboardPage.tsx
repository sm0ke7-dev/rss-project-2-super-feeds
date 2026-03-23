import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface DashboardPageProps {
  onSelectOffice: (officeId: Id<"offices">) => void;
}

export default function DashboardPage({ onSelectOffice }: DashboardPageProps) {
  const offices = useQuery(api.offices.list);
  const locations = useQuery(api.locations.list);
  const feedRuns = useQuery(api.feedRuns.list);
  const generatedFeeds = useQuery(api.generatedFeeds.list);

  // Count locations per office
  const locationCountByOffice = new Map<string, number>();
  if (locations) {
    for (const loc of locations) {
      locationCountByOffice.set(loc.officeId, (locationCountByOffice.get(loc.officeId) ?? 0) + 1);
    }
  }

  // Count active feed runs per office (latest run per office+service combo)
  const latestRunByKey = new Map<string, NonNullable<typeof feedRuns>[0]>();
  if (feedRuns) {
    for (const run of feedRuns) {
      const key = `${run.officeId}:${run.serviceId}`;
      if (!latestRunByKey.has(key)) latestRunByKey.set(key, run);
    }
  }

  const activeFeedsByOffice = new Map<string, number>();
  for (const [, run] of latestRunByKey) {
    if (run.status === "success") {
      activeFeedsByOffice.set(run.officeId, (activeFeedsByOffice.get(run.officeId) ?? 0) + 1);
    }
  }

  // Top stats
  const totalFeeds = generatedFeeds?.length ?? 0;
  const totalRuns = feedRuns?.length ?? 0;
  const totalErrors = feedRuns ? [...latestRunByKey.values()].filter(r => r.status === "error").length : 0;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Generated Feeds</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{generatedFeeds ? totalFeeds : "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Runs</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{feedRuns ? totalRuns : "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Errors (latest)</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{feedRuns ? totalErrors : "—"}</p>
        </div>
      </div>

      {/* Office project cards */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Offices</h2>

      {!offices ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : offices.length === 0 ? (
        <p className="text-gray-400 text-sm">No offices yet. Add one in the Offices tab.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {offices.map(office => {
            const locationCount = locationCountByOffice.get(office._id) ?? 0;
            const activeFeeds = activeFeedsByOffice.get(office._id) ?? 0;

            return (
              <button
                key={office._id}
                onClick={() => onSelectOffice(office._id)}
                className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900 leading-tight">{office.name}</h3>
                  <span
                    className={`ml-2 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      office.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {office.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {office.city}, {office.state}
                </p>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>
                    <span className="font-semibold text-gray-700">{locationCount}</span>{" "}
                    {locationCount === 1 ? "location" : "locations"}
                  </span>
                  <span>
                    <span className="font-semibold text-gray-700">{activeFeeds}</span>{" "}
                    active {activeFeeds === 1 ? "feed" : "feeds"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
