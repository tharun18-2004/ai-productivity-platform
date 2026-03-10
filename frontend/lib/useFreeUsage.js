import { useCallback, useEffect, useState } from "react";

const POLL_MS = 60_000 * 5; // every 5 minutes

export function useFreeUsage() {
  const [state, setState] = useState({
    remaining: null,
    total: null,
    loading: true,
    error: null
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/plan/usage");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Usage load failed");
      }
      setState({
        remaining: data?.remaining ?? null,
        total: data?.total ?? null,
        loading: false,
        error: null
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Usage unavailable"
      }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer;

    const guardedLoad = async () => {
      await load();
      if (!active) return;
    };

    guardedLoad();
    timer = setInterval(guardedLoad, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  return { ...state, refreshUsage: load };
}
