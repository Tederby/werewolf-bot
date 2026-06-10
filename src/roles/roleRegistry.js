/**
 * roleRegistry.js — Scalable Role System
 *
 * Pattern: Setiap role mendaftarkan dirinya ke registry.
 * Engine cukup iterate registry untuk mengirim UI dan mengumpulkan aksi.
 * Menambahkan role baru = buat file baru + daftarkan di sini.
 *
 * Prinsip utama:
 *  - Aksi malam TIDAK langsung dieksekusi
 *  - Semua aksi dikumpulkan dulu, lalu di-resolve bersamaan saat fajar (dawn resolution)
 *  - Urutan resolve ditentukan oleh `priority` (lebih rendah = diproses lebih dulu)
 */

/** @typedef {'werewolf'|'seer'|'villager'|'guardian_angel'} RoleName */

/**
 * @typedef {Object} RoleDefinition
 * @property {RoleName} name        - Identifier unik role
 * @property {string}   emoji       - Emoji untuk display
 * @property {string}   displayName - Nama tampilan
 * @property {string}   team        - 'village' | 'werewolf'
 * @property {string}   winCondition - Deskripsi kondisi menang
 * @property {boolean}  hasNightAction - Apakah punya aksi malam
 * @property {number}   priority    - Urutan resolve (rendah = duluan). WW=100, Guardian=10, Seer=50
 * @property {Function|null} sendActionUI   - Fungsi kirim dropdown/UI ke pemain
 * @property {Function|null} resolveAction  - Fungsi resolve aksi saat dawn
 */

/** @type {Map<RoleName, RoleDefinition>} */
const registry = new Map();

/**
 * Daftarkan role ke registry.
 * @param {RoleDefinition} roleDef
 */
export function registerRole(roleDef) {
  if (registry.has(roleDef.name)) {
    console.warn(`[RoleRegistry] Role "${roleDef.name}" sudah terdaftar, di-overwrite.`);
  }
  registry.set(roleDef.name, roleDef);
  console.log(`[RoleRegistry] Registered: ${roleDef.emoji} ${roleDef.displayName}`);
}

/**
 * Ambil definisi role.
 * @param {RoleName} name
 * @returns {RoleDefinition|undefined}
 */
export function getRole(name) {
  return registry.get(name);
}

/**
 * Ambil semua role yang punya aksi malam, diurutkan berdasarkan priority.
 * @returns {RoleDefinition[]}
 */
export function getNightActionRoles() {
  return [...registry.values()]
    .filter(r => r.hasNightAction)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Ambil semua role yang terdaftar.
 * @returns {RoleDefinition[]}
 */
export function getAllRoles() {
  return [...registry.values()];
}

/**
 * Ambil role berdasarkan team.
 * @param {'village'|'werewolf'} team
 * @returns {RoleDefinition[]}
 */
export function getRolesByTeam(team) {
  return [...registry.values()].filter(r => r.team === team);
}
