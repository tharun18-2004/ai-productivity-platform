import AppShell from "../components/AppShell";
import AssistantWorkspace from "../components/AssistantWorkspace";

export default function AIPage() {
  return (
    <AppShell title="AI Writing Tools" subtitle="Summarize notes, generate tasks, and improve writing with clear free-plan limits">
      <AssistantWorkspace />
    </AppShell>
  );
}
