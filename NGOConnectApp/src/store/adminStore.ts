import { create } from 'zustand';
import type { Organisation } from '../types/api.types';

interface AdminState {
  /** All orgs where the user is FOUNDER or ADMIN */
  adminOrgs: Organisation[];
  /** Currently selected org for all admin screens */
  selectedOrg: Organisation | null;

  /**
   * The user's currently active org across ALL volunteer screens
   * (Home, Community, Explore etc.). Set by HomeScreen when the user
   * picks an org or when orgs first load. CommunityScreen reads this
   * when no orgId comes from route params.
   */
  activeOrg: Organisation | null;

  setAdminOrgs: (orgs: Organisation[]) => void;
  setSelectedOrg: (org: Organisation) => void;
  setActiveOrg: (org: Organisation | null) => void;
  clearAdmin: () => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  adminOrgs:   [],
  selectedOrg: null,
  activeOrg:   null,

  setAdminOrgs: (orgs) =>
    set((s) => ({
      adminOrgs:   orgs,
      // Keep selected if still in list; otherwise default to first
      selectedOrg: orgs.find((o) => o.orgId === s.selectedOrg?.orgId) ?? orgs[0] ?? null,
    })),

  setSelectedOrg: (org) => set({ selectedOrg: org }),

  setActiveOrg: (org) => set({ activeOrg: org }),

  clearAdmin: () => set({ adminOrgs: [], selectedOrg: null, activeOrg: null }),
}));
