/**
 * roleCalculator.js — Role Distribution Utility
 * Menghitung distribusi peran berdasarkan jumlah pemain.
 */

/**
 * Hitung distribusi peran secara otomatis (seimbang).
 * @param {number} playerCount
 * @returns {{ werewolves: number, seers: number, villagers: number, total: number } | null}
 */
export function calculateAutoRoles(playerCount) {
  if (playerCount < 5) return null;

  let werewolves;
  if      (playerCount <= 6)  werewolves = 1;
  else if (playerCount <= 9)  werewolves = 2;
  else if (playerCount <= 12) werewolves = 3;
  else                        werewolves = Math.floor(playerCount / 4);

  const seers     = 1;
  const villagers = playerCount - werewolves - seers;

  return { werewolves, seers, villagers, total: playerCount };
}

/**
 * Hitung distribusi peran dari setting manual.
 * @returns {Object|null} null jika konfigurasi tidak valid
 */
export function calculateCustomRoles(playerCount, werewolves, seers) {
  const villagers = playerCount - werewolves - seers;
  if (villagers < 1 || werewolves < 1) return null;
  return { werewolves, seers, villagers, total: playerCount };
}

/**
 * Format rangkuman distribusi peran untuk ditampilkan di embed.
 */
export function formatRoleSummary(roles) {
  if (!roles) return '⚠️ Pemain tidak cukup (minimum 5 orang)';
  return [
    `🐺 Werewolf  : **${roles.werewolves}**`,
    `🔮 Seer      : **${roles.seers}**`,
    `👨‍🌾 Villager  : **${roles.villagers}**`,
  ].join('\n');
}
