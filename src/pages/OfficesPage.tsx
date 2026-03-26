import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Office = {
  _id: Id<"offices">;
  name: string;
  slug: string;
  city: string;
  state: string;
  active: boolean;
  phone?: string;
  address?: string;
  zip?: string;
  contactUrl?: string;
};

type FormState = {
  name: string;
  slug: string;
  city: string;
  state: string;
  active: boolean;
  phone: string;
  address: string;
  zip: string;
  contactUrl: string;
};

const EMPTY_FORM: FormState = { name: "", slug: "", city: "", state: "", active: true, phone: "", address: "", zip: "", contactUrl: "" };

export default function OfficesPage() {
  const offices = useQuery(api.offices.list);
  const createOffice = useMutation(api.offices.create);
  const updateOffice = useMutation(api.offices.update);
  const removeOffice = useMutation(api.offices.remove);

  const [modal, setModal] = useState<{ mode: "add" | "edit"; office?: Office } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal({ mode: "add" });
  }

  function openEdit(office: Office) {
    setForm({ name: office.name, slug: office.slug, city: office.city, state: office.state, active: office.active, phone: office.phone ?? "", address: office.address ?? "", zip: office.zip ?? "", contactUrl: office.contactUrl ?? "" });
    setModal({ mode: "edit", office });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.slug.trim()) return;
    if (modal?.mode === "add") {
      await createOffice({ name: form.name, slug: form.slug, city: form.city, state: form.state });
    } else if (modal?.mode === "edit" && modal.office) {
      await updateOffice({
        id: modal.office._id,
        name: form.name,
        slug: form.slug,
        city: form.city,
        state: form.state,
        active: form.active,
        phone: form.phone || undefined,
        address: form.address || undefined,
        zip: form.zip || undefined,
        contactUrl: form.contactUrl || undefined,
      });
    }
    closeModal();
  }

  async function handleDelete(id: Id<"offices">) {
    if (!confirm("Delete this office? This cannot be undone.")) return;
    await removeOffice({ id });
  }

  async function toggleActive(office: Office) {
    await updateOffice({ id: office._id, name: office.name, slug: office.slug, city: office.city, state: office.state, active: !office.active, phone: office.phone, address: office.address, zip: office.zip, contactUrl: office.contactUrl });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Offices</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Office
        </button>
      </div>

      {!offices ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Slug</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">City</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">State</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Active</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offices.map(office => (
                <tr key={office._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{office.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{office.slug}</td>
                  <td className="px-4 py-2 text-gray-700">{office.city}</td>
                  <td className="px-4 py-2 text-gray-700">{office.state}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(office)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${office.active ? "bg-green-500" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${office.active ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <button
                      onClick={() => openEdit(office)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(office._id)}
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
              {modal.mode === "add" ? "Add Office" : "Edit Office"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. New York"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Slug</label>
                <input
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. new-york"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">City</label>
                <input
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. New York"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">State</label>
                <input
                  value={form.state}
                  onChange={e => setForm({ ...form, state: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. NY"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Street Address</label>
                <input
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 123 Main St"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Zip Code</label>
                <input
                  value={form.zip}
                  onChange={e => setForm({ ...form, zip: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 10001"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Contact URL</label>
                <input
                  value={form.contactUrl}
                  onChange={e => setForm({ ...form, contactUrl: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. https://example.com/contact"
                />
              </div>
              {modal.mode === "edit" && (
                <div className="flex items-center gap-2">
                  <input
                    id="office-active"
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="office-active" className="text-sm text-gray-600">Active</label>
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
