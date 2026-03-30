const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "offices", label: "Offices" },
  { id: "locations", label: "Locations" },
  { id: "services", label: "Services" },
  { id: "static-items", label: "Static Items" },
  { id: "sources", label: "Sources" },
  { id: "feed-items", label: "Feed Items" },
  { id: "feed-runs", label: "Feed Runs" },
  { id: "feed-browser", label: "Feed Browser" },
  { id: "trigger", label: "Manual Trigger" },
] as const;

export type TabId = typeof TABS[number]["id"];

interface TabNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export default function TabNav({ active, onChange }: TabNavProps) {
  return (
    <nav className="flex gap-1 border-b border-gray-200 mb-8 flex-wrap">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.id
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
