import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JPEG Image Compressor · Photo Resizer",
  description:
    "Compress, resize, crop, and convert photos instantly with the JPEG Image Compressor & Resizer tool.",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#2563eb"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
