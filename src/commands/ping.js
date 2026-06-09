/**
 * ping.js — Command Handler: /ping
 * Utility command untuk testing koneksi bot.
 */

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Cek apakah bot aktif. Menampilkan latensi API.');

export async function execute(interaction) {
  const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply(
    `🏓 **Pong!**\n> 📡 Roundtrip: \`${latency}ms\`\n> 💓 API Heartbeat: \`${apiLatency}ms\``
  );
}
