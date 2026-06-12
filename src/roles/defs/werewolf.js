/**
 * werewolf.js — Role Definition: Werewolf 🐺
 *
 * Aksi malam: Sistem vote untuk memilih mangsa.
 * - Semua WW hidup bisa vote target
 * - Harus mayoritas (jika 50:50 → vote ulang)
 * - Jika hanya sebagian WW yang vote, dianggap bobot proporsional
 * Resolve: Kill target, kecuali target dilindungi Guardian Angel.
 * Tim: Werewolf
 * Win Condition: Jumlah WW ≥ jumlah non-WW
 */

import { registerRole } from '../roleRegistry.js';
import { gameState, getAlivePlayers, getPlayersByRole, resetWwVotes } from '../../gameState.js';
import {
  StringSelectMenuBuilder, ActionRowBuilder,
} from 'discord.js';
import { submitAction, hasSubmitted } from '../nightActions.js';

registerRole({
  name         : 'werewolf',
  emoji        : '🐺',
  displayName  : 'Werewolf',
  team         : 'werewolf',
  winCondition : 'Jumlah Werewolf ≥ jumlah pemain non-Werewolf yang masih hidup.',
  hasNightAction: true,
  priority     : 100, // Resolve terakhir — cek proteksi dulu
  rolePoints   : -6,  // Sistem Role Point (negatif = kuat/berbahaya)

  /**
   * Kirim UI dropdown ke channel #werewolf-pact.
   * Werewolf memilih target via voting system.
   * @param {import('discord.js').Client} client
   * @returns {Promise<void>}
   */
  async sendActionUI(client) {
    const wwChannel = client.channels.cache.get(gameState.channels.ww_chat);
    if (!wwChannel) return;

    const alive = getAlivePlayers().filter(p => p.data.role !== 'werewolf');
    if (alive.length === 0) return;

    const guild = client.guilds.cache.get(gameState.guild_id);

    // Reset WW votes state
    gameState.ww_votes = { votes: {}, round: 1, message_id: null, resolved: false };

    const options = await Promise.all(
      alive.map(async (p) => {
        const member = await guild.members.fetch(p.id).catch(() => null);
        return {
          label       : member?.displayName ?? `User ${p.id.slice(-4)}`,
          description : `Pilih untuk dimangsa`,
          value       : p.id,
        };
      })
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId('night:werewolf:kill')
      .setPlaceholder('🐺 Vote mangsa malam ini...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.filter(Boolean));

    const row = new ActionRowBuilder().addComponents(select);

    // Tampilkan daftar WW aktif
    const wwPlayers = getAlivePlayers().filter(p => p.data.role === 'werewolf');
    const wwList = wwPlayers.map(p => `<@${p.id}>`).join(', ');

    // Kirim dan simpan pesan all-zone clue khusus WW
    await wwChannel.send({
      embeds: [{
        color       : 0x8b0000,
        title       : `🌙 Malam Hari ${gameState.day_count} — Saatnya Berburu`,
        description : `Para Werewolf (${wwList}), **vote** mangsa kalian malam ini.\n\n` +
          `⚖️ Harus ada **mayoritas** vote!\n` +
          `• Jika seri (50:50), vote gagal dan kalian harus vote ulang.\n` +
          `• Jika hanya sebagian WW yang vote, vote yang masuk dianggap sah.\n\n` +
          `📋 **Round ${gameState.ww_votes.round}** — Setiap WW pilih target di bawah.`,
        footer      : { text: `${wwPlayers.length} Werewolf aktif.` },
        timestamp   : new Date().toISOString(),
      }],
      components: [row],
    });
  },

  /**
   * Resolve aksi kill werewolf.
   * @param {import('../nightActions.js').NightAction} action
   * @param {{ protectedIds: Set<string>, gameState: Object }} ctx
   * @returns {import('../nightActions.js').NightResult[]}
   */
  resolveAction(action, ctx) {
    const { protectedIds } = ctx;

    if (protectedIds.has(action.targetId)) {
      return [{
        type     : 'protect_blocked',
        targetId : action.targetId,
        actorId  : action.actorId,
        roleName : 'werewolf',
        meta     : { reason: 'Target dilindungi oleh Guardian Angel.' },
      }];
    }

    return [{
      type     : 'kill',
      targetId : action.targetId,
      actorId  : action.actorId,
      roleName : 'werewolf',
      meta     : {},
    }];
  },
});

/**
 * Process a single werewolf's vote.
 * Returns the result status and any messages to send.
 * 
 * @param {string} wwUserId - The WW who voted
 * @param {string} targetId - Who they voted for
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ status: 'recorded'|'resolved'|'tie', message: string }>}
 */
export async function processWwVote(wwUserId, targetId, client) {
  const wwPlayers = getPlayersByRole('werewolf');
  const totalWw = wwPlayers.length;

  // Record the vote
  gameState.ww_votes.votes[wwUserId] = targetId;
  const votedCount = Object.keys(gameState.ww_votes.votes).length;

  // Check if all WW have voted (or if majority can be determined)
  if (votedCount < totalWw) {
    // Not all WW have voted yet — check if early resolution is possible
    // (e.g. if all votes so far are for the same target, we can skip waiting)
    const allSameTarget = Object.values(gameState.ww_votes.votes).every(t => t === targetId);
    if (allSameTarget && votedCount > totalWw / 2) {
      // Majority already secured for this target
      return await resolveWwVote(targetId, client);
    }
    return { 
      status: 'recorded', 
      message: `🐺 Vote dicatat: <@${targetId}> (${votedCount}/${totalWw} WW sudah vote).` 
    };
  }

  // All WW have voted — tally
  return await tallyWwVotes(client);
}

/**
 * Tally WW votes and determine result.
 */
async function tallyWwVotes(client) {
  const votes = gameState.ww_votes.votes;
  const tally = {};
  
  for (const targetId of Object.values(votes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  }

  const entries = Object.entries(tally);
  const maxVotes = Math.max(...entries.map(([, c]) => c));
  const topTargets = entries.filter(([, c]) => c === maxVotes).map(([id]) => id);

  // Tie! (50:50)
  if (topTargets.length > 1) {
    // Format vote info for the tie message
    const voteInfo = Object.entries(votes)
      .map(([wwId, tgtId]) => `<@${wwId}> → <@${tgtId}>`)
      .join('\n');

    // Reset votes for new round
    resetWwVotes();

    const wwChannel = client.channels.cache.get(gameState.channels.ww_chat);
    if (wwChannel) {
      const alive = getAlivePlayers().filter(p => p.data.role !== 'werewolf');
      const guild = client.guilds.cache.get(gameState.guild_id);
      
      const options = await Promise.all(
        alive.map(async (p) => {
          const member = await guild.members.fetch(p.id).catch(() => null);
          return {
            label       : member?.displayName ?? `User ${p.id.slice(-4)}`,
            description : 'Pilih untuk dimangsa',
            value       : p.id,
          };
        })
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId('night:werewolf:kill')
        .setPlaceholder('🐺 Vote ulang mangsa...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options.filter(Boolean));

      const row = new ActionRowBuilder().addComponents(select);

      await wwChannel.send({
        embeds: [{
          color       : 0xff6600,
          title       : `⚠️ Vote Seri! — Round ${gameState.ww_votes.round}`,
          description : `Vote gagal! Hasil seri.\n\n**Rekap Vote Sebelumnya:**\n${voteInfo}\n\n` +
            `Silakan vote ulang.`,
          footer      : { text: 'Harus ada mayoritas!' },
          timestamp   : new Date().toISOString(),
        }],
        components: [row],
      });
    }

    return { status: 'tie', message: `⚠️ Vote seri! Harus vote ulang (Round ${gameState.ww_votes.round}).` };
  }

  // Clear winner
  const winnerId = topTargets[0];
  return await resolveWwVote(winnerId, client);
}

/**
 * Resolve WW vote — submit the kill action to nightActions.
 */
async function resolveWwVote(targetId, client) {
  if (gameState.ww_votes.resolved) {
    return { status: 'resolved', message: '✅ Target sudah dikunci.' };
  }

  gameState.ww_votes.resolved = true;

  // Use first WW voter as the "actor" (doesn't matter who, it's a group action)
  const firstWw = Object.keys(gameState.ww_votes.votes)[0] ?? getPlayersByRole('werewolf')[0]?.id;
  submitAction('werewolf', firstWw, targetId);

  const wwChannel = client.channels.cache.get(gameState.channels.ww_chat);
  if (wwChannel) {
    await wwChannel.send({
      embeds: [{
        color       : 0x2ecc71,
        title       : '✅ Target Dikunci!',
        description : `Mangsa malam ini: <@${targetId}>.\nTunggu fajar...`,
        timestamp   : new Date().toISOString(),
      }],
    });
  }

  // Send all zone clues to werewolves
  const { getAllClues, formatClueText } = await import('../../engine/zoneSystem.js');

  return { status: 'resolved', message: `🐺 Target dikunci: <@${targetId}>. Tunggu fajar...` };
}
