"use client";

import { useState } from "react";
import { FAQ } from "../data/content";

/** Accordion of FAQ entries; the first one starts open. */
export function FaqList() {
  const [open, setOpen] = useState(0);
  return (
    <div>
      {FAQ.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="border-b border-line first:border-t">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full cursor-pointer items-center justify-between gap-5 py-[26px] text-left text-xl leading-[1.35] font-medium text-heading max-sm:text-lg"
            >
              {f.q}
              <span className={`grid size-[34px] flex-none place-items-center rounded-full border transition duration-300 ${isOpen ? "bg-grad rotate-45 border-transparent" : "border-line-strong"}`}>+</span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-350 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <p className="pr-[50px] pb-[26px] max-sm:pr-0">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
