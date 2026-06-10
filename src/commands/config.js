/**
 * config.js — Command Handler: /config
 *
 * Konfigurasi sesi permainan. Hanya bisa digunakan oleh Host.
 * Subcommands:
 *   /config show         — Tampilkan konfigurasi saat ini
 *   /config auto         — Kembali ke mode otomatis (default)
 *   /config set          — Atur jumlah peran secara manual
 */

import { SlashCommandBuilder } from 'discord.js';
import { gameState } from '../gameState.js';
import { getGuildConfig } from '../utils/serverConfig.js';
import { calculateAutoRoles, calculateCustomRoles, formatRoleSummary } from '../utils/roleCalculator.js';
import { buildLobbyEmbed } from './setup.js';
import { requireSetupCmd } from '../utils/channelGuard.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Atur konfigurasi permainan (khusus Host).')
  .addSubcommand(sub => sub
    .setName('show')
    .setDescription('Tampilkan konfigurasi peran saat ini.'))
  .addSubcommand(sub => sub
    .setName('auto')
    .setDescription('Gunakan distribusi peran otomatis & seimbang (default).'))
  .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Atur jumlah peran secara manual.')
    .addIntegerOption(opt => opt
      .setName('werewolves')
      .setDescription('Jumlah pemain berperan Werewolf')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10))
    .addIntegerOption(opt => opt
      .setName('seers')
      .setDescription('Jumlah pemain berperan Seer')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(5)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── Guard: hanya jalan di #setup-cmd ─────────────────────────────────────
  if (await requireSetupCmd(interaction)) return;

  // ── Validasi: harus ada lobby aktif ──────────────────────────────────────
  if (gameState.phase !== 'lobby') {
    return interaction.reply({
      content: '⚠️ Tidak ada lobby yang aktif. Jalankan `/setup` terlebih dahulu.',
      ephemeral: true,
    });
  }

  // ── Validasi: hanya host ──────────────────────────────────────────────────
  if (interaction.user.id !== gameState.host_id) {
    return interaction.reply({
      content: `⛔ Hanya Host (<@${gameState.host_id}>) yang bisa mengubah konfigurasi.`,
      ephemeral: true,
    });
  }

  const playerCount = gameState.lobby_players.length;

  // ── /config show ──────────────────────────────────────────────────────────
  if (sub === 'show') {
    const cfg        = gameState.session_config;
    const roles      = cfg.role_mode === 'auto'
      ? calculateAutoRoles(playerCount)
      : calculateCustomRoles(playerCount, cfg.werewolves, cfg.seers);
    const roleSummary = formatRoleSummary(roles);

    // Ambil data host & VC untuk embed yang identik dengan /setup
    const hostUser   = await interaction.guild.members.fetch(gameState.host_id);
    const vc         = hostUser.voice?.channel ?? { name: '—' };
    const vcMembers  = vc.members
      ? [...vc.members.values()].filter(m => !m.user.bot)
      : [];
    const playerList = vcMembers.map((m, i) => `${i + 1}. <@${m.id}>`).join('\n') || '*(belum ada)*';

    return interaction.reply({
      embeds: [buildLobbyEmbed(hostUser.user, vc, playerList, roleSummary, cfg.role_mode)],
    });
  }

  // ── /config auto ─────────────────────────────────────────────────────────
  if (sub === 'auto') {
    gameState.session_config.role_mode  = 'auto';
    gameState.session_config.werewolves = null;
    gameState.session_config.seers      = null;

    const roles = calculateAutoRoles(playerCount);
    await updateLobbyEmbed(interaction, 'auto', formatRoleSummary(roles));
    return interaction.reply({ content: '✅ Mode peran diubah ke **auto** (seimbang otomatis).', ephemeral: true });
  }

  // ── /config set ───────────────────────────────────────────────────────────
  if (sub === 'set') {
    const ww   = interaction.options.getInteger('werewolves');
    const seer = interaction.options.getInteger('seers');
    const roles = calculateCustomRoles(playerCount, ww, seer);

    if (!roles) {
      return interaction.reply({
        content: `❌ Konfigurasi tidak valid.\n\`Werewolf(${ww}) + Seer(${seer})\` melebihi atau tidak menyisakan Villager dari ${playerCount} pemain.\nMinimum 1 Villager diperlukan.`,
        ephemeral: true,
      });
    }

    gameState.session_config.role_mode  = 'custom';
    gameState.session_config.werewolves = ww;
    gameState.session_config.seers      = seer;

    await updateLobbyEmbed(interaction, 'custom', formatRoleSummary(roles));
    return interaction.reply({ content: `✅ Peran diset manual: ${formatRoleSummary(roles)}`, ephemeral: true });
  }
}

/**
 * Update embed lobby di #setup-cmd setelah konfigurasi berubah.
 */
async function updateLobbyEmbed(interaction, mode, roleSummary) {
  const guild    = interaction.guild;
  const guildCfg = await getGuildConfig(guild.id);
  const channel  = guild.channels.cache.get(guildCfg?.setup_cmd_id);
  if (!channel || !gameState.lobby_msg_id) return;

  try {
    const msg = await channel.messages.fetch(gameState.lobby_msg_id);
    const vc  = interaction.member.voice?.channel;
    const vcMembers   = vc ? [...vc.members.values()].filter(m => !m.user.bot) : [];
    const playerList  = vcMembers.map((m, i) => `${i + 1}. <@${m.id}>`).join('\n') || '*(belum ada)*';
    const hostUser    = await guild.members.fetch(gameState.host_id);

    await msg.edit({ embeds: [buildLobbyEmbed(hostUser.user, vc ?? { name: '—' }, playerList, roleSummary, mode)] });
  } catch (_) { /* pesan mungkin sudah dihapus */ }
}
