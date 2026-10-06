import { ProjectsGrid } from '../ProjectsGrid';
import { loadProjectsPage } from '../projects-data';

// /app/projets — every project of the account, sorted and filtered by
// category (Extérieur, Intérieur, Jour, Nuit, Esquisse, Enhance, Modifiés,
// Sans rendu), after Metrio's "Projets" page (owner, 2026-10-06).
//
// It redirected to /app from 2026-09-03, when the dashboard took the grid;
// the address is back in use for what its name says.
export default async function AppProjectsPage() {
  const { projects, dashboard, userEmail } = await loadProjectsPage();
  return (
    <ProjectsGrid
      variant="projects"
      initialProjects={projects}
      dashboard={dashboard}
      userEmail={userEmail}
    />
  );
}
