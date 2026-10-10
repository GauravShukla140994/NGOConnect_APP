/**
 * pendingDeepLinkStore
 *
 * Holds a single deep link target that arrived before the user was logged in.
 * RootNavigator reads and clears it after successful authentication.
 *
 * Covers:
 *   /ngo/{id}                → NgoProfile screen   (legacy numeric ID — backward compat)
 *   /ngo/{token}             → NgoProfile screen   (encrypted share token — v4.9+)
 *   /organisation/{slug}     → NgoProfile screen   (canonical web slug)
 *   /organisation/{token}    → NgoProfile screen   (encrypted share token)
 *   /opportunity/{id}        → ProjectDetail screen (legacy numeric ID — backward compat)
 *   /opportunity/{token}     → ProjectDetail screen (encrypted share token — v4.9+)
 *   /post/{token}            → PostDetail screen    (encrypted share token)
 *
 * (Invite links use pendingInviteStore — kept separate for clarity.)
 */

type DeepLinkTarget =
  | { type: 'ngo';     id: number    }  // legacy numeric ID (/ngo/42)
  | { type: 'project'; id: number    }  // legacy numeric ID (/opportunity/7)
  | { type: 'ngo';     token: string }  // encrypted share token (/ngo/ABC...)
  | { type: 'project'; token: string }  // encrypted share token (/opportunity/ABC...)
  | { type: 'post';    token: string }  // /post/{token} shared feed post
  | { type: 'ngo';     slug: string  }; // canonical org slug (/organisation/my-ngo)

let _pending: DeepLinkTarget | null = null;

export const pendingDeepLinkStore = {
  set:   (target: DeepLinkTarget) => { _pending = target; },
  get:   () => _pending,
  clear: () => { _pending = null; },
};
