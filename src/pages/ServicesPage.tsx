import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Service = {
  _id: Id<"services">;
  name: string;
  slug: string;
  description: string;
  active: boolean;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  active: boolean;
};

export default function ServicesPage() {
  const services = useQuery(api.services.list);
  const updateService = useMutation(api.services.update);

  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", slug: "", description: "", active: true });

  function openEdit(service: Service) {
    setForm({ name: service.name, slug: service.slug, description: service.description, active: service.active });
    setEditTarget(service);
  }

  function closeModal() {
    setEditTarget(null);
  }

  async function handleSubmit() {
    if (!editTarget || !form.name.trim() || !form.slug.trim()) return;
    await updateService({ id: editTarget._id, name: form.name, slug: form.slug, description: form.description, active: form.active });
    closeModal();
  }

  async function toggleActive(service: Service) {
    await updateService({ id: service._id, name: service.name, slug: service.slug, description: service.description, active: !service.active });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Services</h2>

      {!services ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Slug</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Description</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Active</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map(service => (
                <tr key={service._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{service.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{service.slug}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate">{service.description}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(service)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${service.active ? "bg-green-500" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${service.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => openEdit(service)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Edit Service</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Slug</label>
                <input
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="service-active"
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="service-active" className="text-sm text-gray-600">Active</label>
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
