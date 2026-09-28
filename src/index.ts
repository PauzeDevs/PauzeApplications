import 'dotenv/config';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder,
  TextInputStyle, ChannelSelectMenuBuilder, ChannelType
} from 'discord.js';
import { applicationCommand } from './commands/application.js';
import {
  addAudit, createApplication, createApplicationType, getApplication,
  getApplicationType, getApplicationTypes, getGuildConfig, hasActiveApplication,
  setGuildConfig, updateApplication
} from './db.js';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const brand = 0x5865f2;

const reviewButtons = (id: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId(`app:accept:${id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`app:reject:${id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`app:hold:${id}`).setLabel('Hold').setEmoji('⏳').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`app:claim:${id}`).setLabel('Claim').setEmoji('👤').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`app:notes:${id}`).setLabel('Notes').setEmoji('📝').setStyle(ButtonStyle.Secondary)
);

function applicantPanel(type: ReturnType<typeof getApplicationType>) {
  return new EmbedBuilder()
    .setColor(brand).setTitle(`📋 ${type?.name ?? 'Application'}`)
    .setDescription(type?.description ?? 'Submit an application below.')
    .addFields({ name: 'What happens next?', value: 'Complete the form and our team will review your application.' })
    .setFooter({ text: 'Pauze Applications • Clean applications, without the clutter.' });
}

function isReviewer(interaction: any) {
  if (!interaction.guild || !interaction.member) return false;
  if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = getGuildConfig(interaction.guild.id)?.reviewer_role_id;
  return Boolean(roleId && interaction.member.roles?.cache?.has(roleId));
}

async function notifyApplicant(guild: any, application: any, status: string, reason = '') {
  try {
    const user = await client.users.fetch(application.userId);
    const type = getApplicationType(application.typeId, application.guildId);
    const labels: Record<string, string> = { accepted: 'Accepted', rejected: 'Rejected', hold: 'On Hold', under_review: 'Under Review' };
    const embed = new EmbedBuilder().setColor(status === 'accepted' ? 0x57f287 : status === 'rejected' ? 0xed4245 : brand)
      .setTitle(`Application ${application.publicId}`)
      .setDescription(`Your **${type?.name ?? 'application'}** is now **${labels[status] ?? status}**.`)
      .setFooter({ text: 'Pauze Applications' });
    if (reason) embed.addFields({ name: 'Message from the review team', value: reason.slice(0, 1024) });
    await user.send({ embeds: [embed] });
  } catch { /* DMs can be disabled. */ }
}

client.once(Events.ClientReady, c => console.log(`Pauze Applications online as ${c.user.tag}`));

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'application') {
      const sub = interaction.options.getSubcommand();
      if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });

      if (sub === 'setup') {
        const review = interaction.options.getChannel('review_channel', true);
        const reviewer = interaction.options.getRole('reviewer_role', true);
        const log = interaction.options.getChannel('log_channel', false);
        if (review.type !== ChannelType.GuildText && review.type !== ChannelType.GuildAnnouncement) return interaction.reply({ content: 'Review channel must be a text-based channel.', ephemeral: true });
        setGuildConfig(interaction.guild.id, review.id, reviewer.id, log?.id ?? null);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('⚙️ Applications configured').setDescription(`Review channel: <#${review.id}>\nReviewer role: <@&${reviewer.id}>${log ? `\nLog channel: <#${log.id}>` : ''}`)], ephemeral: true });
      }

      if (sub === 'create') {
        const questions = [1,2,3,4,5].map(n => interaction.options.getString(`question_${n}`)).filter((q): q is string => Boolean(q));
        try {
          const id = createApplicationType(interaction.guild.id, interaction.options.getString('name', true), interaction.options.getString('description', true), questions, interaction.options.getRole('acceptance_role', false)?.id ?? null);
          return interaction.reply({ content: `✅ Created application type **${interaction.options.getString('name', true)}** (` + id + `). Use \`/application panel\` to publish it.`, ephemeral: true });
        } catch { return interaction.reply({ content: '❌ An application type with that name already exists.', ephemeral: true }); }
      }

      if (sub === 'list') {
        const types = getApplicationTypes(interaction.guild.id);
        if (!types.length) return interaction.reply({ content: 'No application types exist yet. Use `/application create`.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(brand).setTitle('📋 Application Types').setDescription(types.map(t => `**${t.id}. ${t.name}** — ${t.questions.length} question(s)`).join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'panel') {
        const types = getApplicationTypes(interaction.guild.id).filter(t => t.enabled);
        if (!types.length) return interaction.reply({ content: 'Create an application type first with `/application create`.', ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId('app:type').setPlaceholder('Choose an application');
        for (const type of types.slice(0, 25)) menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(type.name).setDescription(type.description.slice(0, 100)).setValue(String(type.id)));
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
        await interaction.channel?.send({ embeds: [new EmbedBuilder().setColor(brand).setTitle('📋 Pauze Applications').setDescription('Choose an application below to get started.\n\nYour answers are sent privately to the review team.')], components: [row] });
        return interaction.reply({ content: '✅ Application panel published.', ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'app:type') {
      if (!interaction.guild) return interaction.reply({ content: 'Server only.', ephemeral: true });
      const type = getApplicationType(Number(interaction.values[0]), interaction.guild.id);
      if (!type) return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
      if (type.questions.length > 5) return interaction.reply({ content: 'This application exceeds the Discord modal limit.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`app:submit:${type.id}`).setTitle(type.name.slice(0, 45));
      const rows = type.questions.map((q, i) => new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
      ));
      modal.addComponents(...rows);
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:submit:')) {
      if (!interaction.guild) return interaction.reply({ content: 'Server only.', ephemeral: true });
      const typeId = Number(interaction.customId.split(':')[2]);
      const type = getApplicationType(typeId, interaction.guild.id);
      if (!type) return interaction.reply({ content: 'Application type not found.', ephemeral: true });
      if (hasActiveApplication(interaction.guild.id, interaction.user.id, typeId)) return interaction.reply({ content: 'You already have an active application of this type.', ephemeral: true });
      const answers = type.questions.map((_, i) => interaction.fields.getTextInputValue(`q${i}`));
      const application = createApplication(interaction.guild.id, typeId, interaction.user.id, answers);
      addAudit(interaction.guild.id, application.id, interaction.user.id, 'submitted');
      const config = getGuildConfig(interaction.guild.id);
      const reviewChannel = config?.review_channel_id ? await interaction.guild.channels.fetch(config.review_channel_id).catch(() => null) : null;
      if (!reviewChannel || !reviewChannel.isTextBased()) return interaction.reply({ content: `✅ Submitted as **${application.publicId}**, but staff review is not configured yet.`, ephemeral: true });
      const embed = new EmbedBuilder().setColor(brand).setTitle(`📋 ${type.name} • ${application.publicId}`).setDescription(`**Applicant:** <@${interaction.user.id}>\n**Status:** 🟡 Pending\n\n${answers.map((a, i) => `**${i + 1}. ${type.questions[i]}**\n${a}`).join('\n\n')}`).setTimestamp().setFooter({ text: 'Pauze Applications' });
      await reviewChannel.send({ embeds: [embed], components: [reviewButtons(application.id)] });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('Application submitted').setDescription(`Your application **${application.publicId}** has been sent to the review team.`)], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('app:')) {
      if (!interaction.guild || !isReviewer(interaction)) return interaction.reply({ content: 'You do not have permission to review applications.', ephemeral: true });
      const [, action, rawId] = interaction.customId.split(':');
      const id = Number(rawId);
      const application = getApplication(id);
      if (!application || application.guildId !== interaction.guild.id) return interaction.reply({ content: 'Application not found.', ephemeral: true });

      if (action === 'notes') {
        const modal = new ModalBuilder().setCustomId(`app:notes:${id}`).setTitle(`Notes • ${application.publicId}`);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Internal reviewer notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(2000).setValue(application.notes.slice(0, 2000))));
        return interaction.showModal(modal);
      }
      if (action === 'claim') {
        updateApplication(id, { status: 'under_review', reviewerId: interaction.user.id });
        addAudit(application.guildId, id, interaction.user.id, 'claimed');
        return interaction.reply({ content: `👤 Application claimed by <@${interaction.user.id}>.`, ephemeral: false });
      }
      if (action === 'hold') {
        updateApplication(id, { status: 'hold', reviewerId: interaction.user.id });
        addAudit(application.guildId, id, interaction.user.id, 'hold');
        await notifyApplicant(interaction.guild, application, 'hold');
        return interaction.update({ components: [reviewButtons(id)], embeds: interaction.message.embeds.map(e => EmbedBuilder.from(e).setColor(0xfee75c).setDescription((e.data.description ?? '').replace('🟡 Pending', '⏳ On Hold')).toJSON()) });
      }
      if (action === 'accept' || action === 'reject') {
        const status = action === 'accept' ? 'accepted' : 'rejected';
        const updated = updateApplication(id, { status, reviewerId: interaction.user.id });
        addAudit(application.guildId, id, interaction.user.id, status);
        if (status === 'accepted' && application.typeId) {
          const type = getApplicationType(application.typeId, application.guildId);
          if (type?.acceptanceRoleId) {
            const member = await interaction.guild.members.fetch(application.userId).catch(() => null);
            if (member) await member.roles.add(type.acceptanceRoleId).catch(() => null);
          }
        }
        await notifyApplicant(interaction.guild, updated ?? application, status);
        const color = status === 'accepted' ? 0x57f287 : 0xed4245;
        const base = interaction.message.embeds[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : new EmbedBuilder();
        base.setColor(color).setFooter({ text: `Pauze Applications • ${status.toUpperCase()}` });
        return interaction.update({ embeds: [base], components: [] });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:notes:')) {
      if (!interaction.guild || !isReviewer(interaction)) return interaction.reply({ content: 'You do not have permission.', ephemeral: true });
      const id = Number(interaction.customId.split(':')[2]);
      updateApplication(id, { notes: interaction.fields.getTextInputValue('notes'), reviewerId: interaction.user.id });
      addAudit(interaction.guild.id, id, interaction.user.id, 'notes_updated');
      return interaction.reply({ content: '📝 Internal notes updated.', ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Something went wrong while processing that action.', ephemeral: true }).catch(() => null);
  }
});

client.login(token);
