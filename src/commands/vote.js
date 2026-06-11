/**
 * vote.js — Command Handler: /vote
 *
 * Mengizinkan pemain untuk memilih mempercepat fase diskusi siang dan masuk ke fase voting (Lynch).
 * Membutuhkan setidaknya 60% dari pemain hidup yang menyetujui.
 */

import { SlashCommandBuilder } from 'discord.js';
import { gameState, getAlivePlayers } from '../gameState.js';
import { skipDayDiscussion } from '../engine/phaseEngine.js';

export const data = new SlashCommandBuilder()
  .setName('vote')
  .setDescription('Memilih untuk mempercepat waktu diskusi siang dan masuk ke fase voting (Lynch).');

export async function execute(interaction) {
  if (gameState.phase !== 'day') {
    return interaction.reply({ content: '⚠️ Kamu hanya bisa skip diskusi pada siang hari.', ephemeral: true });
  }
  
  const player = gameState.players[interaction.user.id];
  if (!player || player.status !== 'alive') {
    return interaction.reply({ content: '⚠️ Hanya pemain yang masih hidup yang bisa melakukan ini.', ephemeral: true });
  }

  if (gameState.skip_votes.includes(interaction.user.id)) {
    return interaction.reply({ content: '⚠️ Kamu sudah memberikan suara untuk skip diskusi.', ephemeral: true });
  }

  gameState.skip_votes.push(interaction.user.id);
  
  const alivePlayers = getAlivePlayers();
  const needed = Math.ceil(alivePlayers.length * 0.6);
  const currentVotes = gameState.skip_votes.length;

  if (currentVotes >= needed) {
    // Kosongkan array (opsional karena akan direset di fase berikutnya)
    gameState.skip_votes = [];
    
    await interaction.reply({ content: `⏭️ **${interaction.user.username}** vote skip diskusi (${currentVotes}/${needed}).\nSuara cukup! Langsung ke fase voting...` });
    
    // Langsung skip ke vote
    await skipDayDiscussion(interaction.client);
  } else {
    await interaction.reply({ content: `⏭️ **${interaction.user.username}** vote untuk mempercepat diskusi (${currentVotes}/${needed} suara).` });
  }
}
