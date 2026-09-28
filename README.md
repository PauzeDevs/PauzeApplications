# Pauze Applications

A clean, modular Discord application-management bot inspired by the familiar workflow of established application bots, with a polished PauzeX-style interface.

> **Pauze Applications — applications, without the clutter.**

## Status

**Version:** `1.2.0` · **License:** MIT · **Runtime:** Node.js 20+

The current `main` branch contains the initial working release foundation plus UI/review-flow improvements. It is suitable for development/testing; production deployment should be tested against the target server first.

## Features

### Applicant experience

- Clean PauzeX-style application selection panel.
- `/application apply` as a native applicant entry point.
- Modal-based application forms.
- Up to five required questions per application type.
- Unique application IDs.
- Duplicate active-application protection.
- Private submission confirmation.
- Applicant status lookup.
- Personal application history.
- Applicant DM notifications when status changes.
- Applicant-controlled withdrawal of active applications.
- Configurable applicant notification templates.

### Staff experience

- Dedicated review channel.
- Reviewer-role access control.
- Administrator override.
- Clean review embeds.
- **Accept**, **Reject**, **Hold**, **Claim** and **Notes** actions.
- Reviewer claiming and ownership tracking.
- Reviewer assignment.
- Review queue.
- Application search.
- Full application view.
- Internal reviewer notes.
- Application archiving.
- Automatic acceptance roles.
- Disabled review controls after a final decision.

### Administration

- Per-guild configuration.
- Multiple application types.
- Application descriptions and custom questions.
- Optional acceptance role per application type.
- Optional audit-log channel.
- Persistent SQLite database.
- Guild-scoped application lookups.
- Audit events for submissions and staff actions.
- Live reviewer analytics and acceptance-rate snapshot.
- Local-first data storage with no third-party application-data service required.
- GitHub Actions type-check and build verification.

## Requirements

- Node.js `20` or newer.
- A Discord bot/application.
- `Guilds` intent.
- `Guild Members` intent if automatic acceptance-role assignment is enabled.
- Bot permissions to view/send messages and embeds in the application/review/log channels.
- **Manage Roles** plus a role hierarchy that allows the bot to assign the configured acceptance role.

## Installation

```bash
git clone https://github.com/PauzeDevs/PauzeApplications.git
cd PauzeApplications
npm install
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_client_id
GUILD_ID=optional_test_guild_id
DATABASE_PATH=./data/pauze-applications.db
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application/client ID used for command registration |
| `GUILD_ID` | No | Test server ID for instant command registration |
| `DATABASE_PATH` | No | SQLite database path; defaults to `./data/pauze-applications.db` |

**Never commit `.env`, bot tokens, or database files containing application data.**

## Discord Developer Portal setup

1. Create/open your Discord application.
2. Create a bot user.
3. Copy the bot token into `.env` as `DISCORD_TOKEN`.
4. Copy the application ID into `.env` as `CLIENT_ID`.
5. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent** if you want automatic role assignment.
6. Invite the bot with the `bot` and `applications.commands` scopes.
7. Give it access to the channels used for panels, reviews and logs.

The bot does not need Administrator permission. Use the smallest permissions that fit your server.

## Register commands

For development/testing, set `GUILD_ID` and run:

```bash
npm run register
```

Guild commands are recommended while configuring the bot because they update quickly.

If `GUILD_ID` is omitted, commands are registered globally and may take time to propagate.

## Start the bot

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Type-check without producing build files:

```bash
npm run typecheck
```

## First-time server configuration

### 1. Configure the review system

Run:

```text
/application setup
```

Choose:

- **review_channel** — where submitted applications appear for staff.
- **reviewer_role** — role allowed to review applications.
- **log_channel** — optional channel for audit events.

Administrators can review applications even if they do not have the configured reviewer role.

### 2. Create an application type

Run:

```text
/application create
```

Provide:

- Application name
- Description
- Optional acceptance role
- One to five questions

Discord modals have a five-input limit, so the current form engine intentionally supports up to five questions per application.

### 3. Publish the application panel

Run:

```text
/application panel
```

The bot publishes a clean PauzeX-style panel with a select menu. Members choose the application they want and receive a private Discord modal.

### 4. Member submits an application

The bot:

1. Validates the application type.
2. Prevents duplicate active applications of the same type.
3. Saves the answers to SQLite.
4. Generates a unique public application ID.
5. Posts the submission in the configured review channel.
6. Writes an audit event.
7. Confirms submission privately to the applicant.

### 5. Staff reviews it

Reviewers can use:

- **Claim** — mark the application as under review and assign the reviewer.
- **Hold** — pause the application and notify the applicant.
- **Notes** — save private internal reviewer notes.
- **Accept** — finalize the application and optionally assign the configured role.
- **Reject** — finalize the application as rejected.

Final decisions disable the review controls on the original review message.

## Command reference

### Applicant commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/application apply` | Everyone | Open the application catalogue and start a form |
| `/application status` | Everyone | View your latest application |
| `/application history` | Everyone | View your recent application history |
| `/application withdraw` | Everyone | Withdraw your active application |

### Server administration

| Command | Who | Purpose |
| --- | --- | --- |
| `/application setup` | Manage Server | Configure review/reviewer/log channels |
| `/application create` | Manage Server | Create an application type |
| `/application panel` | Manage Server | Publish the application panel |
| `/application list` | Manage Server | List application types |
| `/application template` | Manage Server | Configure an applicant notification template |

### Reviewer commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/application queue` | Reviewer | View active review work |
| `/application search` | Reviewer | Search applications |
| `/application view` | Reviewer | Open a full application |
| `/application decide` | Reviewer | Accept, reject or hold |
| `/application assign` | Reviewer | Assign a reviewer |
| `/application archive` | Reviewer | Archive an application |
| `/application note` | Reviewer | Save internal notes |
| `/application analytics` | Reviewer | View application statistics |

## Application IDs

Public IDs use a readable format similar to:

    A-MF3ZP2-1A2B3C

The public ID can be shared with applicants. Administrative commands also accept the internal numeric application ID.

## Application statuses

```text
🟡 Pending
🔵 Under Review
⏳ On Hold
🟢 Accepted
🔴 Rejected
⚪ Withdrawn
⚫ Archived
```

`Withdrawn` is a final applicant-controlled state. It can be archived by staff like other finalized applications.

## Database

Pauze Applications uses SQLite through `better-sqlite3`.

The database stores:

- Per-server configuration.
- Application types and questions.
- Application submissions and answers.
- Reviewer/status metadata.
- Internal notes.
- Audit events.

The default database is created automatically at:

```text
./data/pauze-applications.db
```

Back up this file if application history is important to your server.

## Data & privacy

Application answers and review metadata are stored locally in SQLite. The project does not send application data to a third-party application-data service by default. Discord itself processes the messages, interactions and DMs required for the bot to operate.

Server owners are responsible for determining their own retention, access and privacy requirements.

## Security notes

- Keep `DISCORD_TOKEN` private.
- Never upload `.env` to GitHub.
- Do not expose the SQLite database publicly.
- Restrict the reviewer role to trusted staff.
- Keep the bot's role below roles it should not be able to assign.
- Give the bot only the channel and role permissions it needs.

## Project structure

```text
PauzeApplications/
├── src/
│   ├── commands/
│   │   └── application.ts
│   ├── db.ts
│   ├── deploy-commands.ts
│   └── index.ts
├── data/                 # runtime SQLite data, ignored by Git
├── .env.example
├── .gitignore
├── LICENSE
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

### 1.3.x — Advanced forms

- [ ] Multi-page application forms
- [ ] Choice/select question types
- [ ] Number questions
- [ ] URL validation
- [ ] Question-level validation
- [ ] Question ordering
- [ ] Draft/publish states

### 1.4.x — Reviewer workspace

- [ ] Advanced reviewer filters
- [ ] Reviewer workload views
- [ ] Multi-reviewer voting
- [ ] Decision thresholds
- [ ] Applicant/reviewer conversation tools
- [ ] Interview stage

### 1.5.x — Automation and analytics

- [ ] Workflow action engine
- [ ] Scheduled actions
- [ ] Acceptance/rejection templates
- [ ] Funnel analytics
- [ ] Review-time analytics
- [ ] CSV export
- [ ] Archive browser

### 2.x — Platform

- [ ] Web dashboard
- [ ] Visual application builder
- [ ] REST/API layer
- [ ] Webhooks
- [ ] Pauze Tickets integration
- [ ] Advanced server customization

## Versioning & releases

Pauze Applications follows semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Example:

```text
1.0.0 → initial stable feature set
1.1.0 → backwards-compatible features
1.1.1 → backwards-compatible bug fixes
2.0.0 → breaking changes
```

GitHub Releases should document:

- Features
- Improvements
- Bug fixes
- Breaking changes
- Migration notes when necessary

## License

Pauze Applications is released under the **MIT License**. See [`LICENSE`](LICENSE) for the full license text.

You may use, modify and distribute the software under the terms of that license. The Pauze name, branding and original artwork are not granted as trademarks by the MIT license.

## Support

Open an issue in the repository for bugs and feature requests.

Repository: https://github.com/PauzeDevs/PauzeApplications

**Pauze Applications — applications, without the clutter.**
