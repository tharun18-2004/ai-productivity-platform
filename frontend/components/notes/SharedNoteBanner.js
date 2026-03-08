export default function SharedNoteBanner({ workspaceName, role }) {
  return (
    <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
      Shared workspace: {workspaceName || "Workspace"} • Your role: {role || "member"}
    </div>
  );
}
