import { useMemo } from 'react';
import { generateDataset } from './data/generate';
import { Clinical } from './pages/Clinical';
import { EltSummary } from './pages/EltSummary';
import { Executive } from './pages/Executive';
import { Financial } from './pages/Financial';
import { Review } from './pages/Review';
import { Incidents } from './pages/Incidents';
import { Infrastructure } from './pages/Infrastructure';
import { Projects } from './pages/Projects';
import { Reference } from './pages/Reference';
import { Scorecard } from './pages/Scorecard';
import { Security } from './pages/Security';
import { ServiceDesk } from './pages/ServiceDesk';
import { Sites } from './pages/Sites';
import { AppProvider, useApp, type PageId } from './state';
import { FilterPane, Header, NavTabs, StatusBar, Toasts } from './ui/Shell';

const VIEWS: Record<PageId, () => JSX.Element> = {
  elt: EltSummary, executive: Executive, review: Review, financial: Financial, scorecard: Scorecard, 'service-desk': ServiceDesk, clinical: Clinical, infrastructure: Infrastructure,
  incidents: Incidents, security: Security, sites: Sites, projects: Projects, reference: Reference,
};

export default function App() {
  const ds = useMemo(() => generateDataset(), []);
  return <AppProvider ds={ds}><Workspace /></AppProvider>;
}

function Workspace() {
  const { route } = useApp();
  const View = VIEWS[route.page];
  const exec = route.page === 'executive' || route.page === 'elt';
  return (
    <div className={`app ${exec ? 'app-exec' : ''}`}>
      <Header />
      <NavTabs />
      <div className="body">
        {!exec && <FilterPane />}
        <main className="canvas" key={route.page}><View /></main>
      </div>
      <StatusBar />
      <Toasts />
    </div>
  );
}
