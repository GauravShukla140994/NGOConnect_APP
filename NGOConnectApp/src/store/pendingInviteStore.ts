/**
 * Tiny module-level store for a pending invite token.
 * Used when the user opens a deep link while NOT logged in:
 *   1. Deep link handler stores the token here.
 *   2. After login, RootNavigator reads it and navigates to InviteAcceptScreen.
 * No persistence needed — if the user quits mid-flow they get a fresh start.
 */
let _pendingToken: string | null = null;

export const pendingInviteStore = {
  set:   (token: string) => { _pendingToken = token; },
  get:   () => _pendingToken,
  clear: () => { _pendingToken = null; },
};
