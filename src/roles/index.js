/**
 * index.js — Role Loader
 *
 * Import semua role definitions agar mereka otomatis register ke roleRegistry.
 * Untuk menambahkan role baru, cukup:
 *  1. Buat file di ./defs/namaRole.js
 *  2. Import di sini
 * 
 * That's it! Engine otomatis akan mengambil role dari registry.
 */

// ── Core Roles ───────────────────────────────────────────────────────────────
import './defs/werewolf.js';
import './defs/seer.js';
import './defs/villager.js';

// ── Future Roles (uncomment saat ditambahkan) ────────────────────────────────
// import './defs/guardianAngel.js';
// import './defs/doctor.js';
// import './defs/hunter.js';

// Re-export registry utilities
export { registerRole, getRole, getNightActionRoles, getAllRoles, getRolesByTeam } from './roleRegistry.js';
export { resetNightActions, submitAction, hasSubmitted, allActionsSubmitted, resolveNight, getActionSnapshot } from './nightActions.js';
