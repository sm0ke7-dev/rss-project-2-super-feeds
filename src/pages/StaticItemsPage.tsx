import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type ItemType = "brand" | "authority" | "freshness";

type FormState = {
  title: string;
  url: string;
  description: string;
  type: ItemType;
  publishedAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  url: "",
  description: "",
  type: "brand",
  publishedAt: new Date().toISOString().slice(0, 10),
};

const TYPE_COLORS: Record<string, string> = {
  brand: "bg-purple-100 text-purple-700",
  authority: "bg-yellow-100 text-yellow-700",
  freshness: "bg-teal-100 text-teal-700",
};

export default function StaticItemsPage() {
  const items = useQuery(api.static_items.list);
  const createItem = useMutation(api.static_items.create);
  const updateItem = useMutation(api.static_items.update);
  const removeItem = useMutation(api.static_items.remove);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"static_items"> | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(item: NonNullable<typeof items>[0]) {
    setEditingId(item._id);
    setForm({
      title: item.title,
      url: item.url,
      description: item.description,
      type: item.type,
      publishedAt: new Date(item.publishedAt).toISOString().slice(0, 10),
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.url.trim()) return;
    const publishedAt = new Date(form.publishedAt).getTime();
    if (editingId) {
      await updateItem({
        id: editingId,
        title: form.title,
        url: form.url,
        description: form.description,
        type: form.type,
        publishedAt,
      });
    } else {
      await createItem({
        title: form.title,
        url: form.url,
        description: form.description,
        type: form.type,
        publishedAt,
      });
    }
    closeModal();
  }

  async function handleDelete(id: Id<"static_items">) {
    if (!confirm("Delete this static item? This cannot be undone.")) return;
    await removeItem({ id });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Static Items</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Item
        </button>
      </div>

      {!items ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Type</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">URL</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Published</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900 max-w-xs truncate">{item.title}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[item.type] ?? ""}`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs"
                    >
                      {item.url}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(item.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Open URL"
                    >
                      ↗
                    </a>
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors text-sm"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(item._id)}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">{editingId ? "Edit Static Item" : "Add Static Item"}</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Item title"
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
                <label className="block text-sm text-gray-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as ItemType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="brand">Brand</option>
                  <option value="authority">Authority</option>
                  <option value="freshness">Freshness</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Published At</label>
                <input
                  type="date"
                  value={form.publishedAt}
                  onChange={e => setForm({ ...form, publishedAt: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
