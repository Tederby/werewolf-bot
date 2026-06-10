/**
 * stop.js — Command Handler: /stop
 *
 * Menghentikan lobby atau permainan yang sedang aktif.
 *  - Host → langsung berhenti
 *  - Anggota VC (non-host) → sistem voting (≥60% anggota VC)
 */

import { SlashCommandBuilder } from 'discord.js';
import { gameState, resetGame, clearVote } from '../gameState.js';
import { getGuildConfig } from '../utils/serverConfig.js';
import { buildVoteEmbed, buildVoteRow } from './start.js';
import { requireSetupCmd } from '../utils/channelGuard.js';
import { cleanupTimers } from '../engine/phaseEngine.js';
import { cleanupLynchVote } from '../engine/lynchVote.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Hentikan lobby/permainan (host langsung, anggota VC bisa voting).');

export async function execute(interaction) {
  const guild  = interaction.guild;
  const member = interaction.member;
  const userId = interaction.user.id;

  // ── Guard: hanya jalan di #setup-cmd ─────────────────────────────────────
  if (await requireSetupCmd(interaction)) return;

  // ── Validasi: harus ada lobby atau game ───────────────────────────────────
  if (gameState.phase === 'idle') {
    return interaction.reply({ content: '⚠️ Tidak ada lobby atau permainan yang sedang aktif.', ephemeral: true });
  }

  // ── User harus di VC (kecuali host) ──────────────────────────────────────
  const vc = member.voice?.channel;
  const isHost = userId === gameState.host_id;

  if (!isHost && !vc) {
    return interaction.reply({ content: '🎤 Kamu harus berada di Voice Channel untuk voting.', ephemeral: true });
  }

  const vcMembers = vc ? [...vc.members.values()].filter(m => !m.user.bot) : [];

  // ── HOST: langsung stop ───────────────────────────────────────────────────
  if (isHost) {
    await interaction.deferReply({ ephemeral: true });
    await performStop(interaction, guild);
    return;
  }

  // ── NON-HOST: sistem voting ───────────────────────────────────────────────

  if (gameState.pending_vote.type === 'stop') {
    if (gameState.pending_vote.votes.includes(userId)) {
      return interaction.reply({ content: '⚠️ Kamu sudah memberikan suara.', ephemeral: true });
    }

    gameState.pending_vote.votes.push(userId);
    await updateStopVoteMessage(guild, vcMembers);
    await checkStopThreshold(interaction, guild, vcMembers);
    return interaction.reply({ content: '✅ Suaramu telah dicatat!', ephemeral: true });
  }

  // Inisiasi vote stop baru
  const needed   = Math.ceil(vcMembers.length * 0.6);
  const guildCfg = await getGuildConfig(guild.id);
  const setupCh  = guild.channels.cache.get(guildCfg?.setup_cmd_id);

  const voteMsg = setupCh
    ? await setupCh.send({ embeds: [buildVoteEmbed('stop', interaction.user, 1, needed, vcMembers.length)], components: [buildVoteRow('stop')] })
    : null;

  gameState.pending_vote = {
    type         : 'stop',
    initiator_id : userId,
    votes        : [userId],
    message_id   : voteMsg?.id ?? null,
    channel_id   : setupCh?.id ?? null,
    timeout_id   : setTimeout(() => expireStopVote(guild), 60_000),
  };

  return interaction.reply({
    content  : `🗳️ Kamu memulai voting untuk **stop game**.\nDibutuhkan **${needed}** dari **${vcMembers.length}** suara.\nVoting berakhir dalam **60 detik**.`,
    ephemeral: true,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Jalankan stop: hapus channel game + reset state. */
async function performStop(interaction, guild) {
  const phaseBefore = gameState.phase;

  try {
    // Cleanup engine timers
    cleanupTimers();
    cleanupLynchVote();

    // Hapus hanya 3 channel game sementara (BUKAN kategori, setup-cmd, atau voice)
    const gameChannelIds = [
      gameState.channels.global_chat,
      gameState.channels.ww_chat,
      gameState.channels.graveyard,
    ];
    for (const id of gameChannelIds) {
      if (!id) continue;
      const ch = guild.channels.cache.get(id);
      if (ch) await ch.delete('Game stopped').catch(() => null);
    }

    // Unmute semua pemain di VC sebelum reset
    const voiceChannelId = gameState.channels.voice_lobby;
    if (voiceChannelId) {
      const vc = guild.channels.cache.get(voiceChannelId);
      if (vc) {
        for (const [, member] of vc.members) {
          if (!member.user.bot) {
            await member.voice.setMute(false, 'Game stopped').catch(() => null);
          }
        }
      }
    }

    // Kirim notif ke #setup-cmd
    const guildCfg = await getGuildConfig(guild.id);
    const setupCh  = guild.channels.cache.get(guildCfg?.setup_cmd_id);
    if (setupCh) {
      await setupCh.send({
        embeds: [{
          color       : 0x808080,
          title       : '🛑 Permainan Dihentikan',
          description : `Dihentikan oleh <@${interaction.user.id}>.\nFase saat penghentian: \`${phaseBefore}\``,
          timestamp   : new Date().toISOString(),
        }],
      });
    }

    resetGame();
    await interaction.editReply('✅ Permainan telah dihentikan dan arena dibersihkan.');
    console.log(`[/stop] Game stopped | Guild: ${guild.id}`);

  } catch (err) {
    console.error('[/stop] Error:', err);
    await interaction.editReply(`❌ Terjadi error: \`${err.message}\``);
  }
}

async function updateStopVoteMessage(guild, vcMembers) {
  const { pending_vote: v } = gameState;
  if (!v.message_id || !v.channel_id) return;
  const ch = guild.channels.cache.get(v.channel_id);
  if (!ch) return;
  try {
    const msg    = await ch.messages.fetch(v.message_id);
    const needed = Math.ceil(vcMembers.length * 0.6);
    const initiatorUser = await guild.members.fetch(v.initiator_id).then(m => m.user).catch(() => ({ id: v.initiator_id }));
    await msg.edit({ embeds: [buildVoteEmbed('stop', initiatorUser, v.votes.length, needed, vcMembers.length)], components: [buildVoteRow('stop')] });
  } catch (_) {}
}

async function checkStopThreshold(interaction, guild, vcMembers) {
  const needed = Math.ceil(vcMembers.length * 0.6);
  if (gameState.pending_vote.votes.length < needed) return;

  clearVote();
  const guildCfg = await getGuildConfig(guild.id);
  const setupCh  = guild.channels.cache.get(guildCfg?.setup_cmd_id);
  await setupCh?.send('✅ **Suara cukup! Menghentikan permainan...**');

  await interaction.deferReply({ ephemeral: true });
  await performStop(interaction, guild);
}

async function expireStopVote(guild) {
  const { pending_vote: v } = gameState;
  if (v.type !== 'stop') return;
  if (v.channel_id) {
    const ch = guild.channels.cache.get(v.channel_id);
    if (ch && v.message_id) {
      const msg = await ch.messages.fetch(v.message_id).catch(() => null);
      await msg?.edit({ embeds: [{ color: 0x808080, title: '⏰ Vote Kedaluwarsa', description: 'Voting stop game telah habis waktu.' }], components: [] });
    }
  }
  clearVote();
}
