/**
 * channelGuard.js — Guard: Hanya izinkan command gameplay di #setup-cmd
 *
 * Digunakan oleh semua command gameplay (/setup, /start, /stop, /config)
 * untuk memastikan interaksi hanya diterima dari channel #setup-cmd yang terdaftar.
 *
 * Usage (di awal setiap command execute):
 *   const guard = await requireSetupCmd(interaction);
 *   if (guard) return; // sudah di-reply oleh guard
 */

import { getGuildConfig } from './serverConfig.js';

/**
 * Cek apakah interaction berasal dari channel #setup-cmd.
 * Jika tidak, kirim ephemeral error reply dan kembalikan `true` (blocked).
 * Jika ya, kembalikan `false` (lolos).
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<boolean>} true = blocked, false = lolos
 */
export async function requireSetupCmd(interaction) {
  const cfg = await getGuildConfig(interaction.guild.id);

  // Server belum pernah di-setup sama sekali
  if (!cfg?.configured || !cfg.setup_cmd_id) {
    await interaction.reply({
      content:
        '⚠️ Bot belum di-setup di server ini.\n' +
        'Minta Admin untuk menjalankan `/setup-werewolf` terlebih dahulu.',
      ephemeral: true,
    });
    return true;
  }

  // Command dipakai di channel yang salah
  if (interaction.channelId !== cfg.setup_cmd_id) {
    await interaction.reply({
      content:
        `⛔ Command ini hanya bisa digunakan di <#${cfg.setup_cmd_id}>.\n` +
        `Pergi ke channel tersebut dan coba lagi.`,
      ephemeral: true,
    });
    return true;
  }

  return false; // Lolos — channel benar
}
