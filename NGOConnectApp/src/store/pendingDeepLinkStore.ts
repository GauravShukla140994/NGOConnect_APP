/**
 * pendingDeepLinkStore
 *
 * Holds a single deep link target that arrived before the user was logged in.
 * RootNavigator reads and clears it after successful authentication.
 *
 * Covers:
 *   /ngo/{id}              → NgoProfile screen   (legacy numeric ID — backward compat)
 *   /ngo/{token}           → NgoProfile screen   (encrypted share token — v4.9+)
 *   /opportunity/{id}      → ProjectDetail screen (legacy numeric ID — backward compat)
 *   /opportunity/{token}   → ProjectDetail screen (encrypted share token — v4.9+)
 *
 * (Invite links use pendingInviteStore — kept separate for clarity.)
 */

type DeepLinkTarget =
  | { type: 'ngo';     id: number  }   // legacy numeric ID
  | { type: 'project'; id: number  }   // legacy numeric ID
  | { type: 'ngo';     token: string } // encrypted share token (v4.9+)
  | { type: 'project'; token: string }; // encrypted share token (v4.9+)

let _pending: DeepLinkTarget | null = null;

export const pendingDeepLinkStore = {
  set:   (target: DeepLinkTarget) => { _pending = target; },
  get:   () => _pending,
  clear: () => { _pending = null; },
};
