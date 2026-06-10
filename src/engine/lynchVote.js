/**
 * lynchVote.js — Voting Eksekusi Siang Hari
 *
 * Setelah diskusi siang, semua pemain hidup vote siapa yang digantung.
 * - Tie (seri) = tidak ada yang mati
 * - Mayoritas = target dieksekusi tanpa mengungkap role-nya
 */

import {
  StringSelectMenuBuilder, ActionRowBuilder,
} from 'discord.js';
import { gameState, getAlivePlayers, setPlayer } from '../gameState.js';
import { afterLynch } from './phaseEngine.js';

/** @type {Map<string, string>} Map<voterId, targetId> */
const lynchVotes = new Map();

/** @type {NodeJS.Timeout|null} */
let voteTimer = null;

const VOTE_DURATION = 60_000; // 60 detik untuk voting

/**
 * Mulai voting lynch di #global-chat.
 * @param {import('discord.js').Client} client
 */
export async function startLynchVote(client) {
  lynchVotes.clear();
  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
  if (!globalChat) return;

  const alive = getAlivePlayers();
  if (alive.length < 2) {
    // Tidak cukup pemain untuk vote
    await afterLynch(client);
    return;
  }

  const options = await Promise.all(
    alive.map(async (p) => {
      const member = await guild.members.fetch(p.id).catch(() => null);
      return {
        label: member?.displayName ?? `User ${p.id.slice(-4)}`,
        description: 'Vote untuk menggantung pemain ini',
        value: p.id,
      };
    })
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('lynch:vote')
    .setPlaceholder('⚖️ Pilih siapa yang ingin kamu gantung...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.filter(Boolean));

  const row = new ActionRowBuilder().addComponents(select);

  await globalChat.send({
    embeds: [{
      color: 0xe74c3c,
      title: '⚖️ Voting Eksekusi',
      description: `Pilih siapa yang menurutmu adalah Werewolf!\n\n⏱️ Voting berlangsung **${VOTE_DURATION / 1000} detik**.\nJika seri, tidak ada yang dieksekusi.`,
      fields: [{
        name: '📊 Status',
        value: `0/${alive.length} pemain sudah vote`,
      }],
      timestamp: new Date().toISOString(),
    }],
    components: [row],
  });

  // Timer voting
  clearTimeout(voteTimer);
  voteTimer = setTimeout(async () => {
    console.log('[Lynch] Vote timer expired — tallying votes.');
    await tallyVotes(client);
  }, VOTE_DURATION);
}

/**
 * Terima vote dari pemain.
 * @param {import('discord.js').Client} client
 * @param {string} voterId
 * @param {string} targetId
 * @returns {{ success: boolean, message: string }}
 */
export function castLynchVote(client, voterId, targetId) {
  // Validasi: harus hidup
  const voterData = gameState.players[voterId];
  if (!voterData || voterData.status !== 'alive') {
    return { success: false, message: '⚠️ Kamu tidak bisa vote (sudah mati atau bukan pemain).' };
  }

  // Simpan vote (overwrite jika sudah pernah vote)
  const isChange = lynchVotes.has(voterId);
  lynchVotes.set(voterId, targetId);

  const alive = getAlivePlayers();
  const msg = isChange
    ? `✅ Vote kamu telah diubah. (${lynchVotes.size}/${alive.length})`
    : `✅ Vote dicatat! (${lynchVotes.size}/${alive.length})`;

  // Cek apakah semua sudah vote → langsung tally
  if (lynchVotes.size >= alive.length) {
    clearTimeout(voteTimer);
    // Use setImmediate to avoid blocking the interaction reply
    setImmediate(() => tallyVotes(client));
  }

  return { success: true, message: msg };
}

/**
 * Hitung suara dan eksekusi hasil.
 * @param {import('discord.js').Client} client
 */
async function tallyVotes(client) {
  clearTimeout(voteTimer);
  voteTimer = null;

  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);

  // Hitung suara
  /** @type {Map<string, number>} */
  const tally = new Map();
  for (const [, targetId] of lynchVotes) {
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
  }

  // Cari suara terbanyak
  let maxVotes = 0;
  let topTargets = [];
  for (const [targetId, count] of tally) {
    if (count > maxVotes) {
      maxVotes = count;
      topTargets = [targetId];
    } else if (count === maxVotes) {
      topTargets.push(targetId);
    }
  }

  // Format tabel hasil
  const tallyLines = [];
  for (const [targetId, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(count) + '░'.repeat(Math.max(0, lynchVotes.size - count));
    tallyLines.push(`<@${targetId}>: ${bar} (${count})`);
  }
  const tallyText = tallyLines.join('\n') || '*Tidak ada yang vote*';

  // Tie atau tidak ada vote → tidak ada eksekusi
  if (topTargets.length !== 1 || lynchVotes.size === 0) {
    if (globalChat) {
      await globalChat.send({
        embeds: [{
          color: 0x808080,
          title: '⚖️ Hasil Voting — Seri!',
          description: topTargets.length > 1
            ? 'Hasil voting seri! Tidak ada yang dieksekusi hari ini.'
            : 'Tidak ada yang memberikan suara. Hari berlalu dengan tenang.',
          fields: [{ name: '📊 Rekap Suara', value: tallyText }],
          timestamp: new Date().toISOString(),
        }],
      });
    }

    lynchVotes.clear();
    await afterLynch(client);
    return;
  }

  // Eksekusi! (Tidak reveal role)
  const executedId = topTargets[0];
  setPlayer(executedId, { status: 'dead' });

  // Update permissions
  await updateLynchedPlayerPermissions(guild, executedId);

  if (globalChat) {
    const member = await guild.members.fetch(executedId).catch(() => null);
    const name = member?.displayName ?? `User ${executedId.slice(-4)}`;

    await globalChat.send({
      embeds: [{
        color: 0x2c2f33,
        title: '⚖️ Eksekusi!',
        description: `Rakyat telah memutuskan...\n\n💀 **${name}** (<@${executedId}>) telah digantung oleh desa.\n\n*Role mereka tetap menjadi misteri...*`,
        fields: [{ name: '📊 Rekap Suara', value: tallyText }],
        footer: { text: 'Apakah keputusan ini tepat? Malam akan segera tiba...' },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  lynchVotes.clear();
  await afterLynch(client);
}

/**
 * Update permissions pemain yang di-lynch.
 */
async function updateLynchedPlayerPermissions(guild, userId) {
  try {
    const graveyard = guild.channels.cache.get(gameState.channels.graveyard);
    if (graveyard) {
      await graveyard.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
    if (globalChat) {
      await globalChat.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: false,
      });
    }

    // Mute di VC jika masih terkoneksi
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.voice?.channel) {
      await member.voice.setMute(true, 'Lynched').catch(() => null);
    }
  } catch (err) {
    console.error(`[Lynch] Error updating permissions for ${userId}:`, err.message);
  }
}

/**
 * Cleanup (dipanggil saat /stop).
 */
export function cleanupLynchVote() {
  clearTimeout(voteTimer);
  voteTimer = null;
  lynchVotes.clear();
}
