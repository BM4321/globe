import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Globe Trans Management System",
  description: "Shipment, fleet and driver operations for Globe Trans.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
