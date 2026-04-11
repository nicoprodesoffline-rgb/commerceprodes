import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Acces restreint — PRODES",
  robots: { index: false, follow: false },
};

export default function GateLayout({ children }: { children: ReactNode }) {
  return children;
}
