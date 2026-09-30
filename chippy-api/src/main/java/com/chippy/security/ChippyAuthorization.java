package com.chippy.security;

/**
 * Authorization seam. Phase 1 permits every action.
 * A later sign-in replaces {@link PermitAllAuthorization} without changing callers.
 */
public interface ChippyAuthorization {
    boolean canAccess(String action);
}
