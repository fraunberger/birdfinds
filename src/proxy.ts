import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk Proxy (Next.js 16) — runs on every matched request before the route handler.
 *
 * Protects write-path API routes (mutations, account management, uploads)
 * so unauthenticated requests are rejected at the edge before spinning up a
 * serverless function. Read-only routes and public pages remain open.
 */
const isProtectedRoute = createRouteMatcher([
  "/api/social/write(.*)",
  "/api/social/account(.*)",
  "/api/social/avatar(.*)",
  "/api/social/reports(.*)",
  "/api/social/notifications(.*)",
  "/settings(.*)",
  "/moderation(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
