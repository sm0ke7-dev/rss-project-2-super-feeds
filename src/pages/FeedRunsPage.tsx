import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Badge from "../components/Badge";

export default function FeedRunsPage() {
  const runs = useQuery(api.feedRuns.list);
  const offices = useQuery(api.offices.list);
  const services = useQuery(api.services.list);
  const locations = useQuery(api.locations.list);
  const clearAll = useMutation(api.feedRuns.clearAll);

  const officeNames = new Map<string, string>();
  const serviceNames = new Map<string, string>();
  const locationNames = new Map<string, string>();
  if (offices) for (const o of offices) officeNames.set(o._id, o.name);
  if (services) for (const s of services) serviceNames.set(s._id, s.name);
  if (locations) for (const l of locations) locationNames.set(l._id, l.name);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Feed Runs</h2>
          <p className="text-sm text-gray-500 mt-1">Updates in real-time via Convex reactive queries.</p>
        </div>
        {runs && runs.length > 0 && (
          <button
            onClick={() => { if (confirm(`Clear all ${runs.length} run logs?`)) clearAll(); }}
            className="px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            Clear Logs
          </button>
        )}
      </div>
      {!runs ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : runs.length === 0 ? (
        <p className="text-gray-400 text-sm">No runs yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Office</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Location</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Service</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Started</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Completed</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{officeNames.get(run.officeId) ?? run.officeId.slice(-8)}</td>
                  <td className="px-4 py-2 text-gray-900">{run.locationId ? (locationNames.get(run.locationId) ?? run.locationId.slice(-8)) : "—"}</td>
                  <td className="px-4 py-2 text-gray-900">{serviceNames.get(run.serviceId) ?? run.serviceId.slice(-8)}</td>
                  <td className="px-4 py-2"><Badge status={run.status} /></td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(run.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{run.itemCount ?? "—"}</td>
                  <td className="px-4 py-2 text-red-500 text-xs max-w-xs truncate" title={run.error}>
                    {run.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
