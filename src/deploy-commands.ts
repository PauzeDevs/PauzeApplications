import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { applicationCommand } from './commands/application.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
if (!token || !clientId) throw new Error('DISCORD_TOKEN and CLIENT_ID are required.');

const rest = new REST({ version: '10' }).setToken(token);
const body = [applicationCommand.toJSON()];
const guildId = process.env.GUILD_ID;

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`Registered application commands for guild ${guildId}.`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log('Registered global application commands. Global propagation can take time.');
}
