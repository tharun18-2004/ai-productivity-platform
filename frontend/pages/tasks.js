import AppShell from "../components/AppShell";
import KanbanBoard from "../components/KanbanBoard";

export default function TasksPage() {
  return (
    <AppShell title="Task Management Board" subtitle="Search, filter, and move tasks across To Do, In Progress, and Done">
      <KanbanBoard />
    </AppShell>
  );
}
