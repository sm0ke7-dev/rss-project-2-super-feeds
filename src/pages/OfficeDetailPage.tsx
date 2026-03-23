import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface OfficeDetailPageProps {
  officeId: Id<"offices">;
  onSelectLocation: (locationId: Id<"locations">) => void;
  onBack: () => void;
}

export default function OfficeDetailPage({ officeId, onSelectLocation, onBack }: OfficeDetailPageProps) {
  const offices = useQuery(api.offices.list);
  const locations = useQuery(api.locations.listByOffice, { officeId });
  const sources = useQuery(api.sources.list);
  const feedRuns = useQuery(api.feedRuns.list);

  const office = offices?.find(o => o._id === officeId);

  // Count sources per location (location or location-service scoped)
  const sourceCountByLocation = new Map<string, number>();
  if (sources) {
    for (const src of sources) {
      if (
        src.locationId &&
        (src.scope === "location" || src.scope === "location-service")
      ) {
        sourceCountByLocation.set(
          src.locationId,
          (sourceCountByLocation.get(src.locationId) ?? 0) + 1
        );
      }
    }
  }

  // Count recent feed runs per location
  const runCountByLocation = new Map<string, number>();
  if (feedRuns) {
    for (const run of feedRuns) {
      if (run.locationId) {
        runCountByLocation.set(
          run.locationId,
          (runCountByLocation.get(run.locationId) ?? 0) + 1
        );
      }
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={onBack} className="hover:text-blue-600 transition-colors">
          Dashboard
        </button>
        <span>/</span>
        <span className="text-gray-800 font-medium">{office?.name ?? "Loading..."}</span>
      </nav>

      {/* Office info header */}
      {office && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{office.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {office.city}, {office.state} &mdash; <span className="font-mono text-xs">{office.slug}</span>
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                office.active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {office.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      )}

      {/* Locations grid */}
      <h3 className="text-base font-semibold text-gray-700 mb-3">Locations</h3>

      {!locations ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : locations.length === 0 ? (
        <p className="text-gray-400 text-sm">No locations for this office yet. Add one in the Locations tab.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {locations.map(location => {
            const srcCount = sourceCountByLocation.get(location._id) ?? 0;
            const runCount = runCountByLocation.get(location._id) ?? 0;

            return (
              <button
                key={location._id}
                onClick={() => onSelectLocation(location._id)}
                className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-base font-semibold text-gray-900 leading-tight">{location.name}</h4>
                  <span
                    className={`ml-2 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      location.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {location.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mb-3">{location.slug}</p>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>
                    <span className="font-semibold text-gray-700">{srcCount}</span>{" "}
                    {srcCount === 1 ? "source" : "sources"}
                  </span>
                  <span>
                    <span className="font-semibold text-gray-700">{runCount}</span>{" "}
                    {runCount === 1 ? "run" : "runs"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
