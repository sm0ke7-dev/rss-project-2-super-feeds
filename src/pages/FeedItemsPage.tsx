import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function ScoreBadge({ score }: { score?: number }) {
  if (score === 1) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        1 — Related
      </span>
    );
  }
  if (score === 2) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
        2 — Semi-related
      </span>
    );
  }
  if (score === 3) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
        3 — Filtered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
      Unscored
    </span>
  );
}

export default function FeedItemsPage() {
  const items = useQuery(api.feedItems.list);

  const scoreCounts = items
    ? {
        related: items.filter((i: { relevanceScore?: number }) => i.relevanceScore === 1).length,
        semi: items.filter((i: { relevanceScore?: number }) => i.relevanceScore === 2).length,
        filtered: items.filter((i: { relevanceScore?: number }) => i.relevanceScore === 3).length,
        unscored: items.filter((i: { relevanceScore?: number }) => i.relevanceScore == null).length,
      }
    : null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Feed Items ({items?.length ?? "…"})
      </h2>

      {scoreCounts && (
        <div className="flex gap-3 mb-4 text-sm">
          <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
            {scoreCounts.related} Related
          </span>
          <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded">
            {scoreCounts.semi} Semi-related
          </span>
          <span className="px-2 py-1 bg-red-50 text-red-700 rounded">
            {scoreCounts.filtered} Filtered
          </span>
          <span className="px-2 py-1 bg-gray-50 text-gray-500 rounded">
            {scoreCounts.unscored} Unscored
          </span>
        </div>
      )}

      {!items ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">No feed items yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">
                  Title
                </th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">
                  Type
                </th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">
                  Score
                </th>
                <th className="text-left px-4 py-2 text-gray-600 font-medium">
                  Published
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: { _id: string; title: string; link: string; schemaType: string; relevanceScore?: number; isoDate?: string }) => (
                <tr
                  key={item._id}
                  className={`border-t border-gray-100 ${
                    item.relevanceScore === 3 ? "bg-red-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`hover:underline ${
                        item.relevanceScore === 3
                          ? "text-gray-400"
                          : "text-blue-600"
                      }`}
                      title={item.title}
                    >
                      {item.title.length > 80
                        ? item.title.slice(0, 80) + "…"
                        : item.title}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {item.schemaType}
                  </td>
                  <td className="px-4 py-2">
                    <ScoreBadge score={item.relevanceScore} />
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {item.isoDate
                      ? new Date(item.isoDate).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
