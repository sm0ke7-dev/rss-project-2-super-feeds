import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function FeedBrowserPage() {
  const feeds = useQuery(api.generatedFeeds.list);
  const removeFeed = useMutation(api.generatedFeeds.remove);
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  // Derive the .convex.site URL from the .convex.cloud URL
  const siteBase = convexUrl?.replace(".convex.cloud", ".convex.site") ?? "";

  async function handleDelete(id: Id<"generated_feeds">) {
    if (!confirm("Delete this generated feed?")) return;
    await removeFeed({ id });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Generated Feeds ({feeds?.length ?? "…"})</h2>
      {!feeds ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : feeds.length === 0 ? (
        <p className="text-gray-400 text-sm">No feeds generated yet. Use Manual Trigger to generate your first feed.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Office</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Service</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Generated</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Links</th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map(feed => {
                const xmlUrl = `${siteBase}/feeds/${feed.officeSlug}/${feed.serviceSlug}/feed.xml`;
                const htmlUrl = `${siteBase}/feeds/${feed.officeSlug}/${feed.serviceSlug}/feed.html`;
                return (
                  <tr key={feed._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{feed.officeSlug}</td>
                    <td className="px-4 py-2 text-gray-700">{feed.serviceSlug}</td>
                    <td className="px-4 py-2 text-gray-700">{feed.itemCount}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(feed.generatedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 flex gap-3">
                      <a href={xmlUrl} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline text-xs">XML</a>
                      <a href={htmlUrl} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline text-xs">HTML</a>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleDelete(feed._id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete feed"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
