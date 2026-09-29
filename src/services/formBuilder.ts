// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export type FormQuestionType =
  | "short"
  | "paragraph"
  | "number"
  | "choice"
  | "checkbox";

export interface FormCondition {
  questionId: string;
  equals: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  choices: string[];
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  pattern: string | null;
  condition: FormCondition | null;
}

const MAX_QUESTIONS = 15;
const MAX_CHOICES = 25;

function ensureSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS form_questions (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      application_type_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 1,
      choices_json TEXT NOT NULL DEFAULT '[]',
      min_length INTEGER,
      max_length INTEGER,
      min_value REAL,
      max_value REAL,
      pattern TEXT,
      condition_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(application_type_id, position),
      UNIQUE(application_type_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_form_questions_type
      ON form_questions(guild_id, application_type_id, position);
  `);
}

function normalizeType(type: string): FormQuestionType {
  return ["short", "paragraph", "number", "choice", "checkbox"].includes(type)
    ? type as FormQuestionType
    : "paragraph";
}

function normalizeQuestion(row: any): FormQuestion {
  let choices: string[] = [];
  let condition: FormCondition | null = null;

  try {
    const parsed = JSON.parse(String(row.choices_json ?? "[]"));
    if (Array.isArray(parsed)) choices = parsed.map(String).slice(0, MAX_CHOICES);
  } catch {
    choices = [];
  }

  try {
    const parsed = row.condition_json
      ? JSON.parse(String(row.condition_json))
      : null;
    if (parsed?.questionId && typeof parsed.equals === "string") {
      condition = {
        questionId: String(parsed.questionId),
        equals: parsed.equals,
      };
    }
  } catch {
    condition = null;
  }

  return {
    id: String(row.id),
    label: String(row.label),
    type: normalizeType(String(row.type)),
    required: Boolean(row.required),
    choices,
    minLength: row.min_length == null ? null : Number(row.min_length),
    maxLength: row.max_length == null ? null : Number(row.max_length),
    minValue: row.min_value == null ? null : Number(row.min_value),
    maxValue: row.max_value == null ? null : Number(row.max_value),
    pattern: row.pattern ? String(row.pattern) : null,
    condition,
  };
}

export function initializeFormBuilder(): void {
  ensureSchema();
}

export function listFormQuestions(
  guildId: string,
  applicationTypeId: number,
): FormQuestion[] {
  ensureSchema();
  const rows = db.prepare(`
    SELECT *
    FROM form_questions
    WHERE guild_id = ? AND application_type_id = ?
    ORDER BY position ASC
  `).all(guildId, applicationTypeId) as any[];

  return rows.map(normalizeQuestion);
}

export function getFormQuestion(
  guildId: string,
  applicationTypeId: number,
  questionId: string,
): FormQuestion | undefined {
  ensureSchema();
  const row = db.prepare(`
    SELECT *
    FROM form_questions
    WHERE guild_id = ? AND application_type_id = ? AND id = ?
  `).get(guildId, applicationTypeId, questionId) as any;

  return row ? normalizeQuestion(row) : undefined;
}

export interface CreateFormQuestionInput {
  label: string;
  type: FormQuestionType;
  required?: boolean;
  choices?: string[];
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
  condition?: FormCondition | null;
  id?: string;
  position?: number;
}

function validateQuestionInput(input: CreateFormQuestionInput): void {
  if (!input.label.trim()) throw new Error("Question label cannot be empty.");
  if (input.label.trim().length > 100) throw new Error("Question label must be 100 characters or fewer.");

  const choices = input.choices ?? [];
  if (choices.length > MAX_CHOICES) throw new Error(`A question can have at most ${MAX_CHOICES} choices.`);
  if (["choice", "checkbox"].includes(input.type) && choices.length < 1) {
    throw new Error("Choice and checkbox questions need at least one choice.");
  }
  if (choices.some(choice => !choice.trim() || choice.length > 100)) {
    throw new Error("Choices must be non-empty and 100 characters or fewer.");
  }

  if (input.minLength != null && input.maxLength != null && input.minLength > input.maxLength) {
    throw new Error("Minimum length cannot be greater than maximum length.");
  }
  if (input.minValue != null && input.maxValue != null && input.minValue > input.maxValue) {
    throw new Error("Minimum value cannot be greater than maximum value.");
  }
  if (input.pattern) {
    try {
      new RegExp(input.pattern);
    } catch {
      throw new Error("The supplied validation pattern is not a valid regular expression.");
    }
  }
}

export function createFormQuestion(
  guildId: string,
  applicationTypeId: number,
  input: CreateFormQuestionInput,
): FormQuestion {
  ensureSchema();
  validateQuestionInput(input);

  const count = Number(
    db.prepare(`SELECT COUNT(*) AS count FROM form_questions WHERE guild_id = ? AND application_type_id = ?`)
      .get(guildId, applicationTypeId).count,
  );

  if (count >= MAX_QUESTIONS) {
    throw new Error(`An application form can have at most ${MAX_QUESTIONS} questions.`);
  }

  const id = input.id?.trim() || `q_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const position = Math.min(
    Math.max(input.position ?? count, 0),
    count,
  );

  db.prepare(`
    UPDATE form_questions
    SET position = position + 1
    WHERE guild_id = ? AND application_type_id = ? AND position >= ?
  `).run(guildId, applicationTypeId, position);

  try {
    db.prepare(`
      INSERT INTO form_questions (
        id, guild_id, application_type_id, position, label, type, required,
        choices_json, min_length, max_length, min_value, max_value, pattern, condition_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      guildId,
      applicationTypeId,
      position,
      input.label.trim(),
      normalizeType(input.type),
      input.required === false ? 0 : 1,
      JSON.stringify((input.choices ?? []).map(choice => choice.trim())),
      input.minLength ?? null,
      input.maxLength ?? null,
      input.minValue ?? null,
      input.maxValue ?? null,
      input.pattern ?? null,
      input.condition ? JSON.stringify(input.condition) : null,
    );
  } catch (error) {
    db.prepare(`
      UPDATE form_questions
      SET position = position - 1
      WHERE guild_id = ? AND application_type_id = ? AND position > ?
    `).run(guildId, applicationTypeId, position);
    throw error;
  }

  return getFormQuestion(guildId, applicationTypeId, id)!;
}

export function updateFormQuestion(
  guildId: string,
  applicationTypeId: number,
  questionId: string,
  input: CreateFormQuestionInput,
): FormQuestion {
  ensureSchema();
  validateQuestionInput(input);

  const existing = getFormQuestion(guildId, applicationTypeId, questionId);
  if (!existing) throw new Error("Question not found.");

  db.prepare(`
    UPDATE form_questions
    SET label = ?, type = ?, required = ?, choices_json = ?, min_length = ?, max_length = ?,
        min_value = ?, max_value = ?, pattern = ?, condition_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = ? AND application_type_id = ? AND id = ?
  `).run(
    input.label.trim(),
    normalizeType(input.type),
    input.required === false ? 0 : 1,
    JSON.stringify((input.choices ?? []).map(choice => choice.trim())),
    input.minLength ?? null,
    input.maxLength ?? null,
    input.minValue ?? null,
    input.maxValue ?? null,
    input.pattern ?? null,
    input.condition ? JSON.stringify(input.condition) : null,
    guildId,
    applicationTypeId,
    questionId,
  );

  return getFormQuestion(guildId, applicationTypeId, questionId)!;
}

export function removeFormQuestion(
  guildId: string,
  applicationTypeId: number,
  questionId: string,
): boolean {
  ensureSchema();
  const existing = getFormQuestion(guildId, applicationTypeId, questionId);
  if (!existing) return false;

  const row = db.prepare(`SELECT position FROM form_questions WHERE guild_id = ? AND application_type_id = ? AND id = ?`)
    .get(guildId, applicationTypeId, questionId) as { position: number };

  db.prepare(`DELETE FROM form_questions WHERE guild_id = ? AND application_type_id = ? AND id = ?`)
    .run(guildId, applicationTypeId, questionId);

  db.prepare(`
    UPDATE form_questions
    SET position = position - 1
    WHERE guild_id = ? AND application_type_id = ? AND position > ?
  `).run(guildId, applicationTypeId, row.position);

  return true;
}

export function reorderFormQuestion(
  guildId: string,
  applicationTypeId: number,
  questionId: string,
  targetPosition: number,
): boolean {
  ensureSchema();
  const row = db.prepare(`SELECT position FROM form_questions WHERE guild_id = ? AND application_type_id = ? AND id = ?`)
    .get(guildId, applicationTypeId, questionId) as { position: number } | undefined;
  if (!row) return false;

  const count = Number(db.prepare(`SELECT COUNT(*) AS count FROM form_questions WHERE guild_id = ? AND application_type_id = ?`).get(guildId, applicationTypeId).count);
  const target = Math.min(Math.max(Math.floor(targetPosition), 0), Math.max(count - 1, 0));
  if (target === row.position) return true;

  const tx = db.transaction(() => {
    if (target < row.position) {
      db.prepare(`UPDATE form_questions SET position = position + 1 WHERE guild_id = ? AND application_type_id = ? AND position >= ? AND position < ?`)
        .run(guildId, applicationTypeId, target, row.position);
    } else {
      db.prepare(`UPDATE form_questions SET position = position - 1 WHERE guild_id = ? AND application_type_id = ? AND position > ? AND position <= ?`)
        .run(guildId, applicationTypeId, row.position, target);
    }
    db.prepare(`UPDATE form_questions SET position = ? WHERE guild_id = ? AND application_type_id = ? AND id = ?`)
      .run(target, guildId, applicationTypeId, questionId);
  });

  tx();
  return true;
}

export function getVisibleFormQuestions(
  questions: FormQuestion[],
  answers: string[],
): FormQuestion[] {
  return questions.filter(question => {
    if (!question.condition) return true;
    const dependencyIndex = questions.findIndex(item => item.id === question.condition!.questionId);
    if (dependencyIndex < 0) return false;
    return answers[dependencyIndex] === question.condition.equals;
  });
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateFormAnswer(
  question: FormQuestion,
  answer: string,
): ValidationResult {
  const value = answer.trim();

  if (question.required && !value) {
    return { valid: false, message: `**${question.label}** is required.` };
  }
  if (!value) return { valid: true };

  if (question.type === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { valid: false, message: `**${question.label}** must be a valid number.` };
    }
    if (question.minValue != null && numeric < question.minValue) {
      return { valid: false, message: `**${question.label}** must be at least ${question.minValue}.` };
    }
    if (question.maxValue != null && numeric > question.maxValue) {
      return { valid: false, message: `**${question.label}** must be at most ${question.maxValue}.` };
    }
  }

  if (question.minLength != null && value.length < question.minLength) {
    return { valid: false, message: `**${question.label}** must be at least ${question.minLength} characters.` };
  }
  if (question.maxLength != null && value.length > question.maxLength) {
    return { valid: false, message: `**${question.label}** must be at most ${question.maxLength} characters.` };
  }

  if (question.pattern) {
    let matched = false;
    try {
      matched = new RegExp(question.pattern).test(value);
    } catch {
      return { valid: false, message: `**${question.label}** has an invalid validation rule configured.` };
    }
    if (!matched) {
      return { valid: false, message: `**${question.label}** does not match the required format.` };
    }
  }

  if (["choice", "checkbox"].includes(question.type)) {
    const selected = question.type === "checkbox"
      ? value.split("|").map(item => item.trim()).filter(Boolean)
      : [value];
    if (selected.some(item => !question.choices.includes(item))) {
      return { valid: false, message: `**${question.label}** contains an invalid selection.` };
    }
  }

  return { valid: true };
}
