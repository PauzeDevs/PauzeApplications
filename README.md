# Pauze Applications

A clean, modular Discord application-management bot inspired by the familiar workflow of established application bots, with a polished PauzeX-style interface.

## Status

**Version:** `1.0.0` · **License:** MIT · **Runtime:** Node.js 20+

### Included in v1.0.0

- `/application create` — create an application type with a title, description and up to five initial questions.
- `/application panel` — publish a clean application panel in the current channel.
- `/application list` — inspect configured application types.
- `/application setup` — configure the review channel and reviewer role.
- Modal-based application submission.
- Persistent SQLite storage.
- Unique application IDs.
- Staff review buttons: **Accept**, **Reject**, **Hold**, **Claim** and **Notes**.
- Applicant DMs for review decisions when DMs are available.
- Automatic acceptance role support.
- Review and audit logs.
- Duplicate active-application protection.
- Per-guild configuration.

## Requirements

- Node.js `20` or newer
- A Discord application/bot with the **Server Members Intent** enabled if you want automatic role assignment.
- Permission to send messages, embed links, use application commands, and manage roles when role assignment is enabled.

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

Never commit `.env` or a bot token.

## Register commands

For fast development, set `GUILD_ID` and run:

```bash
npm run register
```

If `GUILD_ID` is omitted, commands are registered globally and can take time to propagate.

## Start

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

## First-time configuration

### 1. Configure the review system

```text
/application setup
```

Choose the review channel and reviewer role. The reviewer role controls who can operate on submitted applications.

### 2. Create an application type

```text
/application create
```

Enter:

- Name
- Description
- Up to five questions
- Optional acceptance role

Questions are displayed as Discord modal inputs when a member applies.

### 3. Publish the panel

```text
/application panel
```

Select an application type. Pauze Applications posts a clean panel with a **Start Application** button.

### 4. Review submissions

New submissions are posted in the configured review channel. Reviewers can claim the application, add notes, hold it, accept it or reject it.

## Command reference

| Command | Purpose |
| --- | --- |
| `/application setup` | Configure review channel and reviewer role |
| `/application create` | Create an application type |
| `/application panel` | Publish an application panel |
| `/application list` | List configured application types |

## Permissions

Administrative setup commands require **Manage Guild**. Review actions require the configured reviewer role or server Administrator permission.

## Data & privacy

Application answers and review metadata are stored locally in SQLite. The project does not send application data to a third-party service by default. Server owners are responsible for their own retention, access and privacy policies.

## License

Pauze Applications is released under the **MIT License**. See [`LICENSE`](LICENSE) for the full license text.

You may use, modify and distribute the software under the terms of that license. The Pauze name, branding and original artwork are not granted as trademarks by the MIT license.

## Roadmap

- [ ] Multi-page application forms
- [ ] Select-menu and choice questions
- [ ] Application search and filters
- [ ] Reviewer statistics
- [ ] Advanced status workflows
- [ ] Transcripts and archives
- [ ] Web dashboard
- [ ] Custom embed branding

## Support

Open an issue in the repository for bugs and feature requests.

**Pauze Applications — applications, without the clutter.**
