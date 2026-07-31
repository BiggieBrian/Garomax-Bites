import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

/**
 * Every role except superadmin is permanently scoped to `currentUser.branch_id`.
 * Superadmin has no home branch (branch_id is null) but needs to operate the
 * *same* branch-scoped screens (AdminDashboard, StockMenuManager,
 * FixedAssetsManager) against a branch they pick at runtime.
 *
 * This context carries that "which branch am I acting on" override. When no
 * provider is present (the normal case — waiter/cook/admin), useActiveBranchId
 * falls back to the logged-in user's own branch_id, so existing behavior for
 * every non-superadmin role is unchanged.
 */
const BranchScopeContext = createContext<string | null | undefined>(undefined);

export const BranchScopeProvider: React.FC<{
  branchId: string | null;
  children: React.ReactNode;
}> = ({ branchId, children }) => (
  <BranchScopeContext.Provider value={branchId}>{children}</BranchScopeContext.Provider>
);

/**
 * Returns the branch id that branch-scoped screens should read and write
 * against right now: the override from BranchScopeProvider if one is in
 * scope, otherwise the current user's own branch_id.
 */
export const useActiveBranchId = (): string | null => {
  const { currentUser } = useAuth();
  const override = useContext(BranchScopeContext);
  return override !== undefined ? override : currentUser?.branch_id ?? null;
};