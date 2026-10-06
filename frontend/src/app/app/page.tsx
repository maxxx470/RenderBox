import { ProjectsGrid } from './ProjectsGrid';
import { loadProjectsPage } from './projects-data';

// /app — the dashboard, and the first screen after sign-in: the "3 steps"
// film and the showcase, the account figures, then the most recent projects.
// Every project, with its category filters, is on /app/projets.
//
// The generation space it used to share this route with now lives at
// /app/generer, reachable from the sidebar. The data (three database calls)
// is shared with /app/projets — see projects-data.ts.
export default async function AppDashboardPage() {
  const { projects, dashboard, userEmail } = await loadProjectsPage();
  return (
    <ProjectsGrid
      variant="dashboard"
      initialProjects={projects}
      dashboard={dashboard}
      userEmail={userEmail}
    />
  );
}
