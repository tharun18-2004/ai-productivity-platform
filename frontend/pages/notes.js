import AppShell from "../components/AppShell";
import NotesWorkspace from "../components/NotesWorkspace";

export default function NotesPage() {
  return (
    <AppShell title="Notes Editor" subtitle="Create, edit, and organize your work notes">
      <NotesWorkspace />
    </AppShell>
  );
}
