/**
 * werewolf.js — Role Definition: Werewolf 🐺
 *
 * Aksi malam: Memilih satu pemain untuk dibunuh.
 * Resolve: Kill target, kecuali target dilindungi Guardian Angel.
 * Tim: Werewolf
 * Win Condition: Jumlah WW ≥ jumlah non-WW
 */

import { registerRole } from '../roleRegistry.js';
import { gameState, getAlivePlayers } from '../../gameState.js';
import {
  StringSelectMenuBuilder, ActionRowBuilder,
} from 'discord.js';

registerRole({
  name         : 'werewolf',
  emoji        : '🐺',
  displayName  : 'Werewolf',
  team         : 'werewolf',
  winCondition : 'Jumlah Werewolf ≥ jumlah pemain non-Werewolf yang masih hidup.',
  hasNightAction: true,
  priority     : 100, // Resolve terakhir — cek proteksi dulu

  /**
   * Kirim UI dropdown ke channel #werewolf-pact.
   * Werewolf memilih target dari daftar pemain hidup (non-WW).
   * @param {import('discord.js').Client} client
   * @returns {Promise<void>}
   */
  async sendActionUI(client) {
    const wwChannel = client.channels.cache.get(gameState.channels.ww_chat);
    if (!wwChannel) return;

    const alive = getAlivePlayers().filter(p => p.data.role !== 'werewolf');
    if (alive.length === 0) return;

    const guild = client.guilds.cache.get(gameState.guild_id);

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
      .setPlaceholder('🐺 Pilih mangsa malam ini...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.filter(Boolean));

    const row = new ActionRowBuilder().addComponents(select);

    // Tampilkan daftar WW aktif
    const wwPlayers = getAlivePlayers().filter(p => p.data.role === 'werewolf');
    const wwList = wwPlayers.map(p => `<@${p.id}>`).join(', ');

    await wwChannel.send({
      embeds: [{
        color       : 0x8b0000,
        title       : `🌙 Malam Hari ${gameState.day_count} — Saatnya Berburu`,
        description : `Para Werewolf (${wwList}), pilih mangsa kalian malam ini.\n\n⏱️ Kalian punya **60 detik** untuk memilih. Jika tidak memilih, tidak ada yang mati malam ini.`,
        footer      : { text: 'Hanya satu Werewolf yang perlu memilih.' },
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
