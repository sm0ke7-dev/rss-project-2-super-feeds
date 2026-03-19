import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function ManualTriggerPage() {
  const offices = useQuery(api.offices.list);
  const services = useQuery(api.services.list);

  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const triggerFeed = useMutation(api.mutations.admin.triggerFeed);
  const triggerAll = useMutation(api.mutations.admin.triggerAllFeeds);
  const triggerFullRefresh = useMutation(api.mutations.admin.triggerFullRefresh);

  async function handleTriggerOne() {
    if (!selectedOfficeId || !selectedServiceId) return;
    setStatus("Scheduling…");
    try {
      await triggerFeed({
        officeId: selectedOfficeId as Parameters<typeof triggerFeed>[0]["officeId"],
        serviceId: selectedServiceId as Parameters<typeof triggerFeed>[0]["serviceId"],
      });
      setStatus("Scheduled! Check Feed Runs tab for progress.");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleFullRefresh() {
    setStatus("Scheduling full refresh (ignores TTL)…");
    try {
      await triggerFullRefresh({});
      setStatus("Full refresh scheduled! All sources will be re-fetched regardless of TTL.");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleTriggerAll() {
    setStatus("Scheduling all feeds…");
    try {
      await triggerAll({});
      setStatus("All feeds scheduled! Check Feed Runs tab for progress.");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Manual Trigger</h2>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 max-w-lg">
        <h3 className="font-medium text-gray-800 mb-4">Trigger Single Feed</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Office</label>
            <select
              value={selectedOfficeId}
              onChange={e => setSelectedOfficeId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select office…</option>
              {offices?.map(o => (
                <option key={o._id} value={o._id}>{o.name} ({o.slug})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Service</label>
            <select
              value={selectedServiceId}
              onChange={e => setSelectedServiceId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select service…</option>
              {services?.map(s => (
                <option key={s._id} value={s._id}>{s.name} ({s.slug})</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleTriggerOne}
            disabled={!selectedOfficeId || !selectedServiceId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 rounded transition-colors"
          >
            Trigger Feed
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg">
        <h3 className="font-medium text-gray-800 mb-2">Trigger All Feeds</h3>
        <p className="text-sm text-gray-500 mb-4">Schedules a full aggregation cycle for all active office × service combinations.</p>
        <button
          onClick={handleTriggerAll}
          className="w-full bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium py-2 rounded transition-colors"
        >
          Trigger All Feeds
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg mt-4">
        <h3 className="font-medium text-gray-800 mb-2">Force Full Refresh</h3>
        <p className="text-sm text-gray-500 mb-4">
          Re-fetches ALL sources regardless of TTL. Use to force an immediate update of everything.
        </p>
        <button
          onClick={handleFullRefresh}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2 rounded transition-colors"
        >
          Force Full Refresh
        </button>
      </div>

      {status && (
        <div className="mt-6 max-w-lg bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm text-blue-800">
          {status}
        </div>
      )}
    </div>
  );
}
