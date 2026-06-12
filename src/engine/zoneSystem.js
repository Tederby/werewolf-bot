/**
 * zoneSystem.js — Zona Permainan
 *
 * 4 zona: Balai Desa, Pemukiman, Gudang, Hutan.
 * Setiap malam, pemain hidup di-assign ke zona secara acak.
 *
 * Logika clue:
 *  - Zona yang diserang WW → clue "jejak kaki" diumumkan secara publik
 *    (semua orang di zona + 1 jejak misterius = WW)
 *  - Zona aman → clue bisa di-reveal secara ephemeral via tombol
 *  - Werewolf bisa melihat SEMUA clue di tiap zona
 */

import { getAlivePlayers, getPlayersByRole } from '../gameState.js';

/** Definisi 4 zona dengan emoji dan deskripsi */
export const ZONES = [
  { id: 'balai_desa',  name: 'Balai Desa',  emoji: '🏛️', desc: 'Pusat pemerintahan desa' },
  { id: 'pemukiman',   name: 'Pemukiman',   emoji: '🏘️', desc: 'Area tempat tinggal penduduk' },
  { id: 'gudang',      name: 'Gudang',      emoji: '🏚️', desc: 'Gudang penyimpanan desa' },
  { id: 'hutan',       name: 'Hutan',       emoji: '🌲', desc: 'Hutan gelap di pinggir desa' },
];

/**
 * State zona untuk malam ini.
 * @type {{
 *   assignments: Map<string, string>,  // userId → zoneId
 *   attackedZone: string|null,          // zoneId yang diserang WW
 *   clues: Map<string, Object>,         // zoneId → clue data
 * }}
 */
const zoneState = {
  assignments: new Map(),
  attackedZone: null,
  clues: new Map(),
};

/**
 * Reset dan assign ulang zona untuk malam baru.
 * Dipanggil di awal fase malam.
 * @param {string[]} alivePlayerIds - ID pemain yang masih hidup
 */
export function assignZones(alivePlayerIds) {
  zoneState.assignments.clear();
  zoneState.attackedZone = null;
  zoneState.clues.clear();

  // Shuffle pemain
  const shuffled = [...alivePlayerIds].sort(() => Math.random() - 0.5);

  // Distribute evenly across zones
  for (let i = 0; i < shuffled.length; i++) {
    const zone = ZONES[i % ZONES.length];
    zoneState.assignments.set(shuffled[i], zone.id);
  }

  console.log(`[Zones] Assigned ${shuffled.length} players to ${ZONES.length} zones.`);
}

/**
 * Ambil zona di mana seorang pemain berada.
 * @param {string} userId
 * @returns {string|null} zoneId
 */
export function getPlayerZone(userId) {
  return zoneState.assignments.get(userId) ?? null;
}

/**
 * Ambil semua pemain di zona tertentu.
 * @param {string} zoneId
 * @returns {string[]} array of user IDs
 */
export function getPlayersInZone(zoneId) {
  const players = [];
  for (const [userId, zone] of zoneState.assignments) {
    if (zone === zoneId) players.push(userId);
  }
  return players;
}

/**
 * Set zona yang diserang werewolf.
 * Dipanggil saat WW target diketahui.
 * @param {string} targetId - ID korban WW
 */
export function setAttackedZone(targetId) {
  const zone = zoneState.assignments.get(targetId);
  zoneState.attackedZone = zone ?? null;
}

/**
 * Generate clue untuk semua zona.
 * Harus dipanggil SETELAH setAttackedZone.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Map<string, Object>>} zoneId → clue data
 */
export async function generateClues(guild) {
  zoneState.clues.clear();

  for (const zone of ZONES) {
    const playersInZone = getPlayersInZone(zone.id);
    const isAttacked = zone.id === zoneState.attackedZone;

    // Ambil display names
    const footprints = [];
    for (const pid of playersInZone) {
      const member = await guild.members.fetch(pid).catch(() => null);
      footprints.push({
        userId: pid,
        name: member?.displayName ?? `User ${pid.slice(-4)}`,
      });
    }

    // Zona diserang: tambahkan jejak misterius (werewolf)
    if (isAttacked) {
      footprints.push({
        userId: '__werewolf__',
        name: '??? (Jejak Misterius)',
      });
    }

    zoneState.clues.set(zone.id, {
      zoneId: zone.id,
      zoneName: zone.name,
      zoneEmoji: zone.emoji,
      isAttacked,
      footprintCount: footprints.length,
      footprints,
      playersInZone,
    });
  }

  return zoneState.clues;
}

/**
 * Ambil clue untuk zona tertentu.
 * @param {string} zoneId
 * @returns {Object|null}
 */
export function getZoneClue(zoneId) {
  return zoneState.clues.get(zoneId) ?? null;
}

/**
 * Ambil SEMUA clue (untuk werewolf).
 * @returns {Map<string, Object>}
 */
export function getAllClues() {
  return new Map(zoneState.clues);
}

/**
 * Format clue menjadi string untuk embed.
 * @param {Object} clue
 * @param {boolean} showNames - true = tunjukkan nama, false = hanya jumlah
 * @returns {string}
 */
export function formatClueText(clue) {
  if (!clue) return '*Tidak ada data zona.*';

  const footprintLines = clue.footprints.map((fp, i) => {
    if (fp.userId === '__werewolf__') {
      return `${i + 1}. 🐾 **${fp.name}**`;
    }
    return `${i + 1}. 👣 ${fp.name}`;
  }).join('\n');

  return `${clue.zoneEmoji} **${clue.zoneName}**\n` +
    `Terdeteksi **${clue.footprintCount}** jejak kaki:\n` +
    footprintLines;
}

/**
 * Dapatkan zone definition by id.
 * @param {string} zoneId
 * @returns {Object|undefined}
 */
export function getZoneDef(zoneId) {
  return ZONES.find(z => z.id === zoneId);
}

/**
 * Reset state zona (dipanggil saat game reset).
 */
export function resetZones() {
  zoneState.assignments.clear();
  zoneState.attackedZone = null;
  zoneState.clues.clear();
}
