// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import "dotenv/config";
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
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
} from "discord.js";

import {
  addAudit,
  createApplication,
  createApplicationType,
  getApplication,
  getApplicationByPublicId,
  getApplicationType,
  getApplicationTypes,
  getGuildConfig,
  getLatestApplicationForUser,
  getReviewQueue,
  getUserApplications,
  hasActiveApplication,
  searchApplications,
  updateApplication,
} from "./db.js";
import type {
  AppStatus,
  ApplicationRecord,
} from "./db.js";
import {
  ACTIVE_STATUSES,
  canTransition,
  getEnabledApplicationTypes,
  transitionApplication,
} from "./services/applicationService.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN is missing.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// 🎨 One palette for the whole bot. Keeping it centralized avoids random UI choices.
const COLORS = {
  brand: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  muted: 0x2b2d31,
} as const;

const STATUS_LABELS: Record<AppStatus, string> = {
  pending: "🟡 Pending",
  under_review: "🔵 Under Review",
  hold: "⏳ On Hold",
  accepted: "🟢 Accepted",
  rejected: "🔴 Rejected",
  archived: "⚫ Archived",
};

const STATUS_COLORS: Record<AppStatus, number> = {
  pending: COLORS.brand,
  under_review: COLORS.brand,
  hold: COLORS.warning,
  accepted: COLORS.success,
  rejected: COLORS.danger,
  archived: COLORS.muted,
};

function trimText(value: string, max: number): string {
  const clean = value.trim();
  return clean.length > max
    ? clean.slice(0, max - 1) + "…"
    : clean;
}

function discordTimestamp(iso: string): string {
  const unix = Math.floor(new Date(iso).getTime() / 1000);

  return Number.isFinite(unix)
    ? "<t:" + unix + ":R>"
    : "Unknown";
}

function isManageGuild(
  interaction: ChatInputCommandInteraction,
): boolean {
  return Boolean(
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild,
    ),
  );
}

function isReviewerMember(interaction: Interaction): boolean {
  if (!interaction.inGuild()) return false;

  const member = interaction.member as GuildMember;

  if (
    member.permissions.has(
      PermissionFlagsBits.Administrator,
    )
  ) {
    return true;
  }

  const reviewerRoleId =
    getGuildConfig(interaction.guildId)?.reviewer_role_id;

  return Boolean(
    reviewerRoleId &&
      member.roles.cache.has(reviewerRoleId),
  );
}

function reviewButtons(
  applicationId: number,
  locked = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("app:accept:" + applicationId)
      .setLabel("Accept")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId("app:reject:" + applicationId)
      .setLabel("Reject")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId("app:hold:" + applicationId)
      .setLabel("Hold")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId("app:claim:" + applicationId)
      .setLabel("Claim")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId("app:notes:" + applicationId)
      .setLabel("Notes")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(locked),
  );
}

function applicationPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.brand)
    .setAuthor({
      name: "Pauze Applications",
      iconURL: client.user?.displayAvatarURL(),
    })
    .setTitle("📋 Applications")
    .setDescription(
      "Choose an application below to get started. Your answers are private and are only sent to the configured review team.",
    )
    .addFields(
      {
        name: "📝 Simple",
        value: "Complete a guided Discord form.",
        inline: true,
      },
      {
        name: "🔒 Private",
        value: "Only authorized reviewers can access submissions.",
        inline: true,
      },
      {
        name: "⚡ Fast",
        value: "Submit directly inside Discord.",
        inline: true,
      },
    )
    .setFooter({
      text:
        "Pauze Applications • Applications, without the clutter.",
    });
}

function applicationStatusEmbed(
  application: ApplicationRecord,
  typeName: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(STATUS_COLORS[application.status])
    .setAuthor({
      name: "Pauze Applications",
      iconURL: client.user?.displayAvatarURL(),
    })
    .setTitle(
      "📄 Application " + application.publicId,
    )
    .setDescription(
      "Your **" +
        typeName +
        "** application is currently **" +
        STATUS_LABELS[application.status] +
        "**.",
    )
    .addFields(
      {
        name: "📌 Status",
        value: STATUS_LABELS[application.status],
        inline: true,
      },
      {
        name: "🗓️ Submitted",
        value: discordTimestamp(application.createdAt),
        inline: true,
      },
      {
        name: "🔄 Updated",
        value: discordTimestamp(application.updatedAt),
        inline: true,
      },
    )
    .setFooter({
      text:
        "Pauze Applications • ID " +
        application.publicId,
    });
}

function applicationReviewEmbed(
  application: ApplicationRecord,
  typeName: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(STATUS_COLORS[application.status])
    .setAuthor({
      name: "Pauze Applications",
      iconURL: client.user?.displayAvatarURL(),
    })
    .setTitle(
      "📋 " +
        typeName +
        " • " +
        application.publicId,
    )
    .setDescription(
      [
        "**Applicant:** <@" +
          application.userId +
          ">",
        "**Status:** " +
          STATUS_LABELS[application.status],
        "**Submitted:** " +
          discordTimestamp(application.createdAt),
        application.reviewerId
          ? "**Reviewer:** <@" +
            application.reviewerId +
            ">"
          : "**Reviewer:** Unassigned",
      ].join("\n"),
    )
    .setFooter({
      text:
        "Pauze Applications • Staff review",
    })
    .setTimestamp(new Date(application.createdAt));
}

function addAnswers(
  embed: EmbedBuilder,
  application: ApplicationRecord,
  questions: string[],
): EmbedBuilder {
  for (let index = 0; index < questions.length; index += 1) {
    embed.addFields({
      name:
        (index + 1) +
        ". " +
        trimText(questions[index], 240),
      value:
        trimText(
          application.answers[index] ?? "—",
          1024,
        ) || "—",
    });
  }

  return embed;
}

function resolveApplication(
  guildId: string,
  reference: string,
): ApplicationRecord | undefined {
  const cleaned = reference.trim();

  if (!cleaned) return undefined;

  if (/^\d+$/.test(cleaned)) {
    const internal = getApplication(
      Number(cleaned),
    );

    if (
      internal &&
      internal.guildId === guildId
    ) {
      return internal;
    }
  }

  return getApplicationByPublicId(
    guildId,
    cleaned,
  );
}

async function sendAudit(
  guildId: string,
  applicationId: number,
  actorId: string,
  action: string,
  details = "",
): Promise<void> {
  addAudit(
    guildId,
    applicationId,
    actorId,
    action,
    details,
  );

  const logChannelId =
    getGuildConfig(guildId)?.log_channel_id;

  if (!logChannelId) return;

  const channel = await client.channels
    .fetch(logChannelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return;

  const application = getApplication(
    applicationId,
  );

  if (!application) return;

  const embed = new EmbedBuilder()
    .setColor(
      action === "accepted"
        ? COLORS.success
        : action === "rejected"
          ? COLORS.danger
          : COLORS.brand,
    )
    .setTitle("📜 Application Audit Log")
    .setDescription(
      "**" +
        application.publicId +
        "** • " +
        action.replace(/_/g, " "),
    )
    .addFields(
      {
        name: "👤 Applicant",
        value:
          "<@" +
          application.userId +
          ">",
        inline: true,
      },
      {
        name: "🛡️ Actor",
        value:
          "<@" +
          actorId +
          ">",
        inline: true,
      },
      {
        name: "📌 Status",
        value:
          STATUS_LABELS[application.status],
        inline: true,
      },
    )
    .setTimestamp();

  if (details) {
    embed.addFields({
      name: "📝 Details",
      value: trimText(details, 1024),
    });
  }

  await channel
    .send({ embeds: [embed] })
    .catch(() => null);
}

async function notifyApplicant(
  application: ApplicationRecord,
  status: AppStatus,
  reason = "",
): Promise<void> {
  try {
    const user = await client.users.fetch(
      application.userId,
    );
    const type = getApplicationType(
      application.typeId,
      application.guildId,
    );

    const embed = new EmbedBuilder()
      .setColor(STATUS_COLORS[status])
      .setAuthor({
        name: "Pauze Applications",
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTitle(
        "📋 Application " +
          application.publicId,
      )
      .setDescription(
        "Your **" +
          (type?.name ?? "application") +
          "** is now **" +
          STATUS_LABELS[status] +
          "**.",
      )
      .setTimestamp()
      .setFooter({
        text: "Pauze Applications",
      });

    if (reason) {
      embed.addFields({
        name: "💬 Message from the review team",
        value: trimText(reason, 1024),
      });
    }

    await user.send({
      embeds: [embed],
    });
  } catch {
    // 🔒 DMs can be disabled. The core application workflow must still complete.
  }
}

async function assignAcceptanceRole(
  application: ApplicationRecord,
): Promise<boolean> {
  const type = getApplicationType(
    application.typeId,
    application.guildId,
  );

  if (!type?.acceptanceRoleId) {
    return true;
  }

  const guild = await client.guilds
    .fetch(application.guildId)
    .catch(() => null);

  if (!guild) return false;

  const member = await guild.members
    .fetch(application.userId)
    .catch(() => null);

  if (!member) return false;

  const role = await guild.roles
    .fetch(type.acceptanceRoleId)
    .catch(() => null);

  if (!role) return false;

  const botMember = guild.members.me;

  // Discord does not allow a bot to assign a role above or equal to its own top role.
  if (
    !botMember ||
    role.position >=
      botMember.roles.highest.position
  ) {
    return false;
  }

  if (member.roles.cache.has(role.id)) {
    return true;
  }

  return Boolean(
    await member.roles
      .add(
        role,
        "Pauze Applications: accepted application",
      )
      .then(() => true)
      .catch(() => false),
  );
}

async function updateReviewMessage(
  interaction: any,
  application: ApplicationRecord,
): Promise<void> {
  const type = getApplicationType(
    application.typeId,
    application.guildId,
  );

  const embed = addAnswers(
    applicationReviewEmbed(
      application,
      type?.name ?? "Application",
    ),
    application,
    type?.questions ?? [],
  );

  await interaction.update({
    embeds: [embed],
    components: [
      reviewButtons(
        application.id,
        !ACTIVE_STATUSES.includes(
          application.status,
        ),
      ),
    ],
  });
}

async function handleApplicationCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild.id;
  const subcommand =
    interaction.options.getSubcommand();

  // --------------------------------------------------------------------------
  // 👤 Applicant-facing commands
  // --------------------------------------------------------------------------

  if (subcommand === "status") {
    const reference =
      interaction.options.getString("id");
    let application: ApplicationRecord | undefined;

    if (reference) {
      application = resolveApplication(
        guildId,
        reference,
      );

      if (
        application &&
        application.userId !==
          interaction.user.id &&
        !isReviewerMember(interaction)
      ) {
        application = undefined;
      }
    } else {
      application =
        getLatestApplicationForUser(
          guildId,
          interaction.user.id,
        );
    }

    if (!application) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.muted)
            .setTitle("📭 No application found")
            .setDescription(
              reference
                ? "No application with that ID could be found for you."
                : "You have not submitted an application in this server yet.",
            )
            .setFooter({
              text: "Pauze Applications",
            }),
        ],
        ephemeral: true,
      });
      return;
    }

    const type = getApplicationType(
      application.typeId,
      guildId,
    );

    await interaction.reply({
      embeds: [
        applicationStatusEmbed(
          application,
          type?.name ?? "Application",
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "history") {
    const applications =
      getUserApplications(
        guildId,
        interaction.user.id,
        10,
      );

    if (!applications.length) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.muted)
            .setTitle(
              "📭 No application history",
            )
            .setDescription(
              "You have not submitted an application in this server yet.",
            )
            .setFooter({
              text: "Pauze Applications",
            }),
        ],
        ephemeral: true,
      });
      return;
    }

    const lines = applications.map(
      application => {
        const type = getApplicationType(
          application.typeId,
          guildId,
        );

        return [
          "**" +
            application.publicId +
            "** — " +
            (type?.name ?? "Application"),
          STATUS_LABELS[
            application.status
          ] +
            " • " +
            discordTimestamp(
              application.createdAt,
            ),
        ].join("\n");
      },
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.brand)
          .setAuthor({
            name: "Pauze Applications",
            iconURL:
              client.user?.displayAvatarURL(),
          })
          .setTitle(
            "🗂️ Your Application History",
          )
          .setDescription(
            lines.join("\n\n"),
          )
          .setFooter({
            text:
              "Showing your 10 most recent applications.",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------------------------------
  // ⚙️ Server administration
  // --------------------------------------------------------------------------

  if (
    ["setup", "create", "panel", "list"].includes(
      subcommand,
    ) &&
    !isManageGuild(interaction)
  ) {
    await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "setup") {
    const reviewChannel =
      interaction.options.getChannel(
        "review_channel",
        true,
      );
    const reviewerRole =
      interaction.options.getRole(
        "reviewer_role",
        true,
      );
    const logChannel =
      interaction.options.getChannel(
        "log_channel",
        false,
      );

    const textChannelTypes = [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
    ];

    if (
      !textChannelTypes.includes(
        reviewChannel.type,
      )
    ) {
      await interaction.reply({
        content:
          "❌ Review channel must be a text-based channel.",
        ephemeral: true,
      });
      return;
    }

    if (
      logChannel &&
      !textChannelTypes.includes(
        logChannel.type,
      )
    ) {
      await interaction.reply({
        content:
          "❌ Log channel must be a text-based channel.",
        ephemeral: true,
      });
      return;
    }

    setGuildConfig(
      guildId,
      reviewChannel.id,
      reviewerRole.id,
      logChannel?.id ?? null,
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(
            "⚙️ Applications configured",
          )
          .setDescription(
            [
              "**Review channel**\n<#" +
                reviewChannel.id +
                ">",
              "**Reviewer role**\n<@" +
                "&" +
                reviewerRole.id +
                ">",
              logChannel
                ? "**Audit log**\n<#" +
                  logChannel.id +
                  ">"
                : "**Audit log**\nNot configured",
            ].join("\n\n"),
          )
          .setFooter({
            text:
              "Pauze Applications • Configuration saved.",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "create") {
    const questions = [1, 2, 3, 4, 5]
      .map(index =>
        interaction.options.getString(
          "question_" + index,
        ),
      )
      .filter(
        (question): question is string =>
          Boolean(question?.trim()),
      )
      .map(question =>
        question.trim(),
      );

    if (!questions.length) {
      await interaction.reply({
        content:
          "❌ Add at least one question.",
        ephemeral: true,
      });
      return;
    }

    const name = interaction.options
      .getString("name", true)
      .trim();
    const description =
      interaction.options
        .getString(
          "description",
          true,
        )
        .trim();
    const acceptanceRole =
      interaction.options.getRole(
        "acceptance_role",
        false,
      );

    try {
      const id = createApplicationType(
        guildId,
        name,
        description,
        questions,
        acceptanceRole?.id ?? null,
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(
              "📝 Application created",
            )
            .setDescription(
              "**" +
                name +
                "** is ready.\n\nUse the /application panel command to publish the panel.",
            )
            .setFooter({
              text:
                "Application type #" + id,
            }),
        ],
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content:
          "❌ An application type with that name already exists.",
        ephemeral: true,
      });
    }
    return;
  }

  if (subcommand === "list") {
    const types =
      getApplicationTypes(guildId);

    if (!types.length) {
      await interaction.reply({
        content:
          "📭 No application types exist yet. Use /application create.",
        ephemeral: true,
      });
      return;
    }

    const description = types
      .map(type =>
        [
          "**" + type.name + "**",
          "> " +
            trimText(
              type.description,
              150,
            ),
          type.questions.length +
            " question(s) • " +
            (type.enabled
              ? "🟢 Enabled"
              : "⚫ Disabled"),
        ].join("\n"),
      )
      .join("\n\n");

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.brand)
          .setTitle(
            "📋 Application Types",
          )
          .setDescription(
            description,
          )
          .setFooter({
            text:
              types.length +
              " application type(s)",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "panel") {
    const types =
      getEnabledApplicationTypes(
        guildId,
      );

    if (!types.length) {
      await interaction.reply({
        content:
          "❌ Create an enabled application type first with /application create.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.channel?.isTextBased()) {
      await interaction.reply({
        content:
          "❌ This channel cannot receive application panels.",
        ephemeral: true,
      });
      return;
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId("app:type")
        .setPlaceholder(
          "Select an application to begin",
        );

    for (const type of types.slice(
      0,
      25,
    )) {
      menu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            type.name.slice(0, 100),
          )
          .setDescription(
            type.description.slice(
              0,
              100,
            ),
          )
          .setValue(
            String(type.id),
          ),
      );
    }

    const row =
      new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(menu);

    await interaction.channel.send({
      embeds: [
        applicationPanelEmbed(),
      ],
      components: [row],
    });

    await interaction.reply({
      content:
        "✅ Application panel published.",
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------------------------------
  // 🛡️ Reviewer commands
  // --------------------------------------------------------------------------

  if (
    [
      "queue",
      "search",
      "view",
      "decide",
      "assign",
      "archive",
      "note",
    ].includes(subcommand) &&
    !isReviewerMember(interaction)
  ) {
    await interaction.reply({
      content:
        "❌ You need the configured reviewer role or Administrator permission.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "queue") {
    const status =
      interaction.options.getString(
        "status",
      ) as
        | Extract<
            AppStatus,
            "pending" |
              "under_review" |
              "hold"
          >
        | null;

    const applications =
      getReviewQueue(
        guildId,
        status ?? undefined,
        10,
      );

    if (!applications.length) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.muted)
            .setTitle(
              "📭 Review queue is empty",
            )
            .setDescription(
              status
                ? "There are no applications matching that status."
                : "There are no active applications waiting for review.",
            )
            .setFooter({
              text:
                "Pauze Applications",
            }),
        ],
        ephemeral: true,
      });
      return;
    }

    const lines = applications.map(
      application =>
        [
          "**" +
            application.publicId +
            "** — " +
            application.typeName,
          STATUS_LABELS[
            application.status
          ] +
            " • <@" +
            application.userId +
            "> • " +
            discordTimestamp(
              application.createdAt,
            ),
          application.reviewerId
            ? "👤 Reviewer: <@" +
              application.reviewerId +
              ">"
            : "👤 Reviewer: Unassigned",
        ].join("\n"),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.brand)
          .setAuthor({
            name:
              "Pauze Applications",
            iconURL:
              client.user?.displayAvatarURL(),
          })
          .setTitle(
            "🛡️ Application Review Queue",
          )
          .setDescription(
            lines.join("\n\n"),
          )
          .setFooter({
            text:
              "Showing " +
              applications.length +
              " application(s) • Oldest first.",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "search") {
    const rawQuery =
      interaction.options
        .getString(
          "query",
          true,
        )
        .trim();

    const mention =
      rawQuery.match(
        /^<@!?(\d+)>$/,
      );

    const query = mention
      ? mention[1]
      : rawQuery;

    const results =
      searchApplications(
        guildId,
        query,
        10,
      );

    if (!results.length) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(
              COLORS.muted,
            )
            .setTitle(
              "🔎 No applications found",
            )
            .setDescription(
              "Try an application ID, part of an application ID, or a Discord user ID/mention.",
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    const lines = results.map(
      application =>
        [
          "**" +
            application.publicId +
            "** — " +
            application.typeName,
          STATUS_LABELS[
            application.status
          ] +
            " • <@" +
            application.userId +
            "> • " +
            discordTimestamp(
              application.createdAt,
            ),
        ].join("\n"),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            COLORS.brand,
          )
          .setTitle(
            "🔎 Application Search",
          )
          .setDescription(
            lines.join("\n\n"),
          )
          .setFooter({
            text:
              "Showing up to 10 matching applications.",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "view") {
    const reference =
      interaction.options.getString(
        "id",
        true,
      );

    const application =
      resolveApplication(
        guildId,
        reference,
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ Application not found.",
        ephemeral: true,
      });
      return;
    }

    const type =
      getApplicationType(
        application.typeId,
        guildId,
      );

    if (!type) {
      await interaction.reply({
        content:
          "❌ The application type attached to this application no longer exists.",
        ephemeral: true,
      });
      return;
    }

    const embed = addAnswers(
      applicationReviewEmbed(
        application,
        type.name,
      ),
      application,
      type.questions,
    );

    await interaction.reply({
      embeds: [embed],
      components: [
        reviewButtons(
          application.id,
          !ACTIVE_STATUSES.includes(
            application.status,
          ),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "decide") {
    const reference =
      interaction.options.getString(
        "id",
        true,
      );

    const decision =
      interaction.options.getString(
        "decision",
        true,
      ) as Extract<
        AppStatus,
        "accepted" |
          "rejected" |
          "hold"
      >;

    const reason =
      interaction.options
        .getString("reason")
        ?.trim() ?? "";

    const application =
      resolveApplication(
        guildId,
        reference,
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ Application not found.",
        ephemeral: true,
      });
      return;
    }

    if (
      !canTransition(
        application.status,
        decision,
      )
    ) {
      await interaction.reply({
        content:
          "❌ That application cannot transition from " +
          STATUS_LABELS[
            application.status
          ] +
          " to " +
          STATUS_LABELS[
            decision
          ] +
          ".",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        decision,
        interaction.user.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application could not be updated.",
        ephemeral: true,
      });
      return;
    }

    let roleAssigned = true;

    if (decision === "accepted") {
      roleAssigned =
        await assignAcceptanceRole(
          updated,
        );
    }

    await sendAudit(
      guildId,
      updated.id,
      interaction.user.id,
      decision,
      reason ||
        (roleAssigned
          ? ""
          : "Configured acceptance role could not be assigned."),
    );

    await notifyApplicant(
      updated,
      decision,
      reason,
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            STATUS_COLORS[
              decision
            ],
          )
          .setTitle(
            "📌 Application updated",
          )
          .setDescription(
            "**" +
              updated.publicId +
              "** is now **" +
              STATUS_LABELS[
                decision
              ] +
              "**.",
          )
          .addFields(
            {
              name:
                "👤 Applicant",
              value:
                "<@" +
                updated.userId +
                ">",
              inline: true,
            },
            {
              name:
                "🛡️ Reviewer",
              value:
                "<@" +
                interaction.user.id +
                ">",
              inline: true,
            },
            {
              name:
                "🎭 Role action",
              value:
                decision ===
                "accepted"
                  ? roleAssigned
                    ? "Assigned successfully"
                    : "Could not be assigned"
                  : "No role action",
              inline: true,
            },
          )
          .setFooter({
            text:
              "Pauze Applications • Decision recorded.",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "assign") {
    const reference =
      interaction.options.getString(
        "id",
        true,
      );

    const reviewer =
      interaction.options.getUser(
        "reviewer",
        true,
      );

    const application =
      resolveApplication(
        guildId,
        reference,
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ Application not found.",
        ephemeral: true,
      });
      return;
    }

    const reviewerMember =
      await interaction.guild.members
        .fetch(reviewer.id)
        .catch(() => null);

    if (!reviewerMember) {
      await interaction.reply({
        content:
          "❌ That reviewer is not a member of this server.",
        ephemeral: true,
      });
      return;
    }

    const configuredRoleId =
      getGuildConfig(
        guildId,
      )?.reviewer_role_id;

    const hasReviewerAccess =
      reviewerMember.permissions.has(
        PermissionFlagsBits.Administrator,
      ) ||
      Boolean(
        configuredRoleId &&
          reviewerMember.roles.cache.has(
            configuredRoleId,
          ),
      );

    if (!hasReviewerAccess) {
      await interaction.reply({
        content:
          "❌ The selected member does not have reviewer access.",
        ephemeral: true,
      });
      return;
    }

    if (
      !canTransition(
        application.status,
        "under_review",
      )
    ) {
      await interaction.reply({
        content:
          "❌ This application is already in a final state and cannot be assigned.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        "under_review",
        reviewer.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application could not be assigned.",
        ephemeral: true,
      });
      return;
    }

    await sendAudit(
      guildId,
      updated.id,
      interaction.user.id,
      "assigned",
      "Assigned to <@" +
        reviewer.id +
        ">.",
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            COLORS.brand,
          )
          .setTitle(
            "👤 Application assigned",
          )
          .setDescription(
            "**" +
              updated.publicId +
              "** is now assigned to <@" +
              reviewer.id +
              ">.",
          )
          .setFooter({
            text:
              "Pauze Applications • Under review",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "archive") {
    const reference =
      interaction.options.getString(
        "id",
        true,
      );

    const application =
      resolveApplication(
        guildId,
        reference,
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ Application not found.",
        ephemeral: true,
      });
      return;
    }

    if (
      !canTransition(
        application.status,
        "archived",
      )
    ) {
      await interaction.reply({
        content:
          "❌ This application is already archived.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        "archived",
        interaction.user.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application could not be archived.",
        ephemeral: true,
      });
      return;
    }

    await sendAudit(
      guildId,
      updated.id,
      interaction.user.id,
      "archived",
    );

    await notifyApplicant(
      updated,
      "archived",
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            COLORS.muted,
          )
          .setTitle(
            "🗄️ Application archived",
          )
          .setDescription(
            "**" +
              updated.publicId +
              "** has been archived successfully.",
          )
          .setFooter({
            text:
              "Pauze Applications",
          }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "note") {
    const reference =
      interaction.options.getString(
        "id",
        true,
      );

    const note =
      interaction.options
        .getString(
          "text",
          true,
        )
        .trim();

    const application =
      resolveApplication(
        guildId,
        reference,
      );

    if (!application) {
      await interaction.reply({
        content:
          "❌ Application not found.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      updateApplication(
        application.id,
        {
          notes: note,
          reviewerId:
            interaction.user.id,
        },
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application notes could not be updated.",
        ephemeral: true,
      });
      return;
    }

    await sendAudit(
      guildId,
      updated.id,
      interaction.user.id,
      "notes_updated",
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            COLORS.brand,
          )
          .setTitle(
            "📝 Reviewer notes saved",
          )
          .setDescription(
            "Internal notes for **" +
              updated.publicId +
              "** have been updated.",
          )
          .setFooter({
            text:
              "These notes are staff-only.",
          }),
      ],
      ephemeral: true,
    });
  }
}

async function handleSelectMenu(
  interaction: any,
): Promise<void> {
  if (
    interaction.customId !==
    "app:type"
  ) {
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ This interaction can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const typeId =
    Number(
      interaction.values[0],
    );

  const type =
    getApplicationType(
      typeId,
      interaction.guild.id,
    );

  if (
    !type ||
    !type.enabled
  ) {
    await interaction.reply({
      content:
        "❌ That application is no longer available.",
      ephemeral: true,
    });
    return;
  }

  if (
    type.questions.length === 0 ||
    type.questions.length > 5
  ) {
    await interaction.reply({
      content:
        "❌ This application has an invalid question configuration.",
      ephemeral: true,
    });
    return;
  }

  if (
    hasActiveApplication(
      interaction.guild.id,
      interaction.user.id,
      type.id,
    )
  ) {
    await interaction.reply({
      content:
        "⚠️ You already have an active application of this type.",
      ephemeral: true,
    });
    return;
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        "app:submit:" +
          type.id,
      )
      .setTitle(
        type.name.slice(
          0,
          45,
        ),
      );

  const rows =
    type.questions.map(
      (
        question,
        index,
      ) =>
        new ActionRowBuilder<TextInputBuilder>()
          .addComponents(
            new TextInputBuilder()
              .setCustomId(
                "q" +
                  index,
              )
              .setLabel(
                question.slice(
                  0,
                  45,
                ),
              )
              .setStyle(
                TextInputStyle.Paragraph,
              )
              .setRequired(true)
              .setMaxLength(1000),
          ),
    );

  modal.addComponents(
    ...rows,
  );

  await interaction.showModal(
    modal,
  );
}

async function handleApplicationSubmit(
  interaction: any,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ This interaction can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const typeId =
    Number(
      interaction.customId
        .split(":")[2],
    );

  const type =
    getApplicationType(
      typeId,
      interaction.guild.id,
    );

  if (
    !type ||
    !type.enabled
  ) {
    await interaction.reply({
      content:
        "❌ That application is no longer available.",
      ephemeral: true,
    });
    return;
  }

  if (
    hasActiveApplication(
      interaction.guild.id,
      interaction.user.id,
      typeId,
    )
  ) {
    await interaction.reply({
      content:
        "⚠️ You already have an active application of this type.",
      ephemeral: true,
    });
    return;
  }

  const answers =
    type.questions.map(
      (_, index) =>
        interaction.fields
          .getTextInputValue(
            "q" +
              index,
          )
          .trim(),
    );

  if (
    answers.some(
      answer => !answer,
    )
  ) {
    await interaction.reply({
      content:
        "❌ Every question must contain an answer.",
      ephemeral: true,
    });
    return;
  }

  // Validate the destination before creating the record so a bad setup cannot
  // create an application that immediately becomes invisible to reviewers.
  const reviewChannelId =
    getGuildConfig(
      interaction.guild.id,
    )?.review_channel_id;

  const reviewChannel =
    reviewChannelId
      ? await interaction.guild.channels
          .fetch(
            reviewChannelId,
          )
          .catch(() => null)
      : null;

  if (
    !reviewChannel ||
    !reviewChannel.isTextBased()
  ) {
    await interaction.reply({
      content:
        "❌ Applications are not configured yet. Please contact the server staff.",
      ephemeral: true,
    });
    return;
  }

  const application =
    createApplication(
      interaction.guild.id,
      typeId,
      interaction.user.id,
      answers,
    );

  await sendAudit(
    interaction.guild.id,
    application.id,
    interaction.user.id,
    "submitted",
  );

  const embed = addAnswers(
    applicationReviewEmbed(
      application,
      type.name,
    ),
    application,
    type.questions,
  );

  await reviewChannel.send({
    embeds: [embed],
    components: [
      reviewButtons(
        application.id,
      ),
    ],
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(
          COLORS.success,
        )
        .setTitle(
          "✅ Application submitted",
        )
        .setDescription(
          "Your application **" +
            application.publicId +
            "** has been sent to the review team.\n\nYou will receive a DM when its status changes.",
        )
        .setFooter({
          text:
            "Pauze Applications",
        }),
    ],
    ephemeral: true,
  });
}

async function handleReviewButton(
  interaction: any,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ This interaction can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (
    !isReviewerMember(
      interaction,
    )
  ) {
    await interaction.reply({
      content:
        "❌ You do not have permission to review applications.",
      ephemeral: true,
    });
    return;
  }

  const [
    ,
    action,
    rawId,
  ] =
    interaction.customId.split(
      ":",
    );

  const applicationId =
    Number(rawId);

  if (
    !Number.isInteger(
      applicationId,
    )
  ) {
    await interaction.reply({
      content:
        "❌ Invalid application reference.",
      ephemeral: true,
    });
    return;
  }

  const application =
    getApplication(
      applicationId,
    );

  if (
    !application ||
    application.guildId !==
      interaction.guild.id
  ) {
    await interaction.reply({
      content:
        "❌ Application not found.",
      ephemeral: true,
    });
    return;
  }

  if (action === "notes") {
    const modal =
      new ModalBuilder()
        .setCustomId(
          "app:notes:" +
            application.id,
        )
        .setTitle(
          "Notes • " +
            application.publicId,
        );

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>()
        .addComponents(
          new TextInputBuilder()
            .setCustomId("notes")
            .setLabel(
              "Internal reviewer notes",
            )
            .setStyle(
              TextInputStyle.Paragraph,
            )
            .setRequired(false)
            .setMaxLength(2000)
            .setValue(
              application.notes.slice(
                0,
                2000,
              ),
            ),
        ),
    );

    await interaction.showModal(
      modal,
    );
    return;
  }

  if (action === "claim") {
    if (
      !canTransition(
        application.status,
        "under_review",
      )
    ) {
      await interaction.reply({
        content:
          "❌ This application cannot be claimed from its current state.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        "under_review",
        interaction.user.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application could not be claimed.",
        ephemeral: true,
      });
      return;
    }

    await sendAudit(
      interaction.guild.id,
      updated.id,
      interaction.user.id,
      "claimed",
    );

    await updateReviewMessage(
      interaction,
      updated,
    );
    return;
  }

  if (action === "hold") {
    if (
      !canTransition(
        application.status,
        "hold",
      )
    ) {
      await interaction.reply({
        content:
          "❌ This application cannot be placed on hold from its current state.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        "hold",
        interaction.user.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application could not be placed on hold.",
        ephemeral: true,
      });
      return;
    }

    await sendAudit(
      interaction.guild.id,
      updated.id,
      interaction.user.id,
      "hold",
    );

    await notifyApplicant(
      updated,
      "hold",
    );

    await updateReviewMessage(
      interaction,
      updated,
    );
    return;
  }

  if (
    action === "accept" ||
    action === "reject"
  ) {
    const status =
      action === "accept"
        ? "accepted"
        : "rejected";

    if (
      !canTransition(
        application.status,
        status,
      )
    ) {
      await interaction.reply({
        content:
          "❌ This application cannot be moved to " +
          STATUS_LABELS[status] +
          " from its current state.",
        ephemeral: true,
      });
      return;
    }

    const updated =
      transitionApplication(
        application.id,
        status,
        interaction.user.id,
      );

    if (!updated) {
      await interaction.reply({
        content:
          "❌ The application decision could not be saved.",
        ephemeral: true,
      });
      return;
    }

    let roleAssigned =
      true;

    if (status === "accepted") {
      roleAssigned =
        await assignAcceptanceRole(
          updated,
        );
    }

    await sendAudit(
      interaction.guild.id,
      updated.id,
      interaction.user.id,
      status,
      roleAssigned
        ? ""
        : "Configured acceptance role could not be assigned.",
    );

    await notifyApplicant(
      updated,
      status,
    );

    const type =
      getApplicationType(
        updated.typeId,
        updated.guildId,
      );

    const finalEmbed =
      addAnswers(
        applicationReviewEmbed(
          updated,
          type?.name ??
            "Application",
        ),
        updated,
        type?.questions ?? [],
      ).setFooter({
        text:
          "Pauze Applications • " +
          STATUS_LABELS[
            status
          ] +
          " by " +
          interaction.user.username,
      });

    await interaction.update({
      embeds: [finalEmbed],
      components: [
        reviewButtons(
          updated.id,
          true,
        ),
      ],
    });
  }
}

async function handleNotesModal(
  interaction: any,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ This interaction can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (
    !isReviewerMember(
      interaction,
    )
  ) {
    await interaction.reply({
      content:
        "❌ You do not have permission to edit notes.",
      ephemeral: true,
    });
    return;
  }

  const applicationId =
    Number(
      interaction.customId
        .split(":")[2],
    );

  const application =
    getApplication(
      applicationId,
    );

  if (
    !application ||
    application.guildId !==
      interaction.guild.id
  ) {
    await interaction.reply({
      content:
        "❌ Application not found.",
      ephemeral: true,
    });
    return;
  }

  const notes =
    interaction.fields
      .getTextInputValue(
        "notes",
      )
      .trim();

  const updated =
    updateApplication(
      applicationId,
      {
        notes,
        reviewerId:
          interaction.user.id,
      },
    );

  if (!updated) {
    await interaction.reply({
      content:
        "❌ Notes could not be saved.",
      ephemeral: true,
    });
    return;
  }

  await sendAudit(
    interaction.guild.id,
    updated.id,
    interaction.user.id,
    "notes_updated",
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(
          COLORS.brand,
        )
        .setTitle(
          "📝 Notes updated",
        )
        .setDescription(
          "Internal notes for **" +
            updated.publicId +
            "** have been saved.",
        )
        .setFooter({
          text:
            "Pauze Applications • Staff-only notes.",
        }),
    ],
    ephemeral: true,
  });
}

client.once(
  Events.ClientReady,
  readyClient => {
    console.log(
      "[Pauze Applications] Online as " +
        readyClient.user.tag +
        " • " +
        readyClient.guilds.cache.size +
        " server(s)",
    );
  },
);

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "application"
        ) {
          await handleApplicationCommand(
            interaction,
          );
        }
        return;
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        await handleSelectMenu(
          interaction,
        );
        return;
      }

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId.startsWith(
            "app:submit:",
          )
        ) {
          await handleApplicationSubmit(
            interaction,
          );
          return;
        }

        if (
          interaction.customId.startsWith(
            "app:notes:",
          )
        ) {
          await handleNotesModal(
            interaction,
          );
        }

        return;
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "app:",
        )
      ) {
        await handleReviewButton(
          interaction,
        );
      }
    } catch (error) {
      console.error(
        "[Pauze Applications] Interaction error:",
        error,
      );

      if (!interaction.isRepliable()) {
        return;
      }

      const reply = {
        content:
          "❌ Something went wrong while processing that action. Please try again.",
        ephemeral: true,
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp(reply)
          .catch(() => null);
      } else {
        await interaction
          .reply(reply)
          .catch(() => null);
      }
    }
  },
);

client.login(token).catch(
  error => {
    console.error(
      "[Pauze Applications] Login failed:",
      error,
    );
  },
);
