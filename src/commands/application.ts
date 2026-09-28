// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const application = new SlashCommandBuilder()
  .setName('application')
  .setDescription('Manage Pauze Applications')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub.setName('setup').setDescription('Configure the application review system')
    .addChannelOption(o => o.setName('review_channel').setDescription('Channel where staff review applications').setRequired(true))
    .addRoleOption(o => o.setName('reviewer_role').setDescription('Role allowed to review applications').setRequired(true))
    .addChannelOption(o => o.setName('log_channel').setDescription('Optional audit log channel').setRequired(false)))
  .addSubcommand(sub => sub.setName('create').setDescription('Create a new application form')
    .addStringOption(o => o.setName('name').setDescription('Application name').setRequired(true).setMaxLength(80))
    .addStringOption(o => o.setName('description').setDescription('Description shown to applicants').setRequired(true).setMaxLength(1000))
    .addRoleOption(o => o.setName('acceptance_role').setDescription('Optional role given after acceptance').setRequired(false))
    .addStringOption(o => o.setName('question_1').setDescription('Question 1').setRequired(true).setMaxLength(400))
    .addStringOption(o => o.setName('question_2').setDescription('Question 2').setRequired(false).setMaxLength(400))
    .addStringOption(o => o.setName('question_3').setDescription('Question 3').setRequired(false).setMaxLength(400))
    .addStringOption(o => o.setName('question_4').setDescription('Question 4').setRequired(false).setMaxLength(400))
    .addStringOption(o => o.setName('question_5').setDescription('Question 5').setRequired(false).setMaxLength(400)))
  .addSubcommand(sub => sub.setName('panel').setDescription('Publish the application selection panel'))
  .addSubcommand(sub => sub.setName('list').setDescription('List configured application types'))
  .addSubcommand(sub => sub.setName('status').setDescription('View your latest application')
    .addStringOption(o => o.setName('id').setDescription('Optional application ID').setRequired(false)))
  .addSubcommand(sub => sub.setName('history').setDescription('View your application history'))
  .addSubcommand(sub => sub.setName('queue').setDescription('View applications waiting for review')
    .addStringOption(o => o.setName('status').setDescription('Filter the review queue').setRequired(false)
      .addChoices(
        { name: '🟡 Pending', value: 'pending' },
        { name: '🔵 Under Review', value: 'under_review' },
        { name: '⏳ On Hold', value: 'hold' },
      )))
  .addSubcommand(sub => sub.setName('search').setDescription('Search applications by ID or applicant')
    .addStringOption(o => o.setName('query').setDescription('Application ID, user ID, or partial public ID').setRequired(true).setMaxLength(100)))
  .addSubcommand(sub => sub.setName('archive').setDescription('Archive an application')
    .addStringOption(o => o.setName('id').setDescription('Application ID').setRequired(true)))
  .addSubcommand(sub => sub.setName('note').setDescription('Add or replace private reviewer notes')
    .addStringOption(o => o.setName('id').setDescription('Application ID').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Private reviewer note').setRequired(true).setMaxLength(2000)));

export const applicationCommand = application;
