// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import type { AppStatus, ApplicationRecord, ApplicationType } from '../db.js';
import {
  addAudit,
  getApplication,
  getApplicationType,
  getApplicationTypes,
  hasActiveApplication,
  updateApplication,
} from '../db.js';

/**
 * Small domain helpers live here instead of inside the Discord event listener.
 * Keeping Discord-specific code out of the service layer makes future dashboard
 * and API integrations much easier to add without duplicating business rules.
 */
export const FINAL_STATUSES: readonly AppStatus[] = ['accepted', 'rejected', 'archived'];
export const ACTIVE_STATUSES: readonly AppStatus[] = ['pending', 'under_review', 'hold'];

export function canSubmitApplication(guildId: string, userId: string, typeId: number): boolean {
  return !hasActiveApplication(guildId, userId, typeId);
}

export function canTransition(from: AppStatus, to: AppStatus): boolean {
  if (from === to) return true;
  if (FINAL_STATUSES.includes(from)) return false;

  const transitions: Record<AppStatus, readonly AppStatus[]> = {
    pending: ['under_review', 'hold', 'accepted', 'rejected', 'archived'],
    under_review: ['pending', 'hold', 'accepted', 'rejected', 'archived'],
    hold: ['pending', 'under_review', 'accepted', 'rejected', 'archived'],
    accepted: [],
    rejected: [],
    archived: [],
  };

  return transitions[from].includes(to);
}

export function transitionApplication(
  applicationId: number,
  status: AppStatus,
  reviewerId: string | null,
  details = '',
): ApplicationRecord | undefined {
  const current = getApplication(applicationId);
  if (!current || !canTransition(current.status, status)) return undefined;

  const updated = updateApplication(applicationId, {
    status,
    reviewerId: reviewerId ?? current.reviewerId,
  });

  if (updated) {
    addAudit(updated.guildId, updated.id, reviewerId ?? updated.userId, `status_${status}`, details);
  }

  return updated;
}

export function getEnabledApplicationTypes(guildId: string): ApplicationType[] {
  return getApplicationTypes(guildId).filter(type => type.enabled);
}

export function getApplicationSummary(applicationId: number) {
  const application = getApplication(applicationId);
  if (!application) return undefined;

  const type = getApplicationType(application.typeId, application.guildId);
  return {
    application,
    type,
    isActive: ACTIVE_STATUSES.includes(application.status),
    isFinal: FINAL_STATUSES.includes(application.status),
  };
}
