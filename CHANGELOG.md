Copyright (c) 2026 Aarav Singh / PauzeDevs

# Changelog

All notable changes to Pauze Applications are documented here.

## [Unreleased]

The next edge-platform work is still planned and will be implemented behind working handlers rather than placeholder commands.

- 🧩 Visual application builder
- 🧱 Multi-step and multi-page forms
- 🔘 Choice, number, URL and validation question types
- 📎 Attachment/file-response support where Discord permits it
- 👥 Multi-reviewer voting and decision thresholds
- 💬 Applicant/staff conversation flow
- 🎤 Interview stage and interview scheduling hooks
- 🔁 Re-open, appeal and resubmission workflows
- ⚙️ Configurable accept/reject/hold automation
- ⏰ Delayed workflow actions
- 📊 Funnel, acceptance-rate and review-time analytics
- 📤 CSV/data export
- 🌐 Web dashboard/API

## 1.1.0

Expanded the application workflow so applicant and reviewer command paths are usable from Discord.

### Added

- 👤 /application status
- 🗂️ /application history
- 🛡️ /application queue
- 🔎 /application search
- 📄 /application view
- 📌 /application decide
- 👤 /application assign
- 🗄️ /application archive
- 📝 /application note
- 📊 Application statistics query support in the database layer
- 🔍 Guild-scoped application lookup by public ID
- 🔍 Applicant history and review-queue queries
- 🧭 Application resolution by public ID or internal numeric ID

### Fixed

- 🔐 Applicant commands are no longer blocked by the root Manage Server permission.
- 🧱 Final applications can now be archived safely.
- 🛑 Invalid state transitions are rejected by the domain service.
- 🔒 Review actions remain guild-scoped.
- 🧹 Final review messages lock every review control, including Notes.
- 🧯 Submission now validates the review destination before persisting an application.
- 🆔 Application IDs use a UUID-backed suffix to reduce collision risk.
- 🎭 Acceptance-role assignment checks bot role hierarchy before attempting assignment.

### Developer experience

- 🧾 Standardized Aarav Singh / PauzeDevs copyright headers across source files.
- 🧪 Added GitHub Actions type-check and build verification.
- 🧰 Added an npm check script for local validation.

## 1.0.0

Initial Pauze Applications foundation.

- 📋 Application panels
- 📝 Discord modal forms
- 🗂️ Multiple application types
- 🛡️ Reviewer workflow
- ✅ Accept / ❌ Reject / ⏳ Hold / 👤 Claim / 📝 Notes
- 🔔 Applicant notifications
- 🎭 Acceptance-role automation
- 📜 Audit logging
- 💾 SQLite persistence
- 📄 MIT License
