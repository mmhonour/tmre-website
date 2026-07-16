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
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_IMAGE_PATH,
  SITE_URL,
  realEstateAgentJsonLd,
} from "@/lib/business-info";
import { getContactPhone } from "@/lib/phone-config";

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

const siteDescription = `${BRAND_NAME}. Market intelligence and investment for ${TMRE_CORE_TOWNS_LABEL}, CT. Where smart real estate decisions begin.`;

export const metadata: Metadata = {
  // Absolute-URL base for canonical + Open Graph/Twitter cards. Lets automated
  // categorizers and link unfurlers resolve a real, self-consistent business.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    template: `%s · ${BRAND_NAME}`,
  },
  description: siteDescription,
  applicationName: BRAND_NAME,
  authors: [{ name: "Timothy Marks" }],
  creator: "Timothy Marks",
  publisher: BRAND_NAME,
  category: "real estate",
  keywords: [
    "real estate",
    "market intelligence",
    "Fairfield County CT real estate",
    "home valuation",
    "real estate investment",
    "Westport CT",
    BRAND_NAME,
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: siteDescription,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: BRAND_IMAGE_PATH,
        alt: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    description: siteDescription,
    images: [BRAND_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Browser-tab icon: the tiny four-lens camera. Served from /public so it does
  // not need the app/ icon convention or an .ico conversion. The prior lens-only
  // icon is archived under /images/archive and can be swapped back here.
  icons: {
    icon: "/images/four-lens-camera-tiny.png",
    shortcut: "/images/four-lens-camera-tiny.png",
    apple: "/images/four-lens-camera-tiny.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const siteUnlocked = jar.get(SITE_PASSWORD_COOKIE)?.value === "1";
  const phone = getContactPhone();

  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-charcoal">
        {/* Business identity for search engines / web-filter categorizers. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              realEstateAgentJsonLd({ phoneDisplay: phone.display }),
            ),
          }}
        />
        <SiteUnlockProvider unlocked={siteUnlocked}>
          <Suspense fallback={null}>
            <ListingReturnNavTracker />
          </Suspense>
          <VisitorBeacon />
          <Navigation siteUnlocked={siteUnlocked} phone={phone} />
          <main className="flex-1">{children}</main>
          <Footer />
        </SiteUnlockProvider>
      </body>
    </html>
  );
}
