import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function ManualTriggerPage() {
  const offices = useQuery(api.offices.list);
  const services = useQuery(api.services.list);
  const locations = useQuery(api.locations.list);

  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const triggerFeed = useMutation(api.mutations.admin.triggerFeed);
  const triggerAll = useMutation(api.mutations.admin.triggerAllFeeds);
  const triggerFullRefresh = useMutation(api.mutations.admin.triggerFullRefresh);
  const triggerBackfill = useMutation(api.mutations.admin.triggerBackfillScoring);
  const cancelRun = useMutation(api.mutations.admin.cancelFeedRun);
  const triggerRegenerateOnly = useMutation(api.mutations.admin.triggerRegenerateOnly);

  const runningRun = useQuery(
    api.feedRuns.getRunningForCombo,
    selectedLocationId && selectedServiceId
      ? {
          locationId: selectedLocationId as Id<"locations">,
          serviceId: selectedServiceId as Id<"services">,
        }
      : "skip"
  );

  async function handleTriggerOne() {
    if (!selectedOfficeId || !selectedLocationId || !selectedServiceId) return;
    setStatus("Scheduling…");
    try {
      await triggerFeed({
        officeId: selectedOfficeId as Parameters<typeof triggerFeed>[0]["officeId"],
        locationId: selectedLocationId as Parameters<typeof triggerFeed>[0]["locationId"],
        serviceId: selectedServiceId as Parameters<typeof triggerFeed>[0]["serviceId"],
      });
      setStatus("Scheduled! Check Feed Runs tab for progress.");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleRegenerateOnly() {
    if (!selectedOfficeId || !selectedLocationId || !selectedServiceId) return;
    setStatus("Regenerating feed (skipping fetch/extract/score)…");
    try {
      await triggerRegenerateOnly({
        officeId: selectedOfficeId as Parameters<typeof triggerRegenerateOnly>[0]["officeId"],
        locationId: selectedLocationId as Parameters<typeof triggerRegenerateOnly>[0]["locationId"],
        serviceId: selectedServiceId as Parameters<typeof triggerRegenerateOnly>[0]["serviceId"],
      });
      setStatus("Regeneration scheduled! Should complete in seconds.");
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
              onChange={e => { setSelectedOfficeId(e.target.value); setSelectedLocationId(""); }}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select office…</option>
              {offices?.map(o => (
                <option key={o._id} value={o._id}>{o.name} ({o.slug})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Location</label>
            <select
              value={selectedLocationId}
              onChange={e => setSelectedLocationId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select location…</option>
              {locations?.filter(l => l.officeId === selectedOfficeId).map(l => (
                <option key={l._id} value={l._id}>{l.name} ({l.slug})</option>
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
          {runningRun ? (
            <div className="space-y-2">
              <div className="w-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium py-2 rounded text-center">
                ⏳ Feed run in progress…
              </div>
              <button
                onClick={async () => {
                  try {
                    await cancelRun({ runId: runningRun._id });
                    setStatus("Run cancelled.");
                  } catch (e) {
                    setStatus(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Cancel Run
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleTriggerOne}
                disabled={!selectedOfficeId || !selectedLocationId || !selectedServiceId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Trigger Feed
              </button>
              <button
                onClick={handleRegenerateOnly}
                disabled={!selectedOfficeId || !selectedLocationId || !selectedServiceId}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 rounded transition-colors"
              >
                Regenerate Only (Fast)
              </button>
              <p className="text-xs text-gray-400">Regenerate rebuilds HTML/RSS from existing data — skips fetch, extract, and scoring.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg">
        <h3 className="font-medium text-gray-800 mb-2">Trigger All Feeds</h3>
        <p className="text-sm text-gray-500 mb-4">Schedules a full aggregation cycle for all active location × service combinations.</p>
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

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-lg mt-4">
        <h3 className="font-medium text-gray-800 mb-2">Backfill Relevance Scores</h3>
        <p className="text-sm text-gray-500 mb-4">
          Score all existing unscored feed items using GPT-4o-mini. Processes items in batches of 10 until all are scored.
        </p>
        <button
          onClick={async () => {
            setStatus("Scheduling relevance score backfill…");
            try {
              await triggerBackfill({});
              setStatus("Backfill scheduled! Check Convex logs for progress.");
            } catch (e) {
              setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 rounded transition-colors"
        >
          Backfill Relevance Scores
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
