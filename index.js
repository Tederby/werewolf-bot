/**
 * index.js — Entry Point Bot Werewolf
 *
 * Bertanggung jawab untuk:
 *  - Login ke Discord
 *  - Deploy slash commands ke guild
 *  - Routing interaksi (slash commands + button clicks) ke handler yang tepat
 *  - Guard: blokir semua command kecuali /setup-werewolf & /ping jika server
 *    belum pernah menjalankan /setup-werewolf
 */

import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Events, REST, Routes, Collection } from 'discord.js';

import * as pingCmd from './src/commands/ping.js';
import * as setupWerewolfCmd from './src/commands/setup-werewolf.js';
import * as botConfigCmd from './src/commands/bot-config.js';
import * as setupCmd from './src/commands/setup.js';
import * as configCmd from './src/commands/config.js';
import * as startCmd from './src/commands/start.js';
import * as stopCmd from './src/commands/stop.js';
import * as testCmd from './src/commands/test.js';

import { isGuildSetup } from './src/utils/serverConfig.js';
import { gameState, clearVote } from './src/gameState.js';
import { launchGame, buildVoteEmbed, buildVoteRow } from './src/commands/start.js';

// ── Role System (auto-registers all roles on import) ──────────────────────
import { getRole } from './src/roles/index.js';
import { submitAction, hasSubmitted } from './src/roles/nightActions.js';
import { onNightActionReceived } from './src/engine/phaseEngine.js';
import { castLynchVote } from './src/engine/lynchVote.js';

dotenv.config();

// ── Environment validation ─────────────────────────────────────────────────
const { DISCORD_TOKEN: token, DISCORD_CLIENT_ID: clientId, DISCORD_GUILD_ID: guildId } = process.env;
if (!token || !clientId || !guildId) {
  console.error('❌ DISCORD_TOKEN, DISCORD_CLIENT_ID, dan DISCORD_GUILD_ID harus diset di .env');
  process.exit(1);
}

// ── Command registry ───────────────────────────────────────────────────────
const commands = new Collection();

// Commands yang BEBAS digunakan tanpa setup-werewolf terlebih dahulu
const UNGUARDED = new Set(['ping', 'setup-werewolf', 'bot-config', 'test']);

const allCommands = [pingCmd, setupWerewolfCmd, botConfigCmd, setupCmd, configCmd, startCmd, stopCmd, testCmd];
for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
  console.log(`[Commands] Registered: /${cmd.data.name}`);
}

// ── Deploy slash commands ──────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  try {
    console.log('[Deploy] Deploying slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands.map(cmd => cmd.data.toJSON()) }
    );
    console.log('[Deploy] ✅ Deployed successfully!');
  } catch (err) {
    console.error('[Deploy] ❌ Error:', err);
  }
}

// ── Discord Client ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async () => {
  console.log(`[Bot] ✅ Online sebagai ${client.user.tag}`);
  await deployCommands();
});

// ── Interaction Router ─────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Slash Commands ───────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: '❌ Command tidak dikenal.', ephemeral: true });

    // Guard: cek apakah server sudah di-setup
    if (!UNGUARDED.has(interaction.commandName)) {
      const ready = await isGuildSetup(interaction.guild.id);
      if (!ready) {
        return interaction.reply({
          content: '⚙️ **Bot belum di-setup di server ini!**\nMinta Admin untuk menjalankan `/setup-werewolf` terlebih dahulu.',
          ephemeral: true,
        });
      }
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[Router] Error /${interaction.commandName}:`, err);
      const msg = { content: '❌ Terjadi kesalahan internal.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => null);
      else await interaction.reply(msg).catch(() => null);
    }
    return;
  }

  // ── Button Interactions ───────────────────────────────────────────────────
  if (interaction.isButton()) {
    const [prefix, type, action] = interaction.customId.split(':');

    // ── Test Mode Buttons ─────────────────────────────────────────────────
    if (prefix === 'test') {
      await testCmd.handleTestButton(interaction, type);
      return;
    }

    // ── Night Action Button (ephemeral ability UI) ─────────────────────────
    if (prefix === 'night' && type === 'action') {
      if (gameState.phase !== 'night') {
        return interaction.reply({ content: '⚠️ Bukan fase malam.', ephemeral: true });
      }
      const player = gameState.players[interaction.user.id];
      if (!player || player.status !== 'alive') {
        return interaction.reply({ content: '⚠️ Kamu bukan pemain aktif.', ephemeral: true });
      }

      const roleDef = getRole(player.role);

      // Werewolf: arahkan ke #werewolf-pact
      if (player.role === 'werewolf') {
        const wwChId = gameState.channels.ww_chat;
        return interaction.reply({
          content: `🐺 Gunakan channel <#${wwChId}> untuk memilih mangsa.`,
          ephemeral: true,
        });
      }

      // Role tanpa kemampuan malam (villager)
      if (!roleDef?.buildActionComponents) {
        return interaction.reply({
          content: '😴 Kamu tidak punya kemampuan khusus. Tidurlah dengan tenang dan tunggu pagi.',
          ephemeral: true,
        });
      }

      // Cek apakah role ini sudah submit
      if (hasSubmitted(player.role)) {
        return interaction.reply({
          content: '✅ Kamu sudah menggunakan kemampuanmu malam ini. Tunggu fajar...',
          ephemeral: true,
        });
      }

      // Bangun dan kirim UI secara ephemeral
      try {
        const ui = await roleDef.buildActionComponents(interaction.guild, interaction.user.id);
        return interaction.reply({ ...ui, ephemeral: true });
      } catch (err) {
        console.error(`[Router] Error building action UI for ${player.role}:`, err);
        return interaction.reply({ content: '❌ Terjadi error saat menyiapkan UI.', ephemeral: true });
      }
    }

    if (prefix !== 'vote') return;

    const guild = interaction.guild;
    const member = interaction.member;
    const userId = interaction.user.id;
    const vc = member.voice?.channel;

    // Validasi: user harus di VC untuk vote via button
    if (!vc) {
      return interaction.reply({ content: '🎤 Kamu harus berada di Voice Channel untuk vote.', ephemeral: true });
    }

    const vcMembers = [...vc.members.values()].filter(m => !m.user.bot);

    // ── Tombol CANCEL ─────────────────────────────────────────────────────
    if (action === 'cancel') {
      if (userId !== gameState.pending_vote.initiator_id && userId !== gameState.host_id) {
        return interaction.reply({ content: '⛔ Hanya inisiator atau host yang bisa membatalkan voting.', ephemeral: true });
      }
      const ch = guild.channels.cache.get(gameState.pending_vote.channel_id);
      const msg = ch ? await ch.messages.fetch(gameState.pending_vote.message_id).catch(() => null) : null;
      await msg?.edit({ embeds: [{ color: 0x808080, title: '❌ Voting Dibatalkan', description: `Dibatalkan oleh <@${userId}>.` }], components: [] });
      clearVote();
      return interaction.reply({ content: '✅ Voting telah dibatalkan.', ephemeral: true });
    }

    // ── Tombol YES ────────────────────────────────────────────────────────
    if (action === 'yes') {
      // Validasi: vote harus sesuai type
      if (gameState.pending_vote.type !== type) {
        return interaction.reply({ content: '⚠️ Tidak ada vote aktif untuk tipe ini.', ephemeral: true });
      }
      if (gameState.pending_vote.votes.includes(userId)) {
        return interaction.reply({ content: '⚠️ Kamu sudah memberikan suara sebelumnya.', ephemeral: true });
      }

      gameState.pending_vote.votes.push(userId);
      const needed = Math.ceil(vcMembers.length * 0.6);
      const current = gameState.pending_vote.votes.length;

      // Update embed
      const ch = guild.channels.cache.get(gameState.pending_vote.channel_id);
      if (ch && gameState.pending_vote.message_id) {
        const msg = await ch.messages.fetch(gameState.pending_vote.message_id).catch(() => null);
        const initiatorUser = await guild.members.fetch(gameState.pending_vote.initiator_id).then(m => m.user).catch(() => ({ id: gameState.pending_vote.initiator_id }));
        await msg?.edit({ embeds: [buildVoteEmbed(type, initiatorUser, current, needed, vcMembers.length)], components: [buildVoteRow(type)] });
      }

      await interaction.reply({ content: `✅ Suaramu dicatat! (${current}/${needed})`, ephemeral: true });

      // Cek threshold
      if (current >= needed) {
        clearVote();
        await ch?.send(`✅ **Suara cukup!** ${type === 'start' ? 'Memulai permainan...' : 'Menghentikan permainan...'}`);

        if (type === 'start') {
          // Fake a deferred reply context via channel message since we can't reuse interaction
          await ch?.send({ embeds: [{ color: 0x2ecc71, title: '⚙️ Menyiapkan arena...', description: 'Mohon tunggu sebentar.' }] });
          // We need a proper interaction to defer; instead use followUp workaround:
          await interaction.followUp({ content: '⚙️ Menyiapkan arena...', ephemeral: true });
          // Re-use launchGame by constructing a minimal proxy
          const fakeInteraction = {
            guild,
            user: interaction.user,
            editReply: async (msg) => ch?.send(typeof msg === 'string' ? msg : msg).catch(() => null),
            followUp: async (msg) => ch?.send(typeof msg === 'string' ? msg : msg).catch(() => null),
          };
          await launchGame(fakeInteraction, guild, vcMembers);

        } else if (type === 'stop') {
          const { resetGame } = await import('./src/gameState.js');
          const { cleanupTimers: ct } = await import('./src/engine/phaseEngine.js');
          const { cleanupLynchVote: clv } = await import('./src/engine/lynchVote.js');
          ct(); clv();

          // Unmute semua pemain
          const voiceId = gameState.channels.voice_lobby;
          if (voiceId) {
            const vc = guild.channels.cache.get(voiceId);
            if (vc) {
              for (const [, m] of vc.members) {
                if (!m.user.bot) await m.voice.setMute(false, 'Vote stop').catch(() => null);
              }
            }
          }

          const gameChIds = [gameState.channels.global_chat, gameState.channels.ww_chat, gameState.channels.graveyard];
          for (const id of gameChIds) {
            if (!id) continue;
            const c = guild.channels.cache.get(id);
            if (c) await c.delete('Vote stop').catch(() => null);
          }
          resetGame();
          await ch?.send({ embeds: [{ color: 0x808080, title: '🛑 Permainan Dihentikan', description: 'Dihentikan melalui voting anggota.', timestamp: new Date().toISOString() }] });
        }
      }
    }
  }

  // ── StringSelectMenu Interactions (Night Actions & Lynch Vote) ────────────
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;

    // ── Night Action: Werewolf Kill ─────────────────────────────────────────
    if (customId === 'night:werewolf:kill') {
      if (gameState.phase !== 'night') {
        return interaction.reply({ content: '⚠️ Bukan fase malam.', ephemeral: true });
      }
      const player = gameState.players[interaction.user.id];
      if (!player || player.role !== 'werewolf') {
        return interaction.reply({ content: '⚠️ Kamu bukan Werewolf.', ephemeral: true });
      }
      if (hasSubmitted('werewolf')) {
        return interaction.reply({ content: '⚠️ Werewolf sudah memilih target malam ini.', ephemeral: true });
      }

      const targetId = interaction.values[0];
      submitAction('werewolf', interaction.user.id, targetId);

      await interaction.reply({
        content: `🐺 Target dikunci: <@${targetId}>. Tunggu fajar...`,
        ephemeral: true,
      });

      // Cek apakah semua aksi sudah masuk
      await onNightActionReceived(interaction.client);
      return;
    }

    // ── Night Action: Seer Reveal ────────────────────────────────────────────
    if (customId === 'night:seer:reveal') {
      if (gameState.phase !== 'night') {
        return interaction.reply({ content: '⚠️ Bukan fase malam.', ephemeral: true });
      }
      const player = gameState.players[interaction.user.id];
      if (!player || player.role !== 'seer') {
        return interaction.reply({ content: '⚠️ Kamu bukan Seer.', ephemeral: true });
      }
      if (hasSubmitted('seer')) {
        return interaction.reply({ content: '⚠️ Kamu sudah menerawang malam ini.', ephemeral: true });
      }

      const targetId = interaction.values[0];
      submitAction('seer', interaction.user.id, targetId);

      await interaction.reply({
        content: `🔮 Kamu menerawang <@${targetId}>. Hasil akan dikirim saat fajar...`,
        ephemeral: true,
      });

      await onNightActionReceived(interaction.client);
      return;
    }

    // ── Lynch Vote ──────────────────────────────────────────────────────────
    if (customId === 'lynch:vote') {
      if (gameState.phase !== 'day') {
        return interaction.reply({ content: '⚠️ Bukan fase voting.', ephemeral: true });
      }

      const targetId = interaction.values[0];
      const result = castLynchVote(interaction.client, interaction.user.id, targetId);

      return interaction.reply({ content: result.message, ephemeral: true });
    }
  }
});

// ── Voice State Update (Edge Cases Mitigation) ─────────────────────────────
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (gameState.phase === 'idle' || gameState.phase === 'lobby') return;
  const guild = oldState.guild;
  const voiceId = gameState.channels.voice_lobby;
  if (!voiceId) return;

  // 1. User leaving the game's VC
  if (oldState.channelId === voiceId && newState.channelId !== voiceId) {
    const vc = oldState.channel;
    const vcMembers = [...vc.members.values()].filter(m => !m.user.bot);

    if (vcMembers.length === 0) {
      console.log('[Engine] Voice channel kosong, membatalkan game...');
      const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
      if (globalChat) {
        await globalChat.send({
          embeds: [{
            color: 0x808080,
            title: '🛑 Game Dibatalkan',
            description: 'Semua pemain telah meninggalkan Voice Channel. Game otomatis dibatalkan.',
          }]
        });
      }

      // Cleanup
      const { resetGame } = await import('./src/gameState.js');
      const { cleanupTimers } = await import('./src/engine/phaseEngine.js');
      const { cleanupLynchVote } = await import('./src/engine/lynchVote.js');
      cleanupTimers();
      cleanupLynchVote();

      const categoryId = gameState.channels.category_id;
      if (categoryId) {
        const childChannels = guild.channels.cache.filter(c => c.parentId === categoryId);
        for (const [, c] of childChannels) await c.delete('Voice empty cancel').catch(() => null);
        await guild.channels.cache.get(categoryId)?.delete('Voice empty cancel').catch(() => null);
      }
      resetGame();
    }
  }

  // 2. User joining the game's VC
  else if (oldState.channelId !== voiceId && newState.channelId === voiceId) {
    const memberId = newState.id;
    const player = gameState.players[memberId];

    if (!player) {
      // Bukan pemain -> mute (Spectator)
      await newState.setMute(true, 'Spectator auto-mute').catch(() => null);
    } else {
      // Pemain kembali
      if (gameState.phase === 'night' || player.status === 'dead') {
        await newState.setMute(true, 'Rejoin (Night/Dead)').catch(() => null);
      } else if (gameState.phase === 'day' && player.status === 'alive') {
        await newState.setMute(false, 'Rejoin (Day alive)').catch(() => null);
      }
    }
  }
});

// ── Login ──────────────────────────────────────────────────────────────────
client.login(token).catch(err => {
  console.error('[Bot] ❌ Login gagal:', err);
  process.exit(1);
});
