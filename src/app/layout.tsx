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

  return (
    <html lang="en">
      <body className="antialiased">
        {/* Legacy cleanup: remove stale bird_election_* keys from localStorage */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith('bird_election_')) {
                    localStorage.removeItem(key);
                  }
                }
              } catch (e) {}
            `,
          }}
        />
        {clerkEnabled ? (
          <ClerkProvider>
            <ToastHost />
            {children}
          </ClerkProvider>
        ) : (
          <>
            <ToastHost />
            {children}
          </>
        )}
      </body>
    </html>
  );
}
