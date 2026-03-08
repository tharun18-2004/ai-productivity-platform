export default function InviteNotification({ item }) {
  if (!String(item?.type || "").includes("invite")) {
    return null;
  }

  return (
    <span className="mt-2 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
      Invite
    </span>
  );
}
