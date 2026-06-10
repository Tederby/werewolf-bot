/**
 * seer.js — Role Definition: Seer 🔮
 *
 * Aksi malam: Menerawang satu pemain untuk melihat role-nya.
 * Resolve: Kirim hasil terawang secara ephemeral (private) ke Seer.
 * Tim: Village
 * Win Condition: Semua Werewolf tereliminasi.
 *
 * PENTING: Seer menerawang target yang MASIH HIDUP saat malam.
 * Meski WW menyerang target yang sama, Seer tetap dapat hasil,
 * karena semua aksi di-resolve secara bersamaan.
 */

import { registerRole } from '../roleRegistry.js';
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
  priority     : 50, // Resolve sebelum WW kill — hasilnya berdasarkan kondisi saat malam

  /**
   * Kirim UI dropdown ephemeral ke Seer di #global-chat.
   * @param {import('discord.js').Client} client
   */
  async sendActionUI(client) {
    const globalChat = client.channels.cache.get(gameState.channels.global_chat);
    if (!globalChat) return;

    const alivePlayers = getAlivePlayers();
    const seerPlayer = alivePlayers.find(p => p.data.role === 'seer');
    if (!seerPlayer) return;

    const guild = client.guilds.cache.get(gameState.guild_id);

    // Target = semua pemain hidup kecuali Seer sendiri
    const targets = alivePlayers.filter(p => p.id !== seerPlayer.id);
    if (targets.length === 0) return;

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

    // Kirim DM ke Seer (bukan di channel)
    try {
      const seerMember = await guild.members.fetch(seerPlayer.id);
      await seerMember.send({
        embeds: [{
          color       : 0x9b59b6,
          title       : `🔮 Malam Hari ${gameState.day_count} — Waktunya Menerawang`,
          description : `Seer, pilih satu pemain untuk diterawang.\n\n⏱️ Kamu punya **60 detik**. Jika tidak memilih, kamu melewatkan giliran.`,
          footer      : { text: 'Hasil terawang akan dikirim setelah fajar.' },
          timestamp   : new Date().toISOString(),
        }],
        components: [row],
      });
    } catch (err) {
      console.error(`[Seer] Gagal kirim DM ke Seer ${seerPlayer.id}:`, err.message);
      // Fallback: kirim sebagai pesan biasa di global-chat (hanya visible ke seer)
      // Untuk saat ini, log saja errornya
    }
  },

  /**
   * Resolve aksi reveal seer.
   * Seer melihat role target BERDASARKAN kondisi saat malam
   * (sebelum kill WW dieksekusi), jadi target tetap terlihat hidup.
   *
   * @param {import('../nightActions.js').NightAction} action
   * @param {{ protectedIds: Set<string>, gameState: Object }} ctx
   * @returns {import('../nightActions.js').NightResult[]}
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
