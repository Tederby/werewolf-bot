/**
 * gameState.js — The Brain
 *
 * Pusat kendali permainan Werewolf (in-memory).
 * Struktur ini dikosongkan sepenuhnya saat game berakhir.
 */

/** @type {import('./types.js').GameState} */
export const gameState = {
  // ── Status global ────────────────────────────────────────────────────────
  game_active : false,
  phase       : 'idle', // 'idle' | 'lobby' | 'init' | 'night' | 'day' | 'ended'
  day_count   : 0,
  host_id     : null,
  guild_id    : null,

  // ── Channel game (temporary — dibuat /start, dihapus /stop) ─────────────
  channels: {
    category_id : null,
    global_chat : null,
    ww_chat     : null,
    graveyard   : null,
    voice_lobby : null,
  },

  // ── Lobby (antara /setup dan /start) ─────────────────────────────────────
  lobby_players  : [],   // array of Discord user IDs (hasil scan VC)
  lobby_msg_id   : null, // ID pesan lobby di #setup-cmd (untuk di-edit)

  // ── Konfigurasi sesi ──────────────────────────────────────────────────────
  session_config: {
    role_mode   : 'auto', // 'auto' | 'custom'
    werewolves  : null,   // null = ikuti auto
    seers       : null,
  },

  // ── Pemain aktif di game ──────────────────────────────────────────────────
  players: {},
  // { [userId]: { role, status: 'alive'|'dead', is_muted: bool } }

  // ── Aksi malam ───────────────────────────────────────────────────────────
  night_actions: {
    werewolf_votes : { target_id: null },
    seer_check     : null,
  },

  // ── Sistem voting (/start & /stop oleh non-host) ──────────────────────────
  pending_vote: {
    type         : null,  // 'start' | 'stop' | null
    initiator_id : null,
    votes        : [],    // user IDs yang sudah vote
    message_id   : null,  // ID pesan vote embed
    channel_id   : null,  // ID channel pesan vote
    timeout_id   : null,  // return value dari setTimeout (untuk dibatalkan)
  },
};

// ── Fungsi State Management ──────────────────────────────────────────────────

/**
 * Inisialisasi lobby setelah /setup dipanggil.
 * @param {string} guildId
 * @param {string} hostId
 * @param {string[]} lobbyPlayers - Array user IDs hasil scan VC
 */
export function initLobby(guildId, hostId, lobbyPlayers) {
  gameState.guild_id      = guildId;
  gameState.host_id       = hostId;
  gameState.phase         = 'lobby';
  gameState.lobby_players = lobbyPlayers;
  gameState.lobby_msg_id  = null;
  gameState.session_config = { role_mode: 'auto', werewolves: null, seers: null };
  console.log(`[GameState] Lobby opened | Guild: ${guildId} | Host: ${hostId} | Players: ${lobbyPlayers.length}`);
}

/**
 * Transisi dari lobby ke game aktif.
 * Dipanggil setelah channel berhasil dibuat oleh /start.
 */
export function activateGame() {
  gameState.game_active = true;
  gameState.phase       = 'night'; // langsung ke fase malam (Fase 2)
  gameState.day_count   = 1;
  gameState.players     = {};
  gameState.lobby_players.forEach(id => {
    gameState.players[id] = { role: null, status: 'alive', is_muted: false };
  });
  gameState.night_actions = { werewolf_votes: { target_id: null }, seer_check: null };
  console.log(`[GameState] Game activated | Players: ${Object.keys(gameState.players).length}`);
}

/**
 * Reset penuh ke kondisi idle.
 * Dipanggil setelah /stop atau game berakhir.
 */
export function resetGame() {
  const prevGuild = gameState.guild_id;

  // Batalkan pending vote jika ada
  if (gameState.pending_vote.timeout_id) {
    clearTimeout(gameState.pending_vote.timeout_id);
  }

  gameState.game_active   = false;
  gameState.phase         = 'idle';
  gameState.day_count     = 0;
  gameState.host_id       = null;
  gameState.guild_id      = null;
  gameState.channels      = { category_id: null, global_chat: null, ww_chat: null, graveyard: null, voice_lobby: null };
  gameState.lobby_players = [];
  gameState.lobby_msg_id  = null;
  gameState.session_config = { role_mode: 'auto', werewolves: null, seers: null };
  gameState.players       = {};
  gameState.night_actions = { werewolf_votes: { target_id: null }, seer_check: null };
  gameState.pending_vote  = { type: null, initiator_id: null, votes: [], message_id: null, channel_id: null, timeout_id: null };

  console.log(`[GameState] Reset | Previous guild: ${prevGuild}`);
}

/**
 * Reset hanya bagian vote (setelah vote selesai/expired).
 */
export function clearVote() {
  if (gameState.pending_vote.timeout_id) clearTimeout(gameState.pending_vote.timeout_id);
  gameState.pending_vote = { type: null, initiator_id: null, votes: [], message_id: null, channel_id: null, timeout_id: null };
}

// ── Helper ───────────────────────────────────────────────────────────────────

export function setChannels(ids) {
  Object.assign(gameState.channels, ids);
}

export function setPlayer(userId, data) {
  gameState.players[userId] = { role: null, status: 'alive', is_muted: false, ...(gameState.players[userId] ?? {}), ...data };
}

export function getAlivePlayers() {
  return Object.entries(gameState.players)
    .filter(([, d]) => d.status === 'alive')
    .map(([id, data]) => ({ id, data }));
}
