// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type AppStatus =
  | 'pending'
  | 'under_review'
  | 'hold'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export interface ApplicationType {
  id: number;
  guildId: string;
  name: string;
  description: string;
  questions: string[];
  acceptanceRoleId: string | null;
  enabled: boolean;
  acceptedMessage: string;
  rejectedMessage: string;
  holdMessage: string;
  withdrawnMessage: string;
  reviewMode: 'single' | 'vote';
  approvalThreshold: number;
}


export interface ApplicationRecord {
  id: number;
  publicId: string;
  guildId: string;
  typeId: number;
  userId: string;
  answers: string[];
  status: AppStatus;
  reviewerId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationSearchResult extends ApplicationRecord {
  typeName: string;
}

export interface ApplicationStats {
  total: number;
  pending: number;
  underReview: number;
  hold: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  archived: number;
}

const databaseSetting = process.env.DATABASE_PATH ?? './data/pauze-applications.db';
const databasePath = path.resolve(databaseSetting);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    review_channel_id TEXT,
    reviewer_role_id TEXT,
    log_channel_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS application_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    acceptance_role_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE(guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    guild_id TEXT NOT NULL,
    type_id INTEGER NOT NULL REFERENCES application_types(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_applications_guild_user
    ON applications(guild_id, user_id);

  CREATE INDEX IF NOT EXISTS idx_applications_review
    ON applications(guild_id, status);

  CREATE INDEX IF NOT EXISTS idx_applications_public_id
    ON applications(guild_id, public_id);

  CREATE TABLE IF NOT EXISTS application_votes (
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    vote TEXT NOT NULL CHECK (vote IN ('accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (application_id, reviewer_id)
  );

  CREATE INDEX IF NOT EXISTS idx_application_votes_application
    ON application_votes(application_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    application_id INTEGER,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applicationTypeColumns = db
  .prepare('PRAGMA table_info(application_types)')
  .all() as { name: string }[];

const existingApplicationTypeColumns = new Set(
  applicationTypeColumns.map(column => column.name),
);

const applicationTypeMigrations = [
  ['accepted_message', "Your application {id} has been accepted. 🎉"],
  ['rejected_message', "Your application {id} has been rejected."],
  ['hold_message', "Your application {id} has been placed on hold. ⏳"],
  ['withdrawn_message', "Your application {id} has been withdrawn. ⚪"],
  ['review_mode', 'single'],
  ['approval_threshold', '1'],
] as const;

for (const [column, defaultValue] of applicationTypeMigrations) {
  if (!existingApplicationTypeColumns.has(column)) {
    db.prepare(
      'ALTER TABLE application_types ADD COLUMN ' +
      column +
      " TEXT NOT NULL DEFAULT '" +
      defaultValue.replace(/'/g, "''") +
      "'",
    ).run();
  }
}



const now = () => new Date().toISOString();

function toApplication(row: any): ApplicationRecord {
  return {
    id: Number(row.id),
    publicId: String(row.public_id),
    guildId: String(row.guild_id),
    typeId: Number(row.type_id),
    userId: String(row.user_id),
    answers: JSON.parse(row.answers_json),
    status: row.status as AppStatus,
    reviewerId: row.reviewer_id ? String(row.reviewer_id) : null,
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toSearchResult(row: any): ApplicationSearchResult {
  return {
    ...toApplication(row),
    typeName: String(row.type_name),
  };
}

export function setGuildConfig(
  guildId: string,
  reviewChannelId: string | null,
  reviewerRoleId: string | null,
  logChannelId: string | null = null,
) {
  db.prepare(`
    INSERT INTO guild_config (
      guild_id,
      review_channel_id,
      reviewer_role_id,
      log_channel_id
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      review_channel_id = excluded.review_channel_id,
      reviewer_role_id = excluded.reviewer_role_id,
      log_channel_id = excluded.log_channel_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId, reviewChannelId, reviewerRoleId, logChannelId);
}

export function getGuildConfig(guildId: string) {
  return db.prepare(`
    SELECT guild_id, review_channel_id, reviewer_role_id, log_channel_id
    FROM guild_config
    WHERE guild_id = ?
  `).get(guildId) as {
    guild_id: string;
    review_channel_id: string | null;
    reviewer_role_id: string | null;
    log_channel_id: string | null;
  } | undefined;
}

export function createApplicationType(
  guildId: string,
  name: string,
  description: string,
  questions: string[],
  acceptanceRoleId: string | null,
) {
  const result = db.prepare(`
    INSERT INTO application_types (
      guild_id,
      name,
      description,
      questions_json,
      acceptance_role_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    guildId,
    name,
    description,
    JSON.stringify(questions),
    acceptanceRoleId,
  );

  return Number(result.lastInsertRowid);
}

export function getApplicationTypes(guildId: string): ApplicationType[] {
  const rows = db.prepare(`
    SELECT *
    FROM application_types
    WHERE guild_id = ?
    ORDER BY id DESC
  `).all(guildId) as any[];

  return rows.map(row => ({
    id: Number(row.id),
    guildId: String(row.guild_id),
    name: String(row.name),
    description: String(row.description),
    questions: JSON.parse(row.questions_json),
    acceptanceRoleId: row.acceptance_role_id ? String(row.acceptance_role_id) : null,
    enabled: Boolean(row.enabled),
    acceptedMessage: String(row.accepted_message ?? ''),
    rejectedMessage: String(row.rejected_message ?? ''),
    holdMessage: String(row.hold_message ?? ''),
    withdrawnMessage: String(row.withdrawn_message ?? ''),
    reviewMode: row.review_mode === 'vote' ? 'vote' : 'single',
    approvalThreshold: Math.max(1, Number(row.approval_threshold ?? 1)),
  }));
}

export function getApplicationType(
  id: number,
  guildId: string,
): ApplicationType | undefined {
  const row = db.prepare(`
    SELECT *
    FROM application_types
    WHERE id = ? AND guild_id = ?
  `).get(id, guildId) as any;

  if (!row) return undefined;

  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    name: String(row.name),
    description: String(row.description),
    questions: JSON.parse(row.questions_json),
    acceptanceRoleId: row.acceptance_role_id ? String(row.acceptance_role_id) : null,
    enabled: Boolean(row.enabled),
    acceptedMessage: String(row.accepted_message ?? ''),
    rejectedMessage: String(row.rejected_message ?? ''),
    holdMessage: String(row.hold_message ?? ''),
    withdrawnMessage: String(row.withdrawn_message ?? ''),
    reviewMode: row.review_mode === 'vote' ? 'vote' : 'single',
    approvalThreshold: Math.max(1, Number(row.approval_threshold ?? 1)),
  };
}

export function hasActiveApplication(
  guildId: string,
  userId: string,
  typeId: number,
) {
  const row = db.prepare(`
    SELECT id
    FROM applications
    WHERE guild_id = ?
      AND user_id = ?
      AND type_id = ?
      AND status IN ('pending', 'under_review', 'hold')
    LIMIT 1
  `).get(guildId, userId, typeId);

  return Boolean(row);
}

export function createApplication(
  guildId: string,
  typeId: number,
  userId: string,
  answers: string[],
) {
  const publicId = `A-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const timestamp = now();

  const result = db.prepare(`
    INSERT INTO applications (
      public_id,
      guild_id,
      type_id,
      user_id,
      answers_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    publicId,
    guildId,
    typeId,
    userId,
    JSON.stringify(answers),
    timestamp,
    timestamp,
  );

  return getApplication(Number(result.lastInsertRowid))!;
}

export function getApplication(id: number): ApplicationRecord | undefined {
  const row = db.prepare(`
    SELECT *
    FROM applications
    WHERE id = ?
  `).get(id) as any;

  return row ? toApplication(row) : undefined;
}

export function getApplicationByPublicId(
  guildId: string,
  publicId: string,
): ApplicationRecord | undefined {
  const row = db.prepare(`
    SELECT *
    FROM applications
    WHERE guild_id = ? AND UPPER(public_id) = UPPER(?)
    LIMIT 1
  `).get(guildId, publicId.trim()) as any;

  return row ? toApplication(row) : undefined;
}

export function getLatestApplicationForUser(
  guildId: string,
  userId: string,
): ApplicationRecord | undefined {
  const row = db.prepare(`
    SELECT *
    FROM applications
    WHERE guild_id = ? AND user_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(guildId, userId) as any;

  return row ? toApplication(row) : undefined;
}

export function getUserApplications(
  guildId: string,
  userId: string,
  limit = 10,
): ApplicationRecord[] {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25);

  const rows = db.prepare(`
    SELECT *
    FROM applications
    WHERE guild_id = ? AND user_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ${safeLimit}
  `).all(guildId, userId) as any[];

  return rows.map(toApplication);
}

export function getReviewQueue(
  guildId: string,
  status?: Extract<AppStatus, 'pending' | 'under_review' | 'hold'>,
  limit = 10,
): ApplicationSearchResult[] {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25);

  const rows = status
    ? db.prepare(`
        SELECT
          a.*,
          t.name AS type_name
        FROM applications a
        INNER JOIN application_types t ON t.id = a.type_id
        WHERE a.guild_id = ? AND a.status = ?
        ORDER BY datetime(a.created_at) ASC, a.id ASC
        LIMIT ${safeLimit}
      `).all(guildId, status)
    : db.prepare(`
        SELECT
          a.*,
          t.name AS type_name
        FROM applications a
        INNER JOIN application_types t ON t.id = a.type_id
        WHERE a.guild_id = ?
          AND a.status IN ('pending', 'under_review', 'hold')
        ORDER BY
          CASE a.status
            WHEN 'pending' THEN 0
            WHEN 'under_review' THEN 1
            WHEN 'hold' THEN 2
            ELSE 3
          END,
          datetime(a.created_at) ASC,
          a.id ASC
        LIMIT ${safeLimit}
      `).all(guildId) as any[];

  return rows.map(toSearchResult);
}

export function searchApplications(
  guildId: string,
  query: string,
  limit = 20,
): ApplicationSearchResult[] {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25);
  const cleaned = query.trim();

  if (!cleaned) return [];

  const rows = db.prepare(`
    SELECT
      a.*,
      t.name AS type_name
    FROM applications a
    INNER JOIN application_types t ON t.id = a.type_id
    WHERE a.guild_id = ?
      AND (
        UPPER(a.public_id) LIKE UPPER(?)
        OR a.user_id = ?
      )
    ORDER BY datetime(a.created_at) DESC, a.id DESC
    LIMIT ${safeLimit}
  `).all(guildId, `%${cleaned}%`, cleaned) as any[];

  return rows.map(toSearchResult);
}

export function updateApplication(
  id: number,
  patch: Partial<Pick<ApplicationRecord, 'status' | 'reviewerId' | 'notes'>>,
) {
  const current = getApplication(id);
  if (!current) return undefined;

  const status = patch.status ?? current.status;
  const reviewerId = patch.reviewerId ?? current.reviewerId;
  const notes = patch.notes ?? current.notes;

  db.prepare(`
    UPDATE applications
    SET
      status = ?,
      reviewer_id = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(status, reviewerId, notes, now(), id);

  return getApplication(id);
}

export function setApplicationTypeEnabled(
  guildId: string,
  typeId: number,
  enabled: boolean,
): boolean {
  const result = db.prepare(
    'UPDATE application_types SET enabled = ? WHERE id = ? AND guild_id = ?',
  ).run(enabled ? 1 : 0, typeId, guildId);

  return result.changes > 0;
}

export type ReviewMode = 'single' | 'vote';
export type ApplicationVote = 'accepted' | 'rejected';

export interface ApplicationVoteSummary {
  accepted: number;
  rejected: number;
  total: number;
}

export function setApplicationVoting(
  guildId: string,
  typeId: number,
  mode: ReviewMode,
  threshold: number,
): boolean {
  const type = getApplicationType(typeId, guildId);
  if (!type) return false;

  const safeThreshold = Math.min(
    Math.max(Math.floor(threshold), 1),
    10,
  );

  db.prepare(
    'UPDATE application_types SET review_mode = ?, approval_threshold = ? WHERE id = ? AND guild_id = ?',
  ).run(mode, safeThreshold, typeId, guildId);

  return true;
}

export function recordApplicationVote(
  applicationId: number,
  reviewerId: string,
  vote: ApplicationVote,
): boolean {
  const result = db.prepare(
    'INSERT INTO application_votes (application_id, reviewer_id, vote) VALUES (?, ?, ?) ' +
    'ON CONFLICT(application_id, reviewer_id) DO UPDATE SET vote = excluded.vote, created_at = CURRENT_TIMESTAMP',
  ).run(applicationId, reviewerId, vote);

  return result.changes > 0;
}

export function getApplicationVoteSummary(
  applicationId: number,
): ApplicationVoteSummary {
  const rows = db.prepare(
    'SELECT vote, COUNT(*) AS count FROM application_votes WHERE application_id = ? GROUP BY vote',
  ).all(applicationId) as { vote: ApplicationVote; count: number }[];

  const summary: ApplicationVoteSummary = {
    accepted: 0,
    rejected: 0,
    total: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    summary.total += count;

    if (row.vote === 'accepted') {
      summary.accepted = count;
    } else {
      summary.rejected = count;
    }
  }

  return summary;
}

export type ApplicationMessageStatus =
  | 'accepted'
  | 'rejected'
  | 'hold'
  | 'withdrawn';

export function setApplicationMessage(
  guildId: string,
  typeId: number,
  status: ApplicationMessageStatus,
  message: string,
): boolean {
  const columns: Record<ApplicationMessageStatus, string> = {
    accepted: 'accepted_message',
    rejected: 'rejected_message',
    hold: 'hold_message',
    withdrawn: 'withdrawn_message',
  };

  const type = getApplicationType(typeId, guildId);
  if (!type) return false;

  db.prepare(
    'UPDATE application_types SET ' +
    columns[status] +
    ' = ? WHERE id = ? AND guild_id = ?',
  ).run(message.trim(), typeId, guildId);

  return true;
}

export interface ApplicationAnalytics {
  total: number;
  active: number;
  pending: number;
  underReview: number;
  hold: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  archived: number;
  acceptanceRate: number;
  decisionCount: number;
}

export function getApplicationAnalytics(
  guildId: string,
): ApplicationAnalytics {
  const stats = getApplicationStats(guildId);
  const decisionCount = stats.accepted + stats.rejected;
  const acceptanceRate =
    decisionCount === 0
      ? 0
      : Number(
          ((stats.accepted / decisionCount) * 100).toFixed(1),
        );

  return {
    total: stats.total,
    active:
      stats.pending +
      stats.underReview +
      stats.hold,
    pending: stats.pending,
    underReview: stats.underReview,
    hold: stats.hold,
    accepted: stats.accepted,
    rejected: stats.rejected,
    withdrawn: stats.withdrawn,
    archived: stats.archived,
    acceptanceRate,
    decisionCount,
  };
}

export function getApplicationStats(guildId: string): ApplicationStats {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM applications
    WHERE guild_id = ?
    GROUP BY status
  `).all(guildId) as { status: AppStatus; count: number }[];

  const stats: ApplicationStats = {
    total: 0,
    pending: 0,
    underReview: 0,
    hold: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    archived: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    stats.total += count;

    switch (row.status) {
      case 'pending':
        stats.pending = count;
        break;
      case 'under_review':
        stats.underReview = count;
        break;
      case 'hold':
        stats.hold = count;
        break;
      case 'accepted':
        stats.accepted = count;
        break;
      case 'rejected':
        stats.rejected = count;
        break;
      case 'withdrawn':
        stats.withdrawn = count;
        break;
      case 'archived':
        stats.archived = count;
        break;
    }
  }

  return stats;
}

export function addAudit(
  guildId: string,
  applicationId: number,
  actorId: string,
  action: string,
  details = '',
) {
  db.prepare(`
    INSERT INTO audit_logs (
      guild_id,
      application_id,
      actor_id,
      action,
      details
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, applicationId, actorId, action, details);
}
