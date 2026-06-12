/**
 * seer.js — Role Definition: Seer 🔮
 *
 * Aksi malam: Menerawang satu pemain untuk melihat role-nya.
 * UI: Ephemeral dropdown di #global-chat (via tombol generic "Gunakan Kemampuan").
 * Resolve: Hasil terawang langsung dikirim secara EPHEMERAL saat memilih (bukan saat fajar).
 * Tim: Village
 * Win Condition: Semua Werewolf tereliminasi.
 *
 * PENTING: Seer menerawang target yang MASIH HIDUP saat malam.
 * Meski WW menyerang target yang sama, Seer tetap dapat hasil,
 * karena semua aksi di-resolve secara bersamaan.
 */

import { registerRole, getRole } from '../roleRegistry.js';
import { gameState, getAlivePlayers } from '../../gameState.js';
import {
  StringSelectMenuBuilder, ActionRowBuilder,
} from 'discord.js';

registerRole({
  name         : 'seer',
  emoji        : '🔮',
  displayName  : 'Seer',
  team         : 'village',
  winCondition : 'Semua Werewolf berhasil dieliminasi.',
  hasNightAction: true,
  priority     : 50, // Resolve sebelum WW kill
  rolePoints   : 4,  // Sistem Role Point (positif = membantu village)

  // Seer TIDAK pakai sendActionUI (tidak kirim ke channel sendiri).
  // Sebaliknya, pakai buildActionComponents yang dikirim secara ephemeral
  // oleh engine saat pemain menekan tombol "Gunakan Kemampuan" di #global-chat.
  sendActionUI: null,

  /**
   * Bangun komponen UI untuk dikirim secara EPHEMERAL ke pemain Seer.
   * Dipanggil oleh interaction handler saat Seer menekan tombol "Gunakan Kemampuan".
   *
   * @param {import('discord.js').Guild} guild
   * @param {string} actorId - User ID Seer
   * @returns {Promise<{ embeds: Object[], components: Object[] }>}
   */
  async buildActionComponents(guild, actorId) {
    const alivePlayers = getAlivePlayers();
    const targets = alivePlayers.filter(p => p.id !== actorId);

    const options = await Promise.all(
      targets.map(async (p) => {
        const member = await guild.members.fetch(p.id).catch(() => null);
        return {
          label       : member?.displayName ?? `User ${p.id.slice(-4)}`,
          description : 'Terawang pemain ini',
          value       : p.id,
        };
      })
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId('night:seer:reveal')
      .setPlaceholder('🔮 Pilih siapa yang ingin kamu terawang...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.filter(Boolean));

    const row = new ActionRowBuilder().addComponents(select);

    return {
      embeds: [{
        color       : 0x9b59b6,
        title       : `🔮 Malam Hari ${gameState.day_count} — Waktunya Menerawang`,
        description : 'Pilih satu pemain untuk diterawang.\n\n⏱️ Kamu punya waktu terbatas. Jika tidak memilih, kamu melewatkan giliran.',
        footer      : { text: 'Hanya kamu yang melihat pesan ini. Hasil langsung diberitahu!' },
        timestamp   : new Date().toISOString(),
      }],
      components: [row],
    };
  },

  /**
   * Resolve aksi reveal seer.
   * Seer melihat role target BERDASARKAN kondisi saat malam
   * (sebelum kill WW dieksekusi), jadi target tetap terlihat hidup.
   */
  resolveAction(action, ctx) {
    const { gameState: gs } = ctx;
    const targetData = gs.players[action.targetId];

    if (!targetData) {
      return [{
        type     : 'no_action',
        targetId : action.targetId,
        actorId  : action.actorId,
        roleName : 'seer',
        meta     : { reason: 'Target tidak ditemukan.' },
      }];
    }

    return [{
      type     : 'reveal',
      targetId : action.targetId,
      actorId  : action.actorId,
      roleName : 'seer',
      meta     : {
        revealedRole : targetData.role,
        revealedTeam : targetData.role === 'werewolf' ? 'werewolf' : 'village',
      },
    }];
  },
});

/**
 * Build ephemeral reveal result for Seer.
 * Called immediately when Seer selects a target.
 * @param {string} targetId
 * @returns {{ embeds: Object[] }}
 */
export function buildSeerRevealResult(targetId) {
  const targetData = gameState.players[targetId];
  if (!targetData) {
    return {
      embeds: [{
        color: 0xe74c3c,
        title: '🔮 Hasil Terawang',
        description: 'Target tidak ditemukan.',
      }],
    };
  }

  const roleDef = getRole(targetData.role);
  const isWW = targetData.role === 'werewolf';

  return {
    embeds: [{
      color: isWW ? 0xe74c3c : 0x2ecc71,
      title: '🔮 Hasil Terawang',
      description: `Kamu menerawang <@${targetId}>...\n\n` +
        `${roleDef?.emoji ?? '❓'} Role: **${roleDef?.displayName ?? targetData.role}**\n` +
        `Tim: **${isWW ? '🐺 Werewolf' : '🏘️ Village'}**`,
      footer: { text: 'Informasi ini hanya kamu yang tahu. Gunakan dengan bijak.' },
      timestamp: new Date().toISOString(),
    }],
  };
}
