import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Playfair_Display, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import VisitorBeacon from "@/components/VisitorBeacon";
import ListingReturnNavTracker from "@/components/listing/ListingReturnNavTracker";
import { SITE_PASSWORD_COOKIE } from "@/lib/site-password";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { SiteUnlockProvider } from "@/components/SiteUnlockProvider";

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "TMRE — Confidence through clarity",
  description:
    `TMRE. Market intelligence and investment for ${TMRE_CORE_TOWNS_LABEL}, CT. Where smart real estate decisions begin.`,
  // Corporate logo (for now): the four-lens camera. Served from /public so it
  // does not need the app/ icon convention or an .ico conversion.
  icons: {
    icon: "/images/tmre-camera-icon.png",
    shortcut: "/images/tmre-camera-icon.png",
    apple: "/images/tmre-camera-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const siteUnlocked = jar.get(SITE_PASSWORD_COOKIE)?.value === "1";

  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-charcoal">
        <SiteUnlockProvider unlocked={siteUnlocked}>
          <Suspense fallback={null}>
            <ListingReturnNavTracker />
          </Suspense>
          <VisitorBeacon />
          <Navigation siteUnlocked={siteUnlocked} />
          <main className="flex-1">{children}</main>
          <Footer />
        </SiteUnlockProvider>
      </body>
    </html>
  );
}
