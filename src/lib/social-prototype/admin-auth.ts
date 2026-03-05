/**
 * Shared admin authorization utilities for social API routes.
 *
 * Centralizes the admin list parsing and check so changes only need to happen here.
 */

/**
 * Parses a comma-separated env var into a trimmed, non-empty string array.
 */
export const getAdminList = (envValue?: string): string[] =>
    (envValue || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

/**
 * Returns true if either the Clerk user ID or the linked Supabase user ID
 * is in the configured admin lists.
 */
export const isSocialAdmin = (clerkUserId: string, linkedUserId: string): boolean => {
    const adminClerkIds = getAdminList(process.env.SOCIAL_ADMIN_CLERK_IDS);
    const adminLinkedIds = getAdminList(process.env.SOCIAL_ADMIN_LINKED_IDS);
    return adminClerkIds.includes(clerkUserId) || adminLinkedIds.includes(linkedUserId);
};
