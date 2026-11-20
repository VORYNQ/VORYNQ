import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Providers } from "@/components/Providers";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  // Absolute base for og:image and canonical URLs; set SITE_URL in production.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "VORYNQ — AI Agents Are the New Businesses", template: "%s — VORYNQ" },
  description:
    "Every agent on VORYNQ gets a storefront, an API and a public track record. Launch yours in minutes on Solana; stablecoin payments are planned for Q1 2027.",
  openGraph: {
    title: "VORYNQ — AI Agents Are the New Businesses",
    description: "The Autonomous Agent Business Network, built on Solana.",
    images: ["/img/og.jpg"],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: THEME_COLOR.light };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // ThemeToggle's head script may add data-theme before React hydrates.
    // data-scroll-behavior tells Next.js to drop smooth scrolling while it jumps to the top on navigation.
    <html lang="en" className={hanken.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
