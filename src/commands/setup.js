/**
 * setup.js — Command Handler: /setup
 *
 * Membuka lobby permainan. Siapa pertama yang mengetik /setup
 * menjadi HOST sesi tersebut.
 *
 * Flow:
 *  1. Cek tidak ada lobby/game aktif
 *  2. User harus berada di Voice Channel
 *  3. Scan pemain di VC (excludes bots)
 *  4. Inisialisasi lobby di gameState
 *  5. Kirim embed preview dengan tombol Config/Start/Cancel
 */

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { gameState, initLobby } from '../gameState.js';
import { getGuildConfig } from '../utils/serverConfig.js';
import { calculateAutoRoles, formatRoleSummary } from '../utils/roleCalculator.js';
import { requireSetupCmd } from '../utils/channelGuard.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Buka lobby permainan Werewolf. Pengguna pertama yang mengetik ini menjadi Host.');

export async function execute(interaction) {
  const guild  = interaction.guild;
  const member = interaction.member;

  // ── Guard: hanya jalan di #setup-cmd ─────────────────────────────────────
  if (await requireSetupCmd(interaction)) return;

  // ── Validasi: tidak ada lobby/game yang sedang berjalan ───────────────────
  if (gameState.phase !== 'idle') {
    const who = `<@${gameState.host_id}>`;
    const status = gameState.game_active ? 'sedang berlangsung' : 'sedang dalam fase lobby';
    return interaction.reply({
      content: `⚠️ Permainan ${status}! Host saat ini: ${who}.\nGunakan \`/stop\` untuk mengakhiri sesi tersebut terlebih dahulu.`,
      ephemeral: true,
    });
  }

  // ── Validasi: user harus di VC ────────────────────────────────────────────
  const vc = member.voice?.channel;
  const guildCfg   = await getGuildConfig(guild.id);
  
  if (!vc || vc.id !== guildCfg.town_square_id) {
    return interaction.reply({
      content: `🎤 Kamu harus bergabung ke Voice Channel <#${guildCfg.town_square_id}> terlebih dahulu sebelum membuka lobby!`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  // ── Scan pemain di VC (exclude bots) ──────────────────────────────────────
  const vcMembers    = [...vc.members.values()].filter(m => !m.user.bot);
  const lobbyPlayers = vcMembers.map(m => m.id);

  // ── Init lobby ────────────────────────────────────────────────────────────
  initLobby(guild.id, interaction.user.id, lobbyPlayers);

  // ── Buat embed preview ────────────────────────────────────────────────────
  const roles     = calculateAutoRoles(lobbyPlayers.length);
  const roleSummary = formatRoleSummary(roles);
  const playerList  = vcMembers.map((m, i) => `${i + 1}. <@${m.id}>`).join('\n') || '*(belum ada)*';

  const embed = buildLobbyEmbed(interaction.user, vc, playerList, roleSummary, 'auto');
  const actionRow = buildLobbyButtons();

  // ── Kirim ke #setup-cmd ───────────────────────────────────────────────────
  const setupCmdCh = guild.channels.cache.get(guildCfg.setup_cmd_id);

  let lobbyMsg = null;
  if (setupCmdCh) {
    lobbyMsg = await setupCmdCh.send({ embeds: [embed], components: [actionRow] });
    gameState.lobby_msg_id = lobbyMsg.id;
  }

  await interaction.editReply(
    `✅ Kamu sekarang menjadi **Host** sesi ini!\nLobby telah dibuka di <#${guildCfg.setup_cmd_id}>.\n\n` +
    `Gunakan tombol di embed atau \`/config\` untuk mengatur peran, \`/start\` untuk langsung mulai.`
  );

  console.log(`[/setup] Lobby opened | Host: ${interaction.user.tag} | Players: ${lobbyPlayers.length}`);
}

/**
 * Membangun embed status lobby.
 * Dipanggil juga dari /config untuk memperbarui pesan yang sama.
 */
export function buildLobbyEmbed(hostUser, vc, playerList, roleSummary, mode) {
  return {
    color       : 0xe67e22,
    title       : '🐺 Lobby Werewolf — Menunggu Dimulai',
    description : `**Host:** <@${hostUser.id}>\n**Voice Channel:** ${vc.name}`,
    fields: [
      { name: `👥 Pemain (${playerList.split('\n').length})`, value: playerList, inline: true },
      { name: `🎭 Distribusi Peran (mode: \`${mode}\`)`,      value: roleSummary, inline: true },
    ],
    footer    : { text: 'Gunakan tombol di bawah untuk Config, Start, atau Cancel.' },
    timestamp : new Date().toISOString(),
  };
}

/**
 * Buat tombol Config, Start, Cancel untuk lobby embed.
 */
export function buildLobbyButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lobby:config')
      .setLabel('⚙️ Config')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lobby:start')
      .setLabel('▶️ Start')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('lobby:cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}
