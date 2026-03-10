import { useCallback, useEffect, useState } from "react";

const POLL_MS = 60_000 * 5; // every 5 minutes

export function useFreeUsage() {
  // Metering disabled: always return null values and no-op refresher
  return { remaining: null, total: null, loading: false, error: null, refreshUsage: () => {} };
}
