"use client";

import { useEffect } from "react";

/** Scrolls to the URL's #section once the page has rendered (e.g. /platform#franchise,
 *  /platform#treasury). The browser's own jump happens before client sections above it (dashboard,
 *  reveals) reach their final height, so it lands in the wrong place. */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    // Jump instantly: a smooth scroll (html has scroll-behavior: smooth) can be cut short.
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" }), 150);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
