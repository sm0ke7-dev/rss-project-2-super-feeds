import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type SourceType = "brand" | "authority" | "freshness";
type SourceScope = "global" | "service" | "office" | "office-service";

type Source = {
  _id: Id<"sources">;
  url: string;
  title: string;
  type: SourceType;
  scope: SourceScope;
  officeId?: Id<"offices">;
  serviceId?: Id<"services">;
  ttlMinutes: number;
  active: boolean;
  lastFetchedAt?: number;
  lastFetchError?: string;
};

type FormState = {
  title: string;
  url: string;
  type: SourceType;
  scope: SourceScope;
  ttlMinutes: string;
  active: boolean;
  officeId: string;
  serviceId: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  url: "",
  type: "freshness",
  scope: "global",
  ttlMinutes: "60",
  active: true,
  officeId: "",
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
};

export default function SourcesPage() {
  const sources = useQuery(api.sources.list);
  const offices = useQuery(api.offices.list);
  const services = useQuery(api.services.list);
  const createSource = useMutation(api.sources.create);
  const updateSource = useMutation(api.sources.update);
  const removeSource = useMutation(api.sources.remove);

  const [modal, setModal] = useState<{ mode: "add" | "edit"; source?: Source } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal({ mode: "add" });
  }

  function openEdit(source: Source) {
    setForm({
      title: source.title,
      url: source.url,
      type: source.type,
      scope: source.scope,
      ttlMinutes: String(source.ttlMinutes),
      active: source.active,
      officeId: source.officeId ?? "",
      serviceId: source.serviceId ?? "",
    });
    setModal({ mode: "edit", source });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.url.trim()) return;
    const ttl = parseInt(form.ttlMinutes, 10) || 60;
    const officeId = form.officeId.trim() || undefined;
    const serviceId = form.serviceId.trim() || undefined;

    if (modal?.mode === "add") {
      await createSource({
        title: form.title,
        url: form.url,
        type: form.type,
        scope: form.scope,
        ttlMinutes: ttl,
        active: form.active,
        officeId: officeId as Id<"offices"> | undefined,
        serviceId: serviceId as Id<"services"> | undefined,
      });
    } else if (modal?.mode === "edit" && modal.source) {
      await updateSource({
        id: modal.source._id,
        title: form.title,
        url: form.url,
        type: form.type,
        scope: form.scope,
        ttlMinutes: ttl,
        active: form.active,
        officeId: officeId as Id<"offices"> | undefined,
        serviceId: serviceId as Id<"services"> | undefined,
      });
    }
    closeModal();
  }

  async function handleDelete(id: Id<"sources">) {
    if (!confirm("Delete this source? This cannot be undone.")) return;
    await removeSource({ id });
  }

  async function toggleActive(source: Source) {
    await updateSource({
      id: source._id,
      title: source.title,
      url: source.url,
      type: source.type,
      scope: source.scope,
      ttlMinutes: source.ttlMinutes,
      active: !source.active,
      officeId: source.officeId,
      serviceId: source.serviceId,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Sources ({sources?.length ?? "…"})</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Source
        </button>
      </div>

      {!sources ? (
        <p className="text-gray-400 text-sm">Loading...</p>
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
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Active</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(source => (
                <tr key={source._id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {source.title}
                    </a>
                    {source.lastFetchError && (
                      <p className="text-red-500 text-xs mt-0.5 truncate max-w-xs" title={source.lastFetchError}>
                        ⚠ {source.lastFetchError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[source.type] ?? ""}`}>
                      {source.type}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS[source.scope] ?? ""}`}>
                      {source.scope}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{source.ttlMinutes}m</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {source.lastFetchedAt ? new Date(source.lastFetchedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(source)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${source.active ? "bg-green-500" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${source.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <button
                      onClick={() => openEdit(source)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(source._id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === "add" ? "Add Source" : "Edit Source"}
            </h3>

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
                  <option value="global">Global</option>
                  <option value="service">Service</option>
                  <option value="office">Office</option>
                  <option value="office-service">Office-Service</option>
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
              {(form.scope === "office" || form.scope === "office-service") && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Office</label>
                  <select
                    value={form.officeId}
                    onChange={e => setForm({ ...form, officeId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an office...</option>
                    {offices?.map(o => (
                      <option key={o._id} value={o._id}>{o.name} ({o.city}, {o.state})</option>
                    ))}
                  </select>
                </div>
              )}
              {(form.scope === "service" || form.scope === "office-service") && (
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
              <div className="flex items-center gap-2">
                <input
                  id="source-active"
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="source-active" className="text-sm text-gray-600">Active</label>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
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
