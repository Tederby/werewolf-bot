/**
 * serverConfig.js — Persistent Guild Configuration
 * Menyimpan konfigurasi per-server ke file JSON agar tetap ada setelah bot restart.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, '../../data');
const DATA_PATH = path.join(DATA_DIR, 'servers.json');

async function ensureFile() {
  if (!existsSync(DATA_DIR))  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_PATH)) await writeFile(DATA_PATH, '{}', 'utf8');
}

/** Baca semua konfigurasi guild. */
async function readAll() {
  await ensureFile();
  return JSON.parse(await readFile(DATA_PATH, 'utf8'));
}

/** Ambil konfigurasi satu guild. @returns {Object|null} */
export async function getGuildConfig(guildId) {
  return (await readAll())[guildId] ?? null;
}

/** Simpan/update konfigurasi satu guild. */
export async function saveGuildConfig(guildId, config) {
  const all = await readAll();
  all[guildId] = { ...(all[guildId] ?? {}), ...config };
  await writeFile(DATA_PATH, JSON.stringify(all, null, 2), 'utf8');
}

/** Apakah guild sudah menjalankan /setup-werewolf? */
export async function isGuildSetup(guildId) {
  const cfg = await getGuildConfig(guildId);
  return cfg?.configured === true;
}
