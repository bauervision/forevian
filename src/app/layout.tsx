import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Navbar from "@/components/Navbar";
import ClientProviders from "./ClientProviders";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forevian: Finance",
  description:
    "Take control of your finances with clarity, simplicity, and insight",
  appleWebApp: {
    statusBarStyle: "black-translucent", // iOS status bar dark
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={{ background: "#0a0a0a", color: "#ededed" }}
        className={`${geistSans.variable} ${geistMono.variable} flex flex-col min-h-screen overflow-x-hidden antialiased`}
      >
        <ClientProviders>
          <Navbar />

          <main className="flex-grow pt-4">{children}</main>
          <Footer />
        </ClientProviders>
      </body>
    </html>
  );
}
