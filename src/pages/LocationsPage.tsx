import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Location = {
  _id: Id<"locations">;
  name: string;
  slug: string;
  officeId: Id<"offices">;
  active: boolean;
};

type FormState = {
  name: string;
  slug: string;
  officeId: string;
  active: boolean;
};

const EMPTY_FORM: FormState = { name: "", slug: "", officeId: "", active: true };

export default function LocationsPage() {
  const locations = useQuery(api.locations.list);
  const offices = useQuery(api.offices.list);
  const createLocation = useMutation(api.locations.create);
  const updateLocation = useMutation(api.locations.update);
  const removeLocation = useMutation(api.locations.remove);

  const officeNames = new Map<string, string>();
  if (offices) for (const o of offices) officeNames.set(o._id, o.name);

  const [modal, setModal] = useState<{ mode: "add" | "edit"; location?: Location } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal({ mode: "add" });
  }

  function openEdit(location: Location) {
    setForm({ name: location.name, slug: location.slug, officeId: location.officeId, active: location.active });
    setModal({ mode: "edit", location });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.slug.trim() || !form.officeId.trim()) return;
    if (modal?.mode === "add") {
      await createLocation({
        name: form.name,
        slug: form.slug,
        officeId: form.officeId as Id<"offices">,
      });
    } else if (modal?.mode === "edit" && modal.location) {
      await updateLocation({
        id: modal.location._id,
        name: form.name,
        slug: form.slug,
        officeId: form.officeId as Id<"offices">,
        active: form.active,
      });
    }
    closeModal();
  }

  async function handleDelete(id: Id<"locations">) {
    if (!confirm("Delete this location? This cannot be undone.")) return;
    await removeLocation({ id });
  }

  async function toggleActive(location: Location) {
    await updateLocation({
      id: location._id,
      name: location.name,
      slug: location.slug,
      officeId: location.officeId,
      active: !location.active,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Locations</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Location
        </button>
      </div>

      {!locations ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Slug</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Office</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Active</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(location => (
                <tr key={location._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{location.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{location.slug}</td>
                  <td className="px-4 py-2 text-gray-700">{officeNames.get(location.officeId) ?? location.officeId.slice(-8)}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(location)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${location.active ? "bg-green-500" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${location.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <button
                      onClick={() => openEdit(location)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(location._id)}
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
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === "add" ? "Add Location" : "Edit Location"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Downtown"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Slug</label>
                <input
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. downtown"
                />
              </div>
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
              {modal.mode === "edit" && (
                <div className="flex items-center gap-2">
                  <input
                    id="location-active"
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="location-active" className="text-sm text-gray-600">Active</label>
                </div>
              )}
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
