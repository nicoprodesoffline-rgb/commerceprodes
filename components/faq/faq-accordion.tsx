"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqGroup {
  group: string;
  items: FaqItem[];
}

interface FaqAccordionProps {
  groups: FaqGroup[];
}

export default function FaqAccordion({ groups }: FaqAccordionProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  function toggle(key: string) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.group}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#cc1818]">
            {group.group}
          </h2>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {group.items.map((item, i) => {
              const key = `${group.group}-${i}`;
              const isOpen = openKey === key;
              return (
                <div key={key}>
                  <button
                    className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                    onClick={() => toggle(key)}
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`text-sm font-medium leading-snug ${
                        isOpen ? "text-[#cc1818]" : "text-gray-800"
                      }`}
                    >
                      {item.question}
                    </span>
                    <span
                      className={`mt-0.5 flex-none text-gray-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-gray-50 px-5 pb-4 pt-1">
                      <p className="text-sm leading-relaxed text-gray-600">{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
