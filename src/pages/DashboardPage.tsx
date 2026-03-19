import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Badge from "../components/Badge";

export default function DashboardPage() {
  const feedRuns = useQuery(api.feedRuns.list);
  const generatedFeeds = useQuery(api.generatedFeeds.list);

  // Build a map of latest run per office+service
  const latestRuns = new Map<string, NonNullable<typeof feedRuns>[0]>();
  if (feedRuns) {
    for (const run of feedRuns) {
      const key = `${run.officeId}:${run.serviceId}`;
      if (!latestRuns.has(key)) latestRuns.set(key, run);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Dashboard</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Generated Feeds</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{generatedFeeds?.length ?? "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Runs</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{feedRuns?.length ?? "—"}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Errors (latest)</p>
          <p className="text-3xl font-bold text-red-600 mt-1">
            {feedRuns ? [...latestRuns.values()].filter(r => r.status === "error").length : "—"}
          </p>
        </div>
      </div>

      <h3 className="text-base font-semibold text-gray-700 mb-3">Recent Feed Runs</h3>
      {!feedRuns ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : feedRuns.length === 0 ? (
        <p className="text-gray-400 text-sm">No runs yet. Use Manual Trigger to start.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Office ID</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Service ID</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {feedRuns.slice(0, 20).map(run => (
                <tr key={run._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{run.officeId.slice(-8)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{run.serviceId.slice(-8)}</td>
                  <td className="px-4 py-2"><Badge status={run.status} /></td>
                  <td className="px-4 py-2 text-gray-700">{run.itemCount ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{new Date(run.startedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
