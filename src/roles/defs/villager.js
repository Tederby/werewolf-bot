/**
 * villager.js — Role Definition: Villager 👨‍🌾
 *
 * Tidak punya aksi malam. Bertahan hidup dan voting siang hari.
 * Tim: Village
 * Win Condition: Semua Werewolf tereliminasi.
 */

import { registerRole } from '../roleRegistry.js';

registerRole({
  name           : 'villager',
  emoji          : '👨‍🌾',
  displayName    : 'Villager',
  team           : 'village',
  winCondition   : 'Semua Werewolf berhasil dieliminasi.',
  hasNightAction : false,
  priority       : 999,
  rolePoints     : 0,   // Sistem Role Point (baseline)
  sendActionUI   : null,
  resolveAction  : null,
});
