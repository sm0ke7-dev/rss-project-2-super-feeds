import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type SourceType = "brand" | "authority" | "freshness";

type AddSourceFormState = {
  title: string;
  url: string;
  type: SourceType;
  ttlMinutes: string;
};

const EMPTY_ADD_FORM: AddSourceFormState = {
  title: "",
  url: "",
  type: "freshness",
  ttlMinutes: "60",
};

const TYPE_COLORS: Record<string, string> = {
  brand: "bg-purple-100 text-purple-700",
  authority: "bg-yellow-100 text-yellow-700",
  freshness: "bg-teal-100 text-teal-700",
};

interface LocationServiceDetailPageProps {
  officeId: Id<"offices">;
  locationId: Id<"locations">;
  serviceId: Id<"services">;
  onBack: () => void;
  onBackToLocation: () => void;
  onBackToOffice: () => void;
  onBackToRoot: () => void;
}

export default function LocationServiceDetailPage({
  officeId,
  locationId,
  serviceId,
  onBack,
  onBackToOffice,
  onBackToRoot,
}: LocationServiceDetailPageProps) {
  const offices = useQuery(api.offices.list);
  const locations = useQuery(api.locations.list);
  const services = useQuery(api.services.list);
  const sources = useQuery(api.sources.list);
  const feedRuns = useQuery(api.feedRuns.list);
  const generatedFeeds = useQuery(api.generatedFeeds.list);
  const createSource = useMutation(api.sources.create);
  const removeSource = useMutation(api.sources.remove);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddSourceFormState>(EMPTY_ADD_FORM);

  const office = offices?.find(o => o._id === officeId);
  const location = locations?.find(l => l._id === locationId);
  const service = services?.find(s => s._id === serviceId);

  // Sources scoped specifically to this location+service
  const directSources = sources?.filter(
    s => s.scope === "location-service" &&
      s.locationId === locationId &&
      s.serviceId === serviceId
  ) ?? [];

  // Inherited sources relevant to this service combo
  const inheritedSources = sources?.filter(s => {
    if (s.scope === "global") return true;
    if (s.scope === "service" && s.serviceId === serviceId) return true;
    if (s.scope === "office" && s.officeId === officeId) return true;
    if (s.scope === "office-service" && s.officeId === officeId && s.serviceId === serviceId) return true;
    if (s.scope === "location" && s.locationId === locationId) return true;
    return false;
  }) ?? [];

  const [inheritedExpanded, setInheritedExpanded] = useState(false);

  // Feed runs for this location+service
  const comboRuns = feedRuns?.filter(
    r => r.locationId === locationId && r.serviceId === serviceId
  ) ?? [];

  // Generated feed for this combo
  const generatedFeed = generatedFeeds?.find(
    f => f.locationSlug === location?.slug && f.serviceSlug === service?.slug
  );

  async function handleAddSource() {
    if (!form.title.trim() || !form.url.trim()) return;
    const ttl = parseInt(form.ttlMinutes, 10) || 60;
    await createSource({
      title: form.title,
      url: form.url,
      type: form.type,
      scope: "location-service",
      ttlMinutes: ttl,
      active: true,
      officeId,
      locationId,
      serviceId,
    });
    setShowAddModal(false);
    setForm(EMPTY_ADD_FORM);
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <button onClick={onBackToRoot} className="hover:text-blue-600 transition-colors">
          Dashboard
        </button>
        <span>/</span>
        <button onClick={onBackToOffice} className="hover:text-blue-600 transition-colors">
          {office?.name ?? "Office"}
        </button>
        <span>/</span>
        <button onClick={onBack} className="hover:text-blue-600 transition-colors">
          {location?.name ?? "Location"}
        </button>
        <span>/</span>
        <span className="text-gray-800 font-medium">{service?.name ?? "Loading..."}</span>
      </nav>

      {/* Header */}
      {location && service && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {location.name} — {service.name}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                location-service scoped sources for this combination
              </p>
            </div>
            {generatedFeed && (
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{generatedFeed.itemCount} items</span>
                <a
                  href={`data:text/html;charset=utf-8,${encodeURIComponent(generatedFeed.htmlContent)}`}
                  download={`${generatedFeed.officeSlug}-${generatedFeed.locationSlug}-${generatedFeed.serviceSlug}.html`}
                  className="text-blue-600 hover:underline"
                >
                  HTML
                </a>
                <a
                  href={`data:application/xml;charset=utf-8,${encodeURIComponent(generatedFeed.xmlContent)}`}
                  download={`${generatedFeed.officeSlug}-${generatedFeed.locationSlug}-${generatedFeed.serviceSlug}.xml`}
                  className="text-blue-600 hover:underline"
                >
                  XML
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sources */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-700">
            Location-Service Sources ({directSources.length})
          </h3>
          <button
            onClick={() => { setForm(EMPTY_ADD_FORM); setShowAddModal(true); }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Source
          </button>
        </div>

        {directSources.length === 0 ? (
          <p className="text-gray-400 text-sm">No sources scoped to this location+service yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">TTL</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Last Fetched</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {directSources.map(src => (
                  <tr key={src._id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <a href={src.url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium">
                        {src.title || src.url}
                      </a>
                      {src.lastFetchError && (
                        <p className="text-red-500 text-xs mt-0.5 truncate max-w-xs" title={src.lastFetchError}>
                          {src.lastFetchError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[src.type] ?? ""}`}>
                        {src.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{src.ttlMinutes}m</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {src.lastFetchedAt ? new Date(src.lastFetchedAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => { if (confirm(`Remove "${src.title || src.url}"?`)) removeSource({ id: src._id }); }}
                        className="text-red-400 hover:text-red-600 text-xs transition-colors"
                        title="Remove source"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Inherited sources */}
        <div className="mt-3">
          <button
            onClick={() => setInheritedExpanded(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <span>{inheritedExpanded ? "▾" : "▸"}</span>
            Inherited Sources ({inheritedSources.length})
          </button>
          {inheritedExpanded && (
            inheritedSources.length === 0 ? (
              <p className="text-gray-400 text-sm mt-2 ml-4">No inherited sources.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mt-2">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                      <th className="text-left px-4 py-2 text-gray-600 font-medium">Type</th>
                      <th className="text-left px-4 py-2 text-gray-600 font-medium">Scope</th>
                      <th className="text-left px-4 py-2 text-gray-600 font-medium">TTL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inheritedSources.map(src => (
                      <tr key={src._id} className="border-t border-gray-100 opacity-70">
                        <td className="px-4 py-2">
                          <a href={src.url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium">
                            {src.title || src.url}
                          </a>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[src.type] ?? ""}`}>
                            {src.type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{src.scope}</td>
                        <td className="px-4 py-2 text-gray-500">{src.ttlMinutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Recent Feed Runs */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-700 mb-3">
          Recent Feed Runs ({comboRuns.length})
        </h3>
        {comboRuns.length === 0 ? (
          <p className="text-gray-400 text-sm">No feed runs for this combination yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {comboRuns.slice(0, 10).map(run => (
                  <tr key={run._id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                        run.status === "success" ? "bg-green-100 text-green-700" :
                        run.status === "error" ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{run.itemCount ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Add Source</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Feed title"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">URL</label>
                <input
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as SourceType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="brand">Brand</option>
                  <option value="authority">Authority</option>
                  <option value="freshness">Freshness</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">TTL (minutes)</label>
                <input
                  type="number"
                  value={form.ttlMinutes}
                  onChange={e => setForm({ ...form, ttlMinutes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={1}
                />
              </div>
              <p className="text-xs text-gray-400">
                Scope: <span className="font-medium text-gray-600">location-service</span> — {location?.name} × {service?.name}
              </p>
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => { setShowAddModal(false); setForm(EMPTY_ADD_FORM); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSource}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
