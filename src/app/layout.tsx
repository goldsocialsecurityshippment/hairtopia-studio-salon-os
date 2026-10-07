import type { Metadata } from "next";
import "./globals.css";
import { PushRegistration } from "@/components/PushRegistration";

export const metadata: Metadata = {
  title: "Hairtopia Studio",
  description:
    "Book appointments, browse services and stylists at Hairtopia Studio. Built by Coratech AI.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#8a5a3b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        {children}
        <PushRegistration />
      </body>
    </html>
  );
}
