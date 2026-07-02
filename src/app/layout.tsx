import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
// Sonner Toaster — mounts the render target for `import { toast } from "sonner"`
// used across saratrasa components (AdminPanel, CekStatus, DaftarWizard,
// TicketCard, ImageDropZone, PhotoLightbox). Without this, those toast calls
// are silently dropped. Safe to mount alongside the shadcn Toaster above.
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
// PWA service-worker registration — production-only, side-effect-only leaf.
// Mounted at the bottom of <body> so it never blocks first paint.
import { ServiceWorkerRegister } from "@/components/saratrasa/ServiceWorkerRegister";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SaratRasaaa",
  description: "Platform kegiatan sosial dan kerelawanan.",
  keywords: [
    "Saratrasaa",
    "volunteer",
    "komunitas",
    "relawan",
    "event",
    "pendaftaran",
    "QRIS",
  ],
  authors: [{ name: "Saratrasaa" }],
  // PWA manifest + apple touch icon — the manifest makes the app installable
  // on Android/Chrome/Edge; the apple-touch-icon is the fallback iOS uses for
  // "Add to Home Screen". theme_color matches the Saratrasaa pink so the
  // status bar / splash screen blends with the brand.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Saratrasaa",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/saratrasa.png", type: "image/png" },
    ],
    apple: [
      { url: "/saratrasa.png", type: "image/png" }
    ]
  },
  openGraph: {
    title: "Saratrasaa — Komunitas Volunteer",
    description:
      "Daftar jadi volunteer Saratrasaa. Bayar via QRIS, dapat tiket QR digital.",
    siteName: "Saratrasaa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Saratrasaa — Komunitas Volunteer",
    description:
      "Daftar jadi volunteer Saratrasaa. Bayar via QRIS, dapat tiket QR digital.",
  },
};

/**
 * Viewport export — Next.js 16 prefers a separate `viewport` export over
 * stuffing `theme-color` into the metadata. `themeColor` here controls the
 * <meta name="theme-color"> tag injected into <head>, which colours the
 * browser chrome on mobile (and the Android PWA status bar).
 */
export const viewport: Viewport = {
  themeColor: "#FF2D78",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${bricolage.variable} ${inter.variable} ${jetbrains.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton visibleToasts={1} duration={3000} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
