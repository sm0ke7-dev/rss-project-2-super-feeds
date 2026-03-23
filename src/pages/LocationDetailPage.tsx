import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import Badge from "../components/Badge";

type SourceType = "brand" | "authority" | "freshness";
type SourceScope = "global" | "service" | "office" | "office-service" | "location" | "location-service";

type AddSourceFormState = {
  title: string;
  url: string;
  type: SourceType;
  scope: SourceScope;
  ttlMinutes: string;
  serviceId: string;
};

const EMPTY_ADD_FORM: AddSourceFormState = {
  title: "",
  url: "",
  type: "freshness",
  scope: "location",
  ttlMinutes: "60",
  serviceId: "",
};

const TYPE_COLORS: Record<string, string> = {
  brand: "bg-purple-100 text-purple-700",
  authority: "bg-yellow-100 text-yellow-700",
  freshness: "bg-teal-100 text-teal-700",
};

const SCOPE_COLORS: Record<string, string> = {
  global: "bg-blue-100 text-blue-700",
  service: "bg-indigo-100 text-indigo-700",
  office: "bg-orange-100 text-orange-700",
  "office-service": "bg-pink-100 text-pink-700",
  location: "bg-emerald-100 text-emerald-700",
  "location-service": "bg-rose-100 text-rose-700",
};

interface LocationDetailPageProps {
  officeId: Id<"offices">;
  locationId: Id<"locations">;
  onBack: () => void;
  onBackToRoot: () => void;
}

export default function LocationDetailPage({
  officeId,
  locationId,
  onBack,
  onBackToRoot,
}: LocationDetailPageProps) {
  const offices = useQuery(api.offices.list);
  const locations = useQuery(api.locations.list);
  const sources = useQuery(api.sources.list);
  const feedRuns = useQuery(api.feedRuns.list);
  const generatedFeeds = useQuery(api.generatedFeeds.list);
  const services = useQuery(api.services.list);
  const createSource = useMutation(api.sources.create);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddSourceFormState>(EMPTY_ADD_FORM);
  const [inheritedExpanded, setInheritedExpanded] = useState(false);

  const office = offices?.find(o => o._id === officeId);
  const location = locations?.find(l => l._id === locationId);

  // Sources directly scoped to this location
  const directSources = sources?.filter(
    s =>
      (s.scope === "location" || s.scope === "location-service") &&
      s.locationId === locationId
  ) ?? [];

  // Inherited sources (global, service, office, office-service)
  const inheritedSources = sources?.filter(s => {
    if (s.scope === "global") return true;
    if (s.scope === "service") return true;
    if (s.scope === "office" && s.officeId === officeId) return true;
    if (s.scope === "office-service" && s.officeId === officeId) return true;
    return false;
  }) ?? [];

  // Feed runs for this location
  const locationRuns = feedRuns?.filter(r => r.locationId === locationId) ?? [];

  // Generated feeds for this location's slug
  const locationGeneratedFeeds = generatedFeeds?.filter(
    f => f.locationSlug === location?.slug
  ) ?? [];

  const serviceNames = new Map<string, string>();
  if (services) for (const s of services) serviceNames.set(s._id, s.name);

  async function handleAddSource() {
    if (!form.title.trim() || !form.url.trim()) return;
    const ttl = parseInt(form.ttlMinutes, 10) || 60;
    const serviceId = form.serviceId.trim() || undefined;
    await createSource({
      title: form.title,
      url: form.url,
      type: form.type,
      scope: form.scope,
      ttlMinutes: ttl,
      active: true,
      officeId,
      locationId,
      serviceId: serviceId as Id<"services"> | undefined,
    });
    setShowAddModal(false);
    setForm(EMPTY_ADD_FORM);
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={onBackToRoot} className="hover:text-blue-600 transition-colors">
          Dashboard
        </button>
        <span>/</span>
        <button onClick={onBack} className="hover:text-blue-600 transition-colors">
          {office?.name ?? "Office"}
        </button>
        <span>/</span>
        <span className="text-gray-800 font-medium">{location?.name ?? "Loading..."}</span>
      </nav>

      {/* Location info header */}
      {location && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{location.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Slug: <span className="font-mono text-xs">{location.slug}</span>
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                location.active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {location.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      )}

      {/* ── Section 1: Sources ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-700">
            Sources ({directSources.length})
          </h3>
          <button
            onClick={() => {
              setForm(EMPTY_ADD_FORM);
              setShowAddModal(true);
            }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Source
          </button>
        </div>

        {directSources.length === 0 ? (
          <p className="text-gray-400 text-sm">No location-scoped sources yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Type</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Scope</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">TTL</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Last Fetched</th>
                </tr>
              </thead>
              <tbody>
                {directSources.map(src => (
                  <tr key={src._id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {src.title}
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
                    <td className="px-4 py-2">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS[src.scope] ?? ""}`}>
                        {src.scope}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{src.ttlMinutes}m</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {src.lastFetchedAt ? new Date(src.lastFetchedAt).toLocaleString() : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Inherited sources (collapsible) */}
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
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {src.title}
                          </a>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[src.type] ?? ""}`}>
                            {src.type}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS[src.scope] ?? ""}`}>
                            {src.scope}
                          </span>
                        </td>
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

      {/* ── Section 2: Recent Feed Runs ── */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-700 mb-3">
          Recent Feed Runs ({locationRuns.length})
        </h3>

        {locationRuns.length === 0 ? (
          <p className="text-gray-400 text-sm">No feed runs for this location yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Service</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {locationRuns.slice(0, 20).map(run => (
                  <tr key={run._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-900">
                      {serviceNames.get(run.serviceId) ?? run.serviceId.slice(-8)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge status={run.status} />
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

      {/* ── Section 3: Generated Feeds ── */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-700 mb-3">
          Generated Feeds ({locationGeneratedFeeds.length})
        </h3>

        {locationGeneratedFeeds.length === 0 ? (
          <p className="text-gray-400 text-sm">No generated feeds for this location yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Office / Location / Service</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Generated</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {locationGeneratedFeeds.map(feed => (
                  <tr key={feed._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">
                      {feed.officeSlug} / {feed.locationSlug ?? "—"} / {feed.serviceSlug}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{feed.itemCount}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(feed.generatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 flex items-center gap-2">
                      <a
                        href={`data:application/xml;charset=utf-8,${encodeURIComponent(feed.xmlContent)}`}
                        download={`${feed.officeSlug}-${feed.locationSlug ?? "global"}-${feed.serviceSlug}.xml`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        XML
                      </a>
                      <a
                        href={`data:text/html;charset=utf-8,${encodeURIComponent(feed.htmlContent)}`}
                        download={`${feed.officeSlug}-${feed.locationSlug ?? "global"}-${feed.serviceSlug}.html`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        HTML
                      </a>
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
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
                <label className="block text-sm text-gray-600 mb-1">Scope</label>
                <select
                  value={form.scope}
                  onChange={e => setForm({ ...form, scope: e.target.value as SourceScope })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="location">Location</option>
                  <option value="location-service">Location-Service</option>
                </select>
              </div>
              {form.scope === "location-service" && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Service</label>
                  <select
                    value={form.serviceId}
                    onChange={e => setForm({ ...form, serviceId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a service...</option>
                    {services?.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
                Source will be scoped to: <span className="font-medium text-gray-600">{location?.name}</span> (this location)
              </p>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setForm(EMPTY_ADD_FORM);
                }}
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
