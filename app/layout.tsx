import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "./site-config";

export const metadata: Metadata = {
  title: `${siteConfig.name} — 내 클라우드 사용량`,
  description: siteConfig.description,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/og.png"],
  },
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
