import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bible Vote",
  description: "Vote on weekly Bible readings with your group",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#151411",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
