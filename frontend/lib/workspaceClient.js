import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useWorkspaceContext() {
  const [workspaceState, setWorkspaceState] = useState({
    loading: true,
    error: "",
    workspace: null,
    membership: null,
    members: [],
    user: null
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        const params = new URLSearchParams();
        if (user?.email) {
          params.set("email", user.email);
        }

        const response = await fetch(
          params.toString() ? `/api/workspace?${params.toString()}` : "/api/workspace"
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Could not load workspace context.");
        }

        if (!active) return;
        setWorkspaceState({
          loading: false,
          error: "",
          workspace: data?.workspace || null,
          membership: data?.membership || null,
          members: data?.members || [],
          user: data?.user || null
        });
      } catch (err) {
        if (!active) return;
        setWorkspaceState({
          loading: false,
          error: err?.message || "Could not load workspace context.",
          workspace: null,
          membership: null,
          members: [],
          user: null
        });
      }
    };

    load();
    const refresh = () => load();
    window.addEventListener("workspace-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("workspace-updated", refresh);
    };
  }, []);

  return workspaceState;
}
