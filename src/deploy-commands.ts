// ============================================================================
// Pauze Applications
// Copyright (c) 2026 Aarav Singh / PauzeDevs
// ============================================================================
// Author: Aarav Singh
// Project: Pauze Applications
// Repository: PauzeDevs/PauzeApplications
// ============================================================================

import "dotenv/config";
import { REST, Routes } from "discord.js";
import { applicationCommand } from "./commands/application.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error(
    "DISCORD_TOKEN and CLIENT_ID are required.",
  );
}

const rest = new REST({
  version: "10",
}).setToken(token);

const body = [
  applicationCommand.toJSON(),
];

const guildId = process.env.GUILD_ID;

if (guildId) {
  await rest.put(
    Routes.applicationGuildCommands(
      clientId,
      guildId,
    ),
    { body },
  );

  console.log(
    "[Pauze Applications] Registered guild commands for " +
      guildId +
      ".",
  );
} else {
  await rest.put(
    Routes.applicationCommands(clientId),
    { body },
  );

  console.log(
    "[Pauze Applications] Registered global commands. Global propagation can take time.",
  );
}
