import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type AppStatus = 'pending' | 'under_review' | 'hold' | 'accepted' | 'rejected' | 'archived';

export interface ApplicationType {
  id: number;
  guildId: string;
  name: string;
  description: string;
  questions: string[];
  acceptanceRoleId: string | null;
  enabled: boolean;
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

const configuredPath = process.env.DATABASE_PATH ?? './data/pauze-applications.db';
const databasePath = path.resolve(configuredPath);
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
CREATE INDEX IF NOT EXISTS idx_applications_guild_user ON applications(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_applications_review ON applications(guild_id, status);
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

const now = () => new Date().toISOString();

export function setGuildConfig(guildId: string, reviewChannelId: string | null, reviewerRoleId: string | null, logChannelId: string | null = null) {
  db.prepare(`INSERT INTO guild_config (guild_id, review_channel_id, reviewer_role_id, log_channel_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET review_channel_id=excluded.review_channel_id, reviewer_role_id=excluded.reviewer_role_id, log_channel_id=excluded.log_channel_id, updated_at=CURRENT_TIMESTAMP`)
    .run(guildId, reviewChannelId, reviewerRoleId, logChannelId);
}

export function getGuildConfig(guildId: string) {
  return db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) as { guild_id: string; review_channel_id: string | null; reviewer_role_id: string | null; log_channel_id: string | null } | undefined;
}

export function createApplicationType(guildId: string, name: string, description: string, questions: string[], acceptanceRoleId: string | null) {
  const result = db.prepare('INSERT INTO application_types (guild_id, name, description, questions_json, acceptance_role_id) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, name, description, JSON.stringify(questions), acceptanceRoleId);
  return Number(result.lastInsertRowid);
}

export function getApplicationTypes(guildId: string): ApplicationType[] {
  const rows = db.prepare('SELECT * FROM application_types WHERE guild_id = ? ORDER BY id DESC').all(guildId) as any[];
  return rows.map(row => ({ ...row, questions: JSON.parse(row.questions_json), enabled: Boolean(row.enabled) }));
}

export function getApplicationType(id: number, guildId: string): ApplicationType | undefined {
  const row = db.prepare('SELECT * FROM application_types WHERE id = ? AND guild_id = ?').get(id, guildId) as any;
  return row ? { ...row, questions: JSON.parse(row.questions_json), enabled: Boolean(row.enabled) } : undefined;
}

export function hasActiveApplication(guildId: string, userId: string, typeId: number) {
  const row = db.prepare(`SELECT id FROM applications WHERE guild_id=? AND user_id=? AND type_id=? AND status IN ('pending','under_review','hold') LIMIT 1`).get(guildId, userId, typeId);
  return Boolean(row);
}

export function createApplication(guildId: string, typeId: number, userId: string, answers: string[]) {
  const publicId = `A-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  const timestamp = now();
  const result = db.prepare(`INSERT INTO applications (public_id,guild_id,type_id,user_id,answers_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(publicId, guildId, typeId, userId, JSON.stringify(answers), timestamp, timestamp);
  return getApplication(Number(result.lastInsertRowid))!;
}

export function getApplication(id: number): ApplicationRecord | undefined {
  const row = db.prepare('SELECT * FROM applications WHERE id=?').get(id) as any;
  return row ? { ...row, answers: JSON.parse(row.answers_json) } : undefined;
}

export function updateApplication(id: number, patch: Partial<Pick<ApplicationRecord, 'status' | 'reviewerId' | 'notes'>>) {
  const current = getApplication(id);
  if (!current) return undefined;
  const status = patch.status ?? current.status;
  const reviewerId = patch.reviewerId ?? current.reviewerId;
  const notes = patch.notes ?? current.notes;
  db.prepare('UPDATE applications SET status=?, reviewer_id=?, notes=?, updated_at=? WHERE id=?').run(status, reviewerId, notes, now(), id);
  return getApplication(id);
}

export function addAudit(guildId: string, applicationId: number, actorId: string, action: string, details = '') {
  db.prepare('INSERT INTO audit_logs (guild_id, application_id, actor_id, action, details) VALUES (?,?,?,?,?)').run(guildId, applicationId, actorId, action, details);
}
