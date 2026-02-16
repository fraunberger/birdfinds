import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastHost } from "@/components/social-prototype/ToastHost";
import "./globals.css";

export const metadata: Metadata = {
  title: "BirdFinds",
  description: "Discover the world of birds.",
  openGraph: {
    title: "BirdFinds",
    description: "Discover the world of birds.",
    siteName: "BirdFinds",
    type: "website",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(clerkPublishableKey) && !String(clerkPublishableKey).startsWith("YOUR_");

  const appShell = (
    <html lang="en">
      <body className="antialiased">
        <ToastHost />
        {children}
      </body>
    </html>
  );

  if (!clerkEnabled) {
    return appShell;
  }

  return (
    <ClerkProvider>
      {appShell}
    </ClerkProvider>
  );
}
