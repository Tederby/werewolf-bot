/**
 * configHelper.js — Runtime Config Getter
 *
 * Mengambil nilai konfigurasi dari servers.json pada runtime.
 * Semua timer dan threshold WAJIB melalui helper ini,
 * agar tidak ada hardcoded values di engine.
 */

import { getGuildConfig } from './serverConfig.js';
import { mergeWithDefaults } from '../commands/bot-config.js';

/**
 * Ambil semua timer & setting runtime untuk guild tertentu.
 * @param {string} guildId
 * @returns {Promise<{
 *   nightDuration: number,   // milidetik
 *   dayDiscussion: number,   // milidetik
 *   voteDuration: number,    // milidetik
 *   voteThreshold: number,   // desimal (0.6 = 60%)
 *   minPlayers: number,
 *   memberRoleId: string|null,
 * }>}
 */
export async function getTimerConfig(guildId) {
  const cfg = await getGuildConfig(guildId);
  const settings = mergeWithDefaults(cfg?.bot_config);

  return {
    nightDuration : settings.night_timer * 1000,     // detik → ms
    dayDiscussion : settings.day_timer * 60 * 1000,  // menit → ms
    voteDuration  : settings.vote_timer * 1000,      // detik → ms
    voteThreshold : settings.vote_threshold / 100,   // persen → desimal
    minPlayers    : settings.min_players,
    memberRoleId  : settings.member_role_id,
  };
}
