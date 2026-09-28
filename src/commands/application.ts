// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import { SlashCommandBuilder } from 'discord.js';

const application = new SlashCommandBuilder()
  .setName('application')
  .setDescription('Pauze Applications • applications, without the clutter')

  // 👤 Applicant workspace
  .addSubcommand(sub => sub
    .setName('apply')
    .setDescription('Start a new application'))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('View your latest application')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Optional application ID')
      .setRequired(false)
      .setMaxLength(100)))
  .addSubcommand(sub => sub
    .setName('history')
    .setDescription('View your recent application history'))

  // 🛡️ Reviewer workspace
  .addSubcommand(sub => sub
    .setName('queue')
    .setDescription('Open the review queue')
    .addStringOption(option => option
      .setName('status')
      .setDescription('Filter the queue')
      .setRequired(false)
      .addChoices(
        { name: '🟡 Pending', value: 'pending' },
        { name: '🔵 Under Review', value: 'under_review' },
        { name: '⏳ On Hold', value: 'hold' },
      )))
  .addSubcommand(sub => sub
    .setName('search')
    .setDescription('Search applications by ID or applicant')
    .addStringOption(option => option
      .setName('query')
      .setDescription('Application ID, user ID, or public ID')
      .setRequired(true)
      .setMaxLength(100)))
  .addSubcommand(sub => sub
    .setName('view')
    .setDescription('Open a full application review')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Application ID')
      .setRequired(true)
      .setMaxLength(100)))
  .addSubcommand(sub => sub
    .setName('decide')
    .setDescription('Accept, reject, or hold an application')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Application ID')
      .setRequired(true)
      .setMaxLength(100))
    .addStringOption(option => option
      .setName('decision')
      .setDescription('New application status')
      .setRequired(true)
      .addChoices(
        { name: '🟢 Accept', value: 'accepted' },
        { name: '🔴 Reject', value: 'rejected' },
        { name: '⏳ Hold', value: 'hold' },
      ))
    .addStringOption(option => option
      .setName('reason')
      .setDescription('Optional applicant-facing message')
      .setRequired(false)
      .setMaxLength(1000)))
  .addSubcommand(sub => sub
    .setName('assign')
    .setDescription('Assign an application to a reviewer')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Application ID')
      .setRequired(true)
      .setMaxLength(100))
    .addUserOption(option => option
      .setName('reviewer')
      .setDescription('Reviewer to assign')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('note')
    .setDescription('Save private reviewer notes')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Application ID')
      .setRequired(true)
      .setMaxLength(100))
    .addStringOption(option => option
      .setName('text')
      .setDescription('Private internal note')
      .setRequired(true)
      .setMaxLength(2000)))
  .addSubcommand(sub => sub
    .setName('archive')
    .setDescription('Archive an application')
    .addStringOption(option => option
      .setName('id')
      .setDescription('Application ID')
      .setRequired(true)
      .setMaxLength(100)))

  // ⚙️ Server administration
  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Configure channels, roles, and application settings')
    .addChannelOption(option => option
      .setName('review_channel')
      .setDescription('Channel where staff review applications')
      .setRequired(true))
    .addRoleOption(option => option
      .setName('reviewer_role')
      .setDescription('Role allowed to review applications')
      .setRequired(true))
    .addChannelOption(option => option
      .setName('log_channel')
      .setDescription('Optional audit log channel')
      .setRequired(false)))
  .addSubcommand(sub => sub
    .setName('create')
    .setDescription('Create an application type')
    .addStringOption(option => option
      .setName('name')
      .setDescription('Application name')
      .setRequired(true)
      .setMaxLength(80))
    .addStringOption(option => option
      .setName('description')
      .setDescription('Description shown to applicants')
      .setRequired(true)
      .setMaxLength(1000))
    .addRoleOption(option => option
      .setName('acceptance_role')
      .setDescription('Optional role given after acceptance')
      .setRequired(false))
    .addStringOption(option => option
      .setName('question_1')
      .setDescription('Question 1')
      .setRequired(true)
      .setMaxLength(400))
    .addStringOption(option => option
      .setName('question_2')
      .setDescription('Question 2')
      .setRequired(false)
      .setMaxLength(400))
    .addStringOption(option => option
      .setName('question_3')
      .setDescription('Question 3')
      .setRequired(false)
      .setMaxLength(400))
    .addStringOption(option => option
      .setName('question_4')
      .setDescription('Question 4')
      .setRequired(false)
      .setMaxLength(400))
    .addStringOption(option => option
      .setName('question_5')
      .setDescription('Question 5')
      .setRequired(false)
      .setMaxLength(400)))
  .addSubcommand(sub => sub
    .setName('panel')
    .setDescription('Publish the application selection panel'))
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('List application types'));

export const applicationCommand = application;
