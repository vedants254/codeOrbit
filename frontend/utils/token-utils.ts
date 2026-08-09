/**
 * Utility functions for handling JWT tokens
 */

/**
 * Extracts the raw JWT token from a Bearer token string
 * @param bearerToken - Token string that may include "Bearer " prefix
 * @returns Raw JWT token without Bearer prefix, or empty string if invalid
 */
export function extractJwtToken(bearerToken?: string | null): string {
  if (!bearerToken) return '';
  
  // Remove "Bearer " prefix if it exists
  return bearerToken.replace(/^Bearer\s+/i, '');
}

/**
 * Checks if a token has the Bearer prefix
 * @param token - Token to check
 * @returns True if token starts with "Bearer "
 */
export function hasBearerPrefix(token?: string | null): boolean {
  if (!token) return false;
  return /^Bearer\s+/i.test(token);
}
