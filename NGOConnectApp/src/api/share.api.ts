import apiClient from './apiClient';
import { ApiResponse } from '../types/api.types';

// ── Response types ────────────────────────────────────────────────────────────

/** Returned by GET /api/v1/share/token */
export interface ShareTokenData {
  token:      string;   // AES-256-GCM encrypted URL-safe Base64 token
  url:        string;   // Full shareable URL e.g. https://ripplehub.app/ngo/abc...
  entityType: string;   // 'ORG' | 'OPP'
  entityId:   number;
}

/** Returned by GET /api/v1/public/resolve/{token} */
export interface ResolvedToken {
  entityType: string;   // 'ORG' | 'OPP'
  entityId:   number;
}

/** Entity type codes accepted by the share API */
export type ShareEntityType = 'ORG' | 'OPP';

// ── API ───────────────────────────────────────────────────────────────────────

export const shareApi = {
  /**
   * Generates an encrypted share token + URL for the given entity.
   * Requires auth. Fast (crypto only — no DB call on the server).
   *
   * @param type   Entity type: 'ORG' (organisation) or 'OPP' (opportunity/project)
   * @param id     Numeric DB primary key
   */
  getToken: (type: ShareEntityType, id: number) =>
    apiClient.get<ApiResponse<ShareTokenData>>('/share/token', {
      params: { type, id },
    }),

  /**
   * Decrypts a share token without authentication.
   * Returns the entity type and numeric ID.
   * Used by the mobile deep-link handler to resolve an encrypted URL
   * into a screen + params for navigation.
   *
   * @param token  URL-safe Base64 token from the share URL path segment
   */
  resolveToken: (token: string) =>
    apiClient.get<ApiResponse<ResolvedToken>>(`/public/resolve/${encodeURIComponent(token)}`),
};
