import { useState } from "react";
import Layout from "./components/Layout";
import TabNav, { TabId } from "./components/TabNav";
import DashboardPage from "./pages/DashboardPage";
import OfficeDetailPage from "./pages/OfficeDetailPage";
import LocationDetailPage from "./pages/LocationDetailPage";
import OfficesPage from "./pages/OfficesPage";
import LocationsPage from "./pages/LocationsPage";
import ServicesPage from "./pages/ServicesPage";
import StaticItemsPage from "./pages/StaticItemsPage";
import SourcesPage from "./pages/SourcesPage";
import FeedRunsPage from "./pages/FeedRunsPage";
import FeedBrowserPage from "./pages/FeedBrowserPage";
import ManualTriggerPage from "./pages/ManualTriggerPage";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedOfficeId, setSelectedOfficeId] = useState<Id<"offices"> | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<Id<"locations"> | null>(null);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    // Clear drill-down state when switching tabs
    setSelectedOfficeId(null);
    setSelectedLocationId(null);
  }

  function handleSelectOffice(officeId: Id<"offices">) {
    setSelectedOfficeId(officeId);
    setSelectedLocationId(null);
  }

  function handleSelectLocation(locationId: Id<"locations">) {
    setSelectedLocationId(locationId);
  }

  function handleBackToOffice() {
    setSelectedLocationId(null);
  }

  function handleBackToDashboard() {
    setSelectedOfficeId(null);
    setSelectedLocationId(null);
  }

  function renderDashboardView() {
    if (selectedOfficeId && selectedLocationId) {
      return (
        <LocationDetailPage
          officeId={selectedOfficeId}
          locationId={selectedLocationId}
          onBack={handleBackToOffice}
          onBackToRoot={handleBackToDashboard}
        />
      );
    }
    if (selectedOfficeId) {
      return (
        <OfficeDetailPage
          officeId={selectedOfficeId}
          onSelectLocation={handleSelectLocation}
          onBack={handleBackToDashboard}
        />
      );
    }
    return <DashboardPage onSelectOffice={handleSelectOffice} />;
  }

  const page = activeTab === "dashboard"
    ? renderDashboardView()
    : {
        offices: <OfficesPage />,
        locations: <LocationsPage />,
        services: <ServicesPage />,
        "static-items": <StaticItemsPage />,
        sources: <SourcesPage />,
        "feed-runs": <FeedRunsPage />,
        "feed-browser": <FeedBrowserPage />,
        trigger: <ManualTriggerPage />,
      }[activeTab as Exclude<TabId, "dashboard">];

  return (
    <Layout>
      <TabNav active={activeTab} onChange={handleTabChange} />
      {page}
    </Layout>
  );
}
