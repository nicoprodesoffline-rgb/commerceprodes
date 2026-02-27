"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface PromoBannerProps {
  text: string;
  link?: string;
  active?: boolean;
}

export function PromoBanner({ text, link, active = true }: PromoBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const lastClosed = localStorage.getItem("prodes_banner_msg");
      if (lastClosed !== text) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [text]);

  if (!active || !visible || !text) return null;

  const handleClose = () => {
    try {
      localStorage.setItem("prodes_banner_msg", text);
    } catch {}
    setVisible(false);
  };

  const content = (
    <span className={text.length > 60 ? "inline-block animate-marquee whitespace-nowrap" : ""}>
      {text}
    </span>
  );

  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-[#cc1818] px-8 py-2 text-center text-sm font-medium text-white">
      {link ? (
        <Link href={link} className="hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
      <button
        onClick={handleClose}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
        aria-label="Fermer le bandeau"
      >
        ✕
      </button>
    </div>
  );
}
