import { useState } from "react";
import Layout from "./components/Layout";
import TabNav, { TabId } from "./components/TabNav";
import DashboardPage from "./pages/DashboardPage";
import OfficesPage from "./pages/OfficesPage";
import ServicesPage from "./pages/ServicesPage";
import StaticItemsPage from "./pages/StaticItemsPage";
import SourcesPage from "./pages/SourcesPage";
import FeedRunsPage from "./pages/FeedRunsPage";
import FeedBrowserPage from "./pages/FeedBrowserPage";
import ManualTriggerPage from "./pages/ManualTriggerPage";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const page = {
    dashboard: <DashboardPage />,
    offices: <OfficesPage />,
    services: <ServicesPage />,
    "static-items": <StaticItemsPage />,
    sources: <SourcesPage />,
    "feed-runs": <FeedRunsPage />,
    "feed-browser": <FeedBrowserPage />,
    trigger: <ManualTriggerPage />,
  }[activeTab];

  return (
    <Layout>
      <TabNav active={activeTab} onChange={setActiveTab} />
      {page}
    </Layout>
  );
}
