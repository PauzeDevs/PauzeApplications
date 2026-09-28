import 'dotenv/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { applicationCommand } from './commands/application.js';
import {
  addAudit,
  createApplication,
  createApplicationType,
  getApplication,
  getApplicationType,
  getApplicationTypes,
  getGuildConfig,
  hasActiveApplication,
  setGuildConfig,
  updateApplication,
} from './db.js';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing.');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const BRAND = 0x5865f2;
const SUCCESS = 0x57f287;
const DANGER = 0xed4245;
const WARNING = 0xfee75c;

const statusLabel: Record<string, string> = {
  pending: '🟡 Pending',
  under_review: '🔵 Under Review',
  hold: '⏳ On Hold',
  accepted: '🟢 Accepted',
  rejected: '🔴 Rejected',
  archived: '⚫ Archived',
};

function reviewButtons(id: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`app:accept:${id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app:reject:${id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app:hold:${id}`).setLabel('Hold').setEmoji('⏳').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app:claim:${id}`).setLabel('Claim').setEmoji('👤').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app:notes:${id}`).setLabel('Notes').setEmoji('📝').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

function applicationPanel() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setAuthor({ name: 'Pauze Applications', iconURL: client.user?.displayAvatarURL() })
    .setTitle('📋 Applications')
    .setDescription('Choose an application below to get started. Your answers are private and are only sent to the configured review team.')
    .addFields(
      { name: '📝 Simple', value: 'Fill out a short Discord form.', inline: true },
      { name: '🔒 Private', value: 'Only authorized reviewers see submissions.', inline: true },
      { name: '⚡ Fast', value: 'Submit directly from Discord.', inline: true },
    )
    .setFooter({ text: 'Pauze Applications • Applications, without the clutter.' });
}

function isReviewer(interaction: any) {
  if (!interaction.guild || !interaction.member) return false;
  if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = getGuildConfig(interaction.guild.id)?.reviewer_role_id;
  return Boolean(roleId && interaction.member.roles?.cache?.has(roleId));
}

async function sendAudit(guildId: string, applicationId: number, actorId: string, action: string, details = '') {
  addAudit(guildId, applicationId, actorId, action, details);
  const config = getGuildConfig(guildId);
  if (!config?.log_channel_id) return;

  const channel = await client.channels.fetch(config.log_channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;

  const application = getApplication(applicationId);
  if (!application) return;

  const color = action === 'accepted' ? SUCCESS : action === 'rejected' ? DANGER : BRAND;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Application Audit Log')
    .setDescription(`**${application.publicId}** • ${action.replace(/_/g, ' ')}`)
    .addFields(
      { name: 'Applicant', value: `<@${application.userId}>`, inline: true },
      { name: 'Actor', value: `<@${actorId}>`, inline: true },
      { name: 'Status', value: statusLabel[application.status] ?? application.status, inline: true },
    )
    .setTimestamp();

  if (details) embed.addFields({ name: 'Details', value: details.slice(0, 1024) });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function notifyApplicant(application: any, status: string, reason = '') {
  try {
    const user = await client.users.fetch(application.userId);
    const type = getApplicationType(application.typeId, application.guildId);
    const embed = new EmbedBuilder()
      .setColor(status === 'accepted' ? SUCCESS : status === 'rejected' ? DANGER : BRAND)
      .setAuthor({ name: 'Pauze Applications', iconURL: client.user?.displayAvatarURL() })
      .setTitle(`Application ${application.publicId}`)
      .setDescription(`Your **${type?.name ?? 'application'}** is now **${statusLabel[status] ?? status}**.`)
      .setTimestamp()
      .setFooter({ text: 'Pauze Applications' });
    if (reason) embed.addFields({ name: 'Message from the review team', value: reason.slice(0, 1024) });
    await user.send({ embeds: [embed] });
  } catch {
    // DMs can be disabled; the application remains valid.
  }
}

async function updateReviewMessage(interaction: any, application: any, status: string, disabled = false) {
  const embed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder().setTitle(`Application ${application.publicId}`);

  embed
    .setColor(status === 'accepted' ? SUCCESS : status === 'rejected' ? DANGER : status === 'hold' ? WARNING : BRAND)
    .setFooter({ text: `Pauze Applications • ${statusLabel[status] ?? status}` });

  const description = embed.data.description ?? '';
  const nextDescription = /\*\*Status:\*\*/.test(description)
    ? description.replace(/\*\*Status:\*\* .*?(?=\n|$)/, `**Status:** ${statusLabel[status] ?? status}`)
    : `${description}\n**Status:** ${statusLabel[status] ?? status}`;
  embed.setDescription(nextDescription);
  await interaction.update({ embeds: [embed], components: [reviewButtons(application.id, disabled)] });
}

client.once(Events.ClientReady, c => {
  console.log(`Pauze Applications online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'application') {
      const sub = interaction.options.getSubcommand();
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });

      if (sub === 'setup') {
        const review = interaction.options.getChannel('review_channel', true);
        const reviewer = interaction.options.getRole('reviewer_role', true);
        const log = interaction.options.getChannel('log_channel', false);
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(review.type)) return interaction.reply({ content: '❌ Review channel must be a text-based channel.', ephemeral: true });
        if (log && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(log.type)) return interaction.reply({ content: '❌ Log channel must be a text-based channel.', ephemeral: true });
        setGuildConfig(interaction.guild.id, review.id, reviewer.id, log?.id ?? null);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⚙️ Applications configured').setDescription(`**Review channel**\n<#${review.id}>\n\n**Reviewer role**\n<@&${reviewer.id}>${log ? `\n\n**Audit log**\n<#${log.id}>` : ''}`).setFooter({ text: 'Pauze Applications • Configuration saved.' })], ephemeral: true });
      }

      if (sub === 'create') {
        const questions = [1, 2, 3, 4, 5].map(n => interaction.options.getString(`question_${n}`)).filter((q): q is string => Boolean(q));
        try {
          const name = interaction.options.getString('name', true);
          const id = createApplicationType(interaction.guild.id, name, interaction.options.getString('description', true), questions, interaction.options.getRole('acceptance_role', false)?.id ?? null);
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('Application created').setDescription(`**${name}** is ready.\n\nUse \`/application panel\` to publish the application panel.`).setFooter({ text: `Application type #${id}` })], ephemeral: true });
        } catch {
          return interaction.reply({ content: '❌ An application type with that name already exists.', ephemeral: true });
        }
      }

      if (sub === 'list') {
        const types = getApplicationTypes(interaction.guild.id);
        if (!types.length) return interaction.reply({ content: 'No application types exist yet. Use `/application create`.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(BRAND).setTitle('📋 Application Types').setDescription(types.map(t => `**${t.name}**\n\`${t.questions.length} question(s)\` • ${t.enabled ? '🟢 Enabled' : '⚫ Disabled'}`).join('\n\n')).setFooter({ text: `${types.length} application type(s)` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'panel') {
        const types = getApplicationTypes(interaction.guild.id).filter(t => t.enabled);
        if (!types.length) return interaction.reply({ content: '❌ Create an application type first with `/application create`.', ephemeral: true });
        if (!interaction.channel?.isTextBased()) return interaction.reply({ content: '❌ This channel cannot receive application panels.', ephemeral: true });

        const menu = new StringSelectMenuBuilder().setCustomId('app:type').setPlaceholder('Select an application to begin');
        for (const type of types.slice(0, 25)) menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(type.name.slice(0, 100)).setDescription(type.description.slice(0, 100)).setValue(String(type.id)));
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
        await interaction.channel.send({ embeds: [applicationPanel()], components: [row] });
        return interaction.reply({ content: '✅ Application panel published.', ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'app:type') {
      if (!interaction.guild) return interaction.reply({ content: 'Server only.', ephemeral: true });
      const type = getApplicationType(Number(interaction.values[0]), interaction.guild.id);
      if (!type || !type.enabled) return interaction.reply({ content: '❌ That application is no longer available.', ephemeral: true });
      if (type.questions.length === 0 || type.questions.length > 5) return interaction.reply({ content: '❌ This application has an invalid question configuration.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId(`app:submit:${type.id}`).setTitle(type.name.slice(0, 45));
      const rows = type.questions.map((question, index) => new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(`q${index}`).setLabel(question.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
      modal.addComponents(...rows);
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:submit:')) {
      if (!interaction.guild) return interaction.reply({ content: 'Server only.', ephemeral: true });
      const typeId = Number(interaction.customId.split(':')[2]);
      const type = getApplicationType(typeId, interaction.guild.id);
      if (!type) return interaction.reply({ content: '❌ Application type not found.', ephemeral: true });
      if (hasActiveApplication(interaction.guild.id, interaction.user.id, typeId)) return interaction.reply({ content: '⚠️ You already have an active application of this type.', ephemeral: true });

      const answers = type.questions.map((_, index) => interaction.fields.getTextInputValue(`q${index}`));
      const application = createApplication(interaction.guild.id, typeId, interaction.user.id, answers);
      await sendAudit(interaction.guild.id, application.id, interaction.user.id, 'submitted');

      const config = getGuildConfig(interaction.guild.id);
      const reviewChannel = config?.review_channel_id ? await interaction.guild.channels.fetch(config.review_channel_id).catch(() => null) : null;
      if (!reviewChannel || !reviewChannel.isTextBased()) return interaction.reply({ content: `✅ Submitted as **${application.publicId}**, but staff review is not configured yet.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(BRAND)
        .setAuthor({ name: 'Pauze Applications', iconURL: client.user?.displayAvatarURL() })
        .setTitle(`${type.name} • ${application.publicId}`)
        .setDescription(`**Applicant:** <@${interaction.user.id}>\n**Status:** ${statusLabel.pending}`)
        .addFields(answers.map((answer, index) => ({ name: `${index + 1}. ${type.questions[index]}`.slice(0, 256), value: answer.slice(0, 1024) || '—' })))
        .setTimestamp()
        .setFooter({ text: 'Pauze Applications • Staff review' });

      await reviewChannel.send({ embeds: [embed], components: [reviewButtons(application.id)] });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('Application submitted').setDescription(`Your application **${application.publicId}** has been sent to the review team.\n\nYou will receive a DM when its status changes.`)], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('app:')) {
      if (!interaction.guild || !isReviewer(interaction)) return interaction.reply({ content: '❌ You do not have permission to review applications.', ephemeral: true });
      const [, action, rawId] = interaction.customId.split(':');
      const id = Number(rawId);
      const application = getApplication(id);
      if (!application || application.guildId !== interaction.guild.id) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });

      if (action === 'notes') {
        const modal = new ModalBuilder().setCustomId(`app:notes:${id}`).setTitle(`Notes • ${application.publicId}`);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Internal reviewer notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(2000).setValue(application.notes.slice(0, 2000))));
        return interaction.showModal(modal);
      }

      if (action === 'claim') {
        const updated = updateApplication(id, { status: 'under_review', reviewerId: interaction.user.id }) ?? application;
        await sendAudit(application.guildId, id, interaction.user.id, 'claimed');
        return updateReviewMessage(interaction, updated, 'under_review');
      }

      if (action === 'hold') {
        const updated = updateApplication(id, { status: 'hold', reviewerId: interaction.user.id }) ?? application;
        await sendAudit(application.guildId, id, interaction.user.id, 'hold');
        await notifyApplicant(updated, 'hold');
        return updateReviewMessage(interaction, updated, 'hold');
      }

      if (action === 'accept' || action === 'reject') {
        const status = action === 'accept' ? 'accepted' : 'rejected';
        const updated = updateApplication(id, { status, reviewerId: interaction.user.id }) ?? application;
        await sendAudit(application.guildId, id, interaction.user.id, status);

        if (status === 'accepted') {
          const type = getApplicationType(application.typeId, application.guildId);
          if (type?.acceptanceRoleId) {
            const member = await interaction.guild.members.fetch(application.userId).catch(() => null);
            if (member) await member.roles.add(type.acceptanceRoleId, 'Pauze Applications: accepted application').catch(() => null);
          }
        }

        await notifyApplicant(updated, status);
        return updateReviewMessage(interaction, updated, status, true);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:notes:')) {
      if (!interaction.guild || !isReviewer(interaction)) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
      const id = Number(interaction.customId.split(':')[2]);
      const application = getApplication(id);
      if (!application || application.guildId !== interaction.guild.id) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });
      updateApplication(id, { notes: interaction.fields.getTextInputValue('notes'), reviewerId: interaction.user.id });
      await sendAudit(interaction.guild.id, id, interaction.user.id, 'notes_updated');
      return interaction.reply({ content: '📝 Internal notes updated.', ephemeral: true });
    }
  } catch (error) {
    console.error('[Pauze Applications]', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong while processing that action.', ephemeral: true }).catch(() => null);
  }
});

client.login(token);
