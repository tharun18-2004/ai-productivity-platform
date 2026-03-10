import AppShell from "../components/AppShell";
import SmartAssistant from "../components/SmartAssistant";

export default function AIPage() {
  return (
    <AppShell title="AI Workspace Assistant" subtitle="Type anything—intent is detected automatically">
      <SmartAssistant />
    </AppShell>
  );
}
