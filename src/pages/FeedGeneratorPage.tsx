import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type ScrapedItem = { title: string; link: string };

type ScrapeResult = {
  items: ScrapedItem[];
  warnings: string[];
};

export default function FeedGeneratorPage() {
  const webFeeds = useQuery(api.webFeeds.list);
  const createFeed = useMutation(api.webFeeds.create);
  const removeFeed = useMutation(api.webFeeds.remove);
  const scrapeUrl = useAction(api.actions.scrapeUrl.scrapeUrl);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  // Save flow
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowSaveForm(false);

    try {
      const res = await scrapeUrl({ url: trimmed });
      setResult(res as ScrapeResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setResult(null);
    setError(null);
    setShowSaveForm(false);
  }

  function handleSaveClick() {
    // Pre-fill with domain as default title
    try {
      const domain = new URL(url.trim()).hostname;
      setSaveTitle(domain);
    } catch {
      setSaveTitle("");
    }
    setShowSaveForm(true);
  }

  async function handleSaveConfirm() {
    if (!result || !saveTitle.trim()) return;
    setSaving(true);
    try {
      await createFeed({
        url: url.trim(),
        title: saveTitle.trim(),
        items: result.items,
        scrapedItemCount: result.items.length,
        lastScrapedAt: Date.now(),
      });
      // Reset after save
      setResult(null);
      setUrl("");
      setShowSaveForm(false);
      setSaveTitle("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save feed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: Id<"web_feeds">) {
    if (!confirm("Delete this web feed? This cannot be undone.")) return;
    await removeFeed({ id });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Feed Generator</h2>

      {/* URL input bar */}
      <div className="flex gap-2 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !loading) handleGenerate();
          }}
          placeholder="Paste a URL to scrape for article links…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={handleGenerate}
          disabled={!url.trim() || loading}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Scraping…" : "Generate"}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Fetching and parsing page…
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Preview section */}
      {result && (
        <div className="mb-6">
          {/* Warnings banner */}
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              <strong>⚠ Warning:</strong>
              <ul className="list-disc list-inside mt-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Preview — {result.items.length} article{result.items.length !== 1 ? "s" : ""} found
            </h3>
            <div className="flex gap-2">
              {!showSaveForm && (
                <>
                  <button
                    onClick={handleSaveClick}
                    disabled={result.items.length === 0}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Feed
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Save form */}
          {showSaveForm && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <label className="block text-sm text-gray-600 mb-1">Feed Title</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveTitle.trim() && !saving) handleSaveConfirm();
                  }}
                  placeholder="Enter a name for this feed…"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSaveConfirm}
                  disabled={!saveTitle.trim() || saving}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Confirm Save"}
                </button>
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Article list */}
          {result.items.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600 font-medium w-8">#</th>
                    <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                    <th className="text-left px-4 py-2 text-gray-600 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 text-gray-800 font-medium">{item.title}</td>
                      <td className="px-4 py-2">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate block max-w-xs"
                          title={item.link}
                        >
                          {item.link}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No articles found on this page.</p>
          )}
        </div>
      )}

      {/* Saved feeds list */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Saved Web Feeds ({webFeeds?.length ?? "…"})
        </h3>

        {!webFeeds ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : webFeeds.length === 0 ? (
          <p className="text-gray-400 text-sm">No saved feeds yet. Generate and save one above.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Title</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">URL</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Items</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Last Scraped</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {webFeeds.map((feed) => (
                  <tr key={feed._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800 font-medium">{feed.title}</td>
                    <td className="px-4 py-2">
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate block max-w-xs"
                        title={feed.url}
                      >
                        {feed.url}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{feed.scrapedItemCount}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {feed.lastScrapedAt ? new Date(feed.lastScrapedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleDelete(feed._id)}
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
      </div>
    </div>
  );
}
