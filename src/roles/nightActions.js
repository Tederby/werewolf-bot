/**
 * nightActions.js — Night Action Collection & Resolution
 *
 * Sistem ini mengumpulkan SEMUA aksi malam terlebih dahulu,
 * lalu me-resolve semuanya secara bersamaan saat fajar.
 *
 * Ini memastikan:
 *  - Guardian Angel melindungi SEBELUM werewolf kill dihitung
 *  - Seer menerawang target yang MASIH HIDUP saat malam (belum terkena damage)
 *  - Tidak ada race condition antar role
 *
 * Alur:
 *  1. Night dimulai → resetNightActions()
 *  2. Setiap role submit aksi → submitAction()
 *  3. Timer habis / semua sudah submit → resolveNight()
 *  4. resolveNight() return array of NightResult
 */

import { getRole, getNightActionRoles } from './roleRegistry.js';
import { gameState, getAlivePlayers } from '../gameState.js';

/**
 * @typedef {Object} NightAction
 * @property {string}   actorId   - User ID pelaku
 * @property {string}   roleName  - Nama role pelaku
 * @property {string|null} targetId - User ID target (null = skip/AFK)
 * @property {number}   timestamp - Kapan aksi diterima
 */

/**
 * @typedef {Object} NightResult
 * @property {string}      type       - 'kill' | 'protect' | 'reveal' | 'no_action'
 * @property {string|null} targetId   - Siapa yang terkena
 * @property {string|null} actorId    - Siapa pelaku
 * @property {string}      roleName   - Role pelaku
 * @property {Object}      meta       - Data tambahan (misal: role reveal untuk seer)
 */

/** @type {Map<string, NightAction>} Map<roleName, NightAction> */
const pendingActions = new Map();

/** @type {Set<string>} Role-role yang sudah submit aksi malam ini */
const submittedRoles = new Set();

/**
 * Reset aksi malam untuk siklus baru.
 */
export function resetNightActions() {
  pendingActions.clear();
  submittedRoles.clear();
}

/**
 * Submit aksi malam dari seorang pemain.
 * @param {string} roleName  - Nama role (e.g., 'werewolf')
 * @param {string} actorId   - User ID pemain
 * @param {string|null} targetId - User ID target, null = skip
 * @returns {boolean} true jika berhasil
 */
export function submitAction(roleName, actorId, targetId) {
  if (submittedRoles.has(roleName)) {
    console.warn(`[NightActions] Role "${roleName}" sudah submit aksi, diabaikan.`);
    return false;
  }

  pendingActions.set(roleName, {
    actorId,
    roleName,
    targetId,
    timestamp: Date.now(),
  });
  submittedRoles.add(roleName);

  console.log(`[NightActions] ${roleName} submitted | Actor: ${actorId} | Target: ${targetId ?? 'SKIP'}`);
  return true;
}

/**
 * Cek apakah role tertentu sudah submit aksi.
 * @param {string} roleName
 * @returns {boolean}
 */
export function hasSubmitted(roleName) {
  return submittedRoles.has(roleName);
}

/**
 * Cek apakah SEMUA role dengan night action sudah submit.
 * @returns {boolean}
 */
export function allActionsSubmitted() {
  const nightRoles = getNightActionRoles();
  const alivePlayers = getAlivePlayers();

  for (const roleDef of nightRoles) {
    // Cek apakah masih ada pemain hidup dengan role ini
    const hasAliveActor = alivePlayers.some(p => p.data.role === roleDef.name);
    if (hasAliveActor && !submittedRoles.has(roleDef.name)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve semua aksi malam dan kembalikan hasil.
 * Dipanggil saat fajar (dawn) — setelah semua submit atau timer habis.
 *
 * Urutan resolve berdasarkan priority role:
 *  1. Guardian Angel (priority 10) → set proteksi
 *  2. Seer (priority 50) → reveal role target
 *  3. Werewolf (priority 100) → kill (tapi cek proteksi)
 *
 * @returns {NightResult[]}
 */
export function resolveNight() {
  const results = [];
  const protectedIds = new Set();
  const nightRoles = getNightActionRoles();

  // Sort by priority (ascending) dan resolve satu per satu
  for (const roleDef of nightRoles) {
    const action = pendingActions.get(roleDef.name);

    if (!action || !action.targetId) {
      // Role ini AFK atau skip
      results.push({
        type: 'no_action',
        targetId: null,
        actorId: action?.actorId ?? null,
        roleName: roleDef.name,
        meta: { reason: action ? 'skipped' : 'afk' },
      });
      continue;
    }

    // Delegasikan ke resolver spesifik role
    if (roleDef.resolveAction) {
      const roleResults = roleDef.resolveAction(action, { protectedIds, gameState });
      
      // Kumpulkan ID yang dilindungi (untuk dicek role lain)
      for (const r of roleResults) {
        if (r.type === 'protect') protectedIds.add(r.targetId);
      }
      
      results.push(...roleResults);
    }
  }

  console.log(`[NightActions] Resolved ${results.length} results | Protected: [${[...protectedIds]}]`);
  return results;
}

/**
 * Ambil snapshot aksi yang sudah masuk (untuk debugging/logging).
 * @returns {Object}
 */
export function getActionSnapshot() {
  return {
    submitted: [...submittedRoles],
    actions: Object.fromEntries(pendingActions),
  };
}
