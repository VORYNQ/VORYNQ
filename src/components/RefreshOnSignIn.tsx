"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

/** Re-renders the server page when the wallet signs in or out, for pages whose content depends on the session. */
export function RefreshOnSignIn() {
  const router = useRouter();
  const auth = useAuth();
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!auth.ready) return;
    if (seen.current !== undefined && seen.current !== auth.address) router.refresh();
    seen.current = auth.address;
  }, [auth.ready, auth.address, router]);
  return null;
}
