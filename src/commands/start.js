/**
 * start.js — Command Handler: /start
 *
 * Memulai permainan dari lobby.
 *  - Host → langsung mulai
 *  - Anggota VC (non-host) → sistem voting (≥60% anggota VC)
 *
 * Saat game dimulai:
 *  1. Buat Category + Channels sementara (global-chat, werewolf-pact, graveyard, voice)
 *  2. Aktifkan gameState
 */

import {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { gameState, activateGame, setChannels, setPlayer, clearVote } from '../gameState.js';
import { getGuildConfig } from '../utils/serverConfig.js';
import { calculateAutoRoles, calculateCustomRoles } from '../utils/roleCalculator.js';
import { requireSetupCmd } from '../utils/channelGuard.js';

// ── Role System & Engine ─────────────────────────────────────────────────────
import { getRole } from '../roles/index.js';
import { startNightPhase } from '../engine/phaseEngine.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Mulai permainan dari lobby (host langsung, anggota VC bisa voting).');

export async function execute(interaction) {
  const guild  = interaction.guild;
  const member = interaction.member;
  const userId = interaction.user.id;

  // ── Guard: hanya jalan di #setup-cmd ─────────────────────────────────────
  if (await requireSetupCmd(interaction)) return;

  // ── Validasi: harus ada lobby ─────────────────────────────────────────────
  if (gameState.phase !== 'lobby') {
    return interaction.reply({
      content: gameState.phase === 'idle'
        ? '⚠️ Belum ada lobby. Jalankan `/setup` terlebih dahulu.'
        : '⚠️ Permainan sudah berjalan!',
      ephemeral: true,
    });
  }

  // ── User harus di VC ──────────────────────────────────────────────────────
  const vc = member.voice?.channel;
  const guildCfg = await getGuildConfig(guild.id);
  
  if (!vc || vc.id !== guildCfg.town_square_id) {
    return interaction.reply({
      content: `🎤 Kamu harus berada di Voice Channel <#${guildCfg.town_square_id}> untuk menggunakan perintah ini.`,
      ephemeral: true,
    });
  }

  const vcMembers = [...vc.members.values()].filter(m => !m.user.bot);

  // ── HOST: langsung mulai ──────────────────────────────────────────────────
  if (userId === gameState.host_id) {
    await interaction.deferReply({ ephemeral: true });
    await launchGame(interaction, guild, vcMembers);
    return;
  }

  // ── NON-HOST: sistem voting ───────────────────────────────────────────────

  // Jika sudah ada vote start yang pending
  if (gameState.pending_vote.type === 'start') {
    // Cek apakah user sudah vote
    if (gameState.pending_vote.votes.includes(userId)) {
      return interaction.reply({ content: '⚠️ Kamu sudah memberikan suara.', ephemeral: true });
    }

    // Tambah suara
    gameState.pending_vote.votes.push(userId);
    await updateVoteMessage(guild, vcMembers);
    await checkVoteThreshold(interaction, guild, vcMembers);
    return interaction.reply({ content: '✅ Suaramu telah dicatat!', ephemeral: true });
  }

  // Inisiasi vote baru
  const needed  = Math.ceil(vcMembers.length * 0.6);
  const setupCh  = guild.channels.cache.get(guildCfg?.setup_cmd_id);

  const voteEmbed = buildVoteEmbed('start', interaction.user, 1, needed, vcMembers.length);
  const voteRow   = buildVoteRow('start');

  const voteMsg = setupCh
    ? await setupCh.send({ embeds: [voteEmbed], components: [voteRow] })
    : null;

  // Simpan ke state
  gameState.pending_vote = {
    type         : 'start',
    initiator_id : userId,
    votes        : [userId],
    message_id   : voteMsg?.id ?? null,
    channel_id   : setupCh?.id ?? null,
    timeout_id   : setTimeout(() => expireVote(guild, 'start'), 60_000),
  };

  return interaction.reply({
    content : `🗳️ Kamu memulai voting untuk **start game**.\nDibutuhkan **${needed}** dari **${vcMembers.length}** suara anggota VC.\nVoting berakhir dalam **60 detik**.`,
    ephemeral: true,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Buat dan aktifkan game secara penuh. */
export async function launchGame(interaction, guild, vcMembers) {
  const everyoneRole = guild.roles.everyone;

  try {
    gameState.phase = 'init';
    await interaction.editReply('⚙️ Menyiapkan arena...');

    // Hitung peran
    const cfg   = gameState.session_config;
    const count = vcMembers.length;
    const roles = cfg.role_mode === 'auto'
      ? calculateAutoRoles(count)
      : calculateCustomRoles(count, cfg.werewolves, cfg.seers);

    if (!roles) {
      gameState.phase = 'lobby';
      return interaction.editReply('❌ Konfigurasi peran tidak valid untuk jumlah pemain saat ini. Gunakan `/config auto`.');
    }

    // ── Ambil kategori & VC permanen dari server config ────────────────────
    const guildCfg = await getGuildConfig(guild.id);
    const categoryId = guildCfg?.setup_category_id;
    const voiceLobbyId = guildCfg?.town_square_id;

    if (!categoryId) {
      gameState.phase = 'lobby';
      return interaction.editReply('❌ Kategori Werewolf tidak ditemukan. Jalankan `/setup-werewolf` ulang.');
    }

    // ── Buat 3 channel game sementara di dalam kategori permanen ───────────
    const globalChat = await guild.channels.create({
      name: 'global-chat', type: ChannelType.GuildText, parent: categoryId,
      topic: '💬 Diskusi umum. Aktif saat Fase Siang.',
      permissionOverwrites: [
        { id: everyoneRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ],
    });

    const wwChat = await guild.channels.create({
      name: 'werewolf-pact', type: ChannelType.GuildText, parent: categoryId,
      topic: '🩸 Saluran rahasia para Werewolf.',
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ],
    });

    const graveyard = await guild.channels.create({
      name: 'graveyard', type: ChannelType.GuildText, parent: categoryId,
      topic: '⚰️ Khusus jiwa yang telah gugur.',
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ],
    });

    // ── Simpan channel IDs ke gameState (category & VC dari config) ────────
    setChannels({
      category_id : categoryId,
      global_chat : globalChat.id,
      ww_chat     : wwChat.id,
      graveyard   : graveyard.id,
      voice_lobby : voiceLobbyId ?? null,
    });

    // ── Aktifkan game ─────────────────────────────────────────────────────
    activateGame();
    clearVote();

    // ── Distribusi role secara acak ──────────────────────────────────────
    const shuffled = [...vcMembers].sort(() => Math.random() - 0.5);
    let idx = 0;
    for (let i = 0; i < roles.werewolves; i++) {
      setPlayer(shuffled[idx].id, { role: 'werewolf' });
      await wwChat.permissionOverwrites.edit(shuffled[idx].id, {
        ViewChannel: true, SendMessages: true,
      });
      idx++;
    }
    for (let i = 0; i < roles.seers; i++) {
      setPlayer(shuffled[idx].id, { role: 'seer' });
      idx++;
    }
    while (idx < shuffled.length) {
      setPlayer(shuffled[idx].id, { role: 'villager' });
      idx++;
    }

    // ── Kirim DM role ke setiap pemain ──────────────────────────────────
    for (const member of vcMembers) {
      const playerData = gameState.players[member.id];
      const roleDef    = getRole(playerData.role);
      try {
        await member.send({
          embeds: [{
            color       : playerData.role === 'werewolf' ? 0x8b0000 : 0x2ecc71,
            title       : `${roleDef?.emoji ?? '❓'} Peran Kamu: ${roleDef?.displayName ?? playerData.role}`,
            description : `**Tim:** ${roleDef?.team === 'werewolf' ? '🐺 Werewolf' : '🏘️ Village'}\n` +
                          `**Tujuan:** ${roleDef?.winCondition ?? '-'}`,
            footer      : { text: 'Jangan beritahu siapapun peranmu! 🤫' },
            timestamp   : new Date().toISOString(),
          }],
        });
      } catch (err) {
        console.warn(`[/start] Gagal DM ke ${member.user.tag}: ${err.message}`);
      }
    }

    // ── Pengumuman di #global-chat ─────────────────────────────────────────
    await globalChat.send({
      embeds: [{
        color       : 0x8b0000,
        title       : '🌙 Malam Pertama Telah Tiba...',
        description : `Permainan dimulai dengan **${count} pemain**.\nDistribusi peran:\n🐺 ${roles.werewolves} Werewolf | 🔮 ${roles.seers} Seer | 👨‍🌾 ${roles.villagers} Villager\n\nSetiap pemain telah menerima peran via DM.`,
        footer      : { text: 'Fase malam dimulai...' },
        timestamp   : new Date().toISOString(),
      }],
    });

    await interaction.editReply(
      `✅ **Permainan dimulai!**\n📢 <#${globalChat.id}> | ⚰️ <#${graveyard.id}>`
    );

    console.log(`[/start] Game launched | Guild: ${guild.id} | Players: ${count}`);

    // ── Mulai fase malam pertama ──────────────────────────────────────────
    await startNightPhase(guild.client);

  } catch (err) {
    console.error('[/start] Error:', err);
    gameState.phase = 'lobby';
    await interaction.editReply(`❌ Gagal memulai game: \`${err.message}\``);
  }
}

/** Update pesan vote dengan jumlah suara terbaru. */
async function updateVoteMessage(guild, vcMembers) {
  const { pending_vote: v } = gameState;
  if (!v.message_id || !v.channel_id) return;

  const ch = guild.channels.cache.get(v.channel_id);
  if (!ch) return;

  try {
    const msg     = await ch.messages.fetch(v.message_id);
    const needed  = Math.ceil(vcMembers.length * 0.6);
    const initiatorUser = await guild.members.fetch(v.initiator_id).then(m => m.user).catch(() => ({ id: v.initiator_id }));
    await msg.edit({ embeds: [buildVoteEmbed('start', initiatorUser, v.votes.length, needed, vcMembers.length)], components: [buildVoteRow('start')] });
  } catch (_) {}
}

/** Periksa apakah threshold terpenuhi; jika ya, launch game. */
async function checkVoteThreshold(interaction, guild, vcMembers) {
  const needed = Math.ceil(vcMembers.length * 0.6);
  if (gameState.pending_vote.votes.length < needed) return;

  // Threshold terpenuhi!
  clearVote();

  // Jalankan game — gunakan fake deferred interaction (bot-initiated)
  const guildCfg = await getGuildConfig(guild.id);
  const setupCh  = guild.channels.cache.get(guildCfg?.setup_cmd_id);

  await setupCh?.send('✅ **Suara cukup! Memulai permainan...**');

  // Simulasi: pakai interaction yang sudah ada untuk defer dan launch
  await interaction.deferReply({ ephemeral: true });
  await launchGame(interaction, guild, vcMembers);
}

/** Handle vote timeout. */
async function expireVote(guild, type) {
  const { pending_vote: v } = gameState;
  if (v.type !== type) return;

  if (v.channel_id) {
    const ch = guild.channels.cache.get(v.channel_id);
    if (ch && v.message_id) {
      const msg = await ch.messages.fetch(v.message_id).catch(() => null);
      await msg?.edit({ embeds: [{ color: 0x808080, title: '⏰ Vote Kedaluwarsa', description: 'Voting untuk memulai game telah habis waktu.' }], components: [] });
    }
  }
  clearVote();
}

/** Embed status voting. */
export function buildVoteEmbed(type, initiator, current, needed, total) {
  const isStart  = type === 'start';
  const progress = '█'.repeat(current) + '░'.repeat(Math.max(0, needed - current));
  return {
    color       : isStart ? 0x2ecc71 : 0xe74c3c,
    title       : isStart ? '🗳️ Vote: Mulai Permainan?' : '🗳️ Vote: Hentikan Permainan?',
    description : `<@${initiator.id}> meminta vote untuk **${isStart ? 'memulai' : 'menghentikan'}** game.`,
    fields: [
      { name: 'Progres',  value: `\`${progress}\` ${current}/${needed}`, inline: true },
      { name: 'VC Aktif', value: `${total} orang`,                       inline: true },
    ],
    footer    : { text: 'Klik tombol di bawah atau ketik perintah yang sama untuk vote. Berakhir dalam 60 detik.' },
    timestamp : new Date().toISOString(),
  };
}

/** Action row dengan tombol vote. */
export function buildVoteRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vote:${type}:yes`)
      .setLabel('✅ Vote Ya')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`vote:${type}:cancel`)
      .setLabel('❌ Batalkan')
      .setStyle(ButtonStyle.Danger),
  );
}
