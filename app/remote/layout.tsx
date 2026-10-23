import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AmpCore Remote",
  description: "Control your amplifier system from a phone or tablet",
  manifest: "/remote.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AmpCore",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#121212"
};

export default function RemoteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
