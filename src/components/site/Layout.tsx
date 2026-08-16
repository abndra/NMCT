import type { CSSProperties, ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CartDrawer } from "./CartDrawer";
import { AnnouncementBar } from "./AnnouncementBar";
import { siteBackground as backgroundAsset } from "@/lib/assets";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell min-h-screen" style={{ "--site-background": `url(${backgroundAsset})` } as CSSProperties}>
      <AnnouncementBar />
      <Header />
      <main>{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}