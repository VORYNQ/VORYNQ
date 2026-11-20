"use client";

import { useEffect, useRef, useState } from "react";

// Video 2 has no logo burned in (Video 1's sits top-left over the action), so the brand mark is
// drawn on top instead, where it can sit in any corner.
const SRC = "/Video/Video%202.mp4";

/** The hero video in its own rounded frame. Plays muted on a loop; on data-saver or reduced-motion
 *  it waits on its first frame with a play button, so the 10 MB file only loads when asked for. */
export function HeroPlayer({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (saveData || calm) return;

    // Pause while scrolled out of view to save CPU and battery.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    });
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`relative aspect-video overflow-hidden rounded-[20px] bg-tile shadow-[0_24px_60px_-24px_rgb(123_60_240/0.55)] ring-1 ring-edge ${className}`}>
      {/* #t=0.1 makes mobile Safari show the first frame instead of a blank box. */}
      <video ref={ref} src={`${SRC}#t=0.1`} muted loop playsInline preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="absolute inset-0 size-full object-cover" />
      {/* Brand mark, bottom-right so it stays clear of the robots. */}
      <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 z-[1] flex items-center gap-2 rounded-full bg-white/75 py-1.5 pr-3.5 pl-1.5 shadow-[0_6px_20px_-8px_rgb(21_18_46/0.45)] backdrop-blur-md">
        <img src="/img/logo.webp" alt="" width={24} height={24} className="size-6 rounded-full" />
        <span className="text-[12px] font-semibold tracking-[0.28em] text-[#15122e]">VORYNQ</span>
      </span>
      {!playing && (
        <button type="button" aria-label="Play video" onClick={() => void ref.current?.play().catch(() => {})}
          className="absolute inset-0 grid cursor-pointer place-items-center bg-black/25">
          <span className="grid size-14 place-items-center rounded-full bg-white/90 text-heading transition hover:scale-105">
            <svg viewBox="0 0 24 24" className="ml-1 size-6" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
