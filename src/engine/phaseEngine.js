/**
 * phaseEngine.js — The Core Engine
 *
 * Mengontrol siklus permainan: Night → Day → Vote → Night → ...
 * Ini adalah "jantung" dari bot Werewolf.
 *
 * Tanggung jawab:
 *  1. Transisi fase (night ↔ day)
 *  2. Mute/unmute pemain di VC
 *  3. Lock/unlock #global-chat
 *  4. Kirim UI aksi malam ke setiap role
 *  5. Pasang Force-Next Timer (anti-AFK softlock)
 *  6. Resolve aksi malam & umumkan korban
 *  7. Jalankan voting siang (lynch vote)
 *  8. Cek win condition setiap transisi
 *  9. Zona system: clue & alibi management
 */

import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { gameState, getAlivePlayers, setPlayer } from '../gameState.js';
import {
  getNightActionRoles, getRole, resolveNight, resetNightActions,
  allActionsSubmitted,
} from '../roles/index.js';
import { checkWinCondition } from './winCondition.js';
import { startLynchVote } from './lynchVote.js';
import { getTimerConfig } from '../utils/configHelper.js';
import {
  assignZones, setAttackedZone, generateClues,
  getZoneClue, getAllClues, formatClueText, ZONES, getPlayerZone,
  resetZones,
} from './zoneSystem.js';
import { getGuildConfig } from '../utils/serverConfig.js';

/** @type {NodeJS.Timeout|null} Timer malam (anti-AFK) */
let nightTimer = null;

/** @type {NodeJS.Timeout|null} Timer diskusi siang */
let dayTimer = null;

// ══════════════════════════════════════════════════════════════════════════════
//  NIGHT PHASE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Transisi ke Fase Malam.
 * @param {import('discord.js').Client} client
 */
export async function startNightPhase(client) {
  gameState.phase = 'night';
  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  // Ambil timer dari config
  const timers = await getTimerConfig(gameState.guild_id);
  const NIGHT_DURATION = timers.nightDuration;

  console.log(`[Engine] ──── NIGHT ${gameState.day_count} ────`);

  // 1. Kunci #global-chat (tidak ada yang bisa kirim pesan)
  await lockGlobalChat(guild, true);

  // 2. Server-mute semua pemain hidup di VC
  await muteAllPlayers(guild, true);

  // 3. Reset aksi malam
  resetNightActions();

  // 4. Assign zona
  const aliveIds = getAlivePlayers().map(p => p.id);
  assignZones(aliveIds);

  // 5. Kirim pengumuman malam di #global-chat
  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
  if (globalChat) {
    // Zone assignments info
    const zoneInfo = ZONES.map(z => {
      const playersInZone = aliveIds.filter(id => getPlayerZone(id) === z.id);
      const playerMentions = playersInZone.map(id => `<@${id}>`).join(', ') || '*kosong*';
      return `${z.emoji} **${z.name}**: ${playerMentions}`;
    }).join('\n');

    await globalChat.send({
      embeds: [{
        color: 0x1a1a2e,
        title: `🌙 Malam Hari ${gameState.day_count}`,
        description: 'Keheningan menyelimuti desa... Para penduduk tertidur.\nSementara itu, makhluk-makhluk malam mulai beraksi.',
        fields: [
          {
            name: '📍 Lokasi Pemain Malam Ini',
            value: zoneInfo,
          },
        ],
        footer: { text: `⏱️ Fase malam berlangsung ${NIGHT_DURATION / 1000} detik.` },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  // 6. Kirim UI aksi malam ke setiap role yang punya night action
  const nightRoles = getNightActionRoles();
  let hasEphemeralRoles = false;

  for (const roleDef of nightRoles) {
    const hasActor = getAlivePlayers().some(p => p.data.role === roleDef.name);
    if (!hasActor) continue;

    // Role dengan channel sendiri (misal: werewolf → #werewolf-pact)
    if (roleDef.sendActionUI) {
      try {
        await roleDef.sendActionUI(client);
      } catch (err) {
        console.error(`[Engine] Error sending night UI for ${roleDef.name}:`, err);
      }
    }

    // Role yang pakai ephemeral di #global-chat (misal: seer, guardian angel, dll)
    if (roleDef.buildActionComponents) {
      hasEphemeralRoles = true;
    }
  }

  // 7. Jika ada role yang pakai ephemeral, kirim tombol generic di #global-chat
  if (hasEphemeralRoles && globalChat) {
    const actionButton = new ButtonBuilder()
      .setCustomId('night:action')
      .setLabel('🎭 Gunakan Kemampuan Malam')
      .setStyle(ButtonStyle.Primary);
    const actionRow = new ActionRowBuilder().addComponents(actionButton);

    await globalChat.send({
      embeds: [{
        color: 0x9b59b6,
        title: '🎭 Kemampuan Khusus',
        description: 'Pemain dengan kemampuan khusus, tekan tombol di bawah untuk menggunakannya.\n\n*Jika kamu hanya Villager biasa, tombol ini bukan untukmu. Tidurlah dengan tenang.*',
        footer: { text: 'Aksimu bersifat rahasia — hanya kamu yang melihat hasilnya.' },
      }],
      components: [actionRow],
    });
  }

  // 8. Pasang Force-Next Timer (anti-AFK softlock)
  clearTimeout(nightTimer);
  nightTimer = setTimeout(async () => {
    console.log('[Engine] Night timer expired — forcing dawn.');
    await resolveDawn(client);
  }, NIGHT_DURATION);

  console.log(`[Engine] Night actions sent. Timer: ${NIGHT_DURATION / 1000}s`);
}

/**
 * Dipanggil saat satu aksi malam masuk (dari interaction handler).
 * Cek apakah semua role sudah submit → kalau iya, langsung resolve.
 * @param {import('discord.js').Client} client
 */
export async function onNightActionReceived(client) {
  if (gameState.phase !== 'night') return;

  if (allActionsSubmitted()) {
    console.log('[Engine] All night actions received early — resolving dawn.');
    clearTimeout(nightTimer);
    await resolveDawn(client);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DAWN RESOLUTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve semua aksi malam dan transisi ke siang.
 * @param {import('discord.js').Client} client
 */
async function resolveDawn(client) {
  if (gameState.phase !== 'night') return; // Guard: hindari double-resolve
  gameState.phase = 'resolving'; // Temporary state untuk prevent re-entry

  clearTimeout(nightTimer);
  nightTimer = null;

  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  console.log('[Engine] ──── DAWN RESOLUTION ────');

  // 1. Resolve semua aksi
  const results = resolveNight();

  // 2. Proses hasil: siapa yang mati? siapa yang diterawang?
  const killed = [];
  const reveals = [];
  const blocked = [];

  for (const result of results) {
    switch (result.type) {
      case 'kill': {
        killed.push(result.targetId);
        // Set zona yang diserang
        setAttackedZone(result.targetId);
        break;
      }
      case 'reveal': {
        reveals.push(result);
        break;
      }
      case 'protect_blocked': {
        blocked.push(result.targetId);
        break;
      }
      case 'no_action':
      default:
        break;
    }
  }

  // 3. Generate zone clues
  await generateClues(guild);

  // 4. Apply kematian ke gameState + update server roles
  const guildCfg = await getGuildConfig(gameState.guild_id);
  for (const victimId of killed) {
    setPlayer(victimId, { status: 'dead' });
    // Buka akses graveyard, tutup global-chat
    await updateDeadPlayerPermissions(guild, victimId);
    // Update server roles
    await updateServerRoles(guild, guildCfg, victimId, 'dead');
  }

  // 5. Kirim hasil terawang ke Seer secara EPHEMERAL
  //    (Catatan: hasil reveal sekarang dikirim langsung saat Seer memilih target,
  //     bukan lagi di sini. Blok ini tetap dipertahankan sebagai fallback/log)
  for (const reveal of reveals) {
    if (!reveal.actorId) continue;
    console.log(`[Engine] Seer reveal: ${reveal.actorId} → ${reveal.targetId} (${reveal.meta.revealedRole})`);
  }

  // 6. Transisi ke siang
  await startDayPhase(client, killed, blocked);
}

// ══════════════════════════════════════════════════════════════════════════════
//  DAY PHASE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Transisi ke Fase Siang.
 * @param {import('discord.js').Client} client
 * @param {string[]} killedIds - ID pemain yang tewas semalam
 * @param {string[]} blockedIds - ID pemain yang selamat karena proteksi
 */
export async function startDayPhase(client, killedIds = [], blockedIds = []) {
  gameState.phase = 'day';
  gameState.skip_votes = [];
  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  // Ambil timer dari config
  const timers = await getTimerConfig(gameState.guild_id);
  const DAY_DISCUSSION = timers.dayDiscussion;

  console.log(`[Engine] ──── DAY ${gameState.day_count} ────`);

  // 1. Unmute pemain hidup di VC (tetap mute yang sudah dead)
  await muteAllPlayers(guild, false);

  // 2. Buka #global-chat
  await lockGlobalChat(guild, false);

  // 3. Kirim pengumuman korban
  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
  if (globalChat) {
    let description;

    if (killedIds.length === 0) {
      description = '☀️ Matahari terbit dan... **semua orang selamat!**\n' +
        'Tidak ada korban malam ini. ';
      if (blockedIds.length > 0) {
        description += 'Seseorang dilindungi oleh kekuatan misterius...';
      } else {
        description += 'Mungkin para werewolf sedang tidur? 🤔';
      }
    } else {
      const victimMentions = killedIds.map(id => `<@${id}>`).join(', ');
      description = `☀️ Matahari terbit, namun membawa kabar duka...\n\n` +
        `💀 **${victimMentions}** ditemukan tak bernyawa.\n\n` +
        `Siapakah dalang di balik ini? Saatnya berdiskusi dan mencari pelaku!`;
    }

    await globalChat.send({
      embeds: [{
        color: killedIds.length > 0 ? 0xe74c3c : 0xf1c40f,
        title: `☀️ Hari ${gameState.day_count} — Fajar Menyingsing`,
        description,
        fields: [
          {
            name: '👥 Pemain Hidup',
            value: `${getAlivePlayers().length} orang tersisa`,
            inline: true,
          },
          {
            name: '⏱️ Diskusi',
            value: `${DAY_DISCUSSION / 1000} detik`,
            inline: true,
          },
        ],
        footer: { text: 'Diskusikan siapa yang mencurigakan. Voting akan dimulai setelah waktu habis.' },
        timestamp: new Date().toISOString(),
      }],
    });

    // 4. Kirim zona clue
    await sendZoneClues(guild, globalChat, killedIds);
  }

  // 5. Cek win condition setelah kill malam
  const winResult = checkWinCondition();
  if (winResult) {
    await endGame(client, winResult);
    return;
  }

  // 6. Timer diskusi → setelah selesai, mulai voting
  clearTimeout(dayTimer);
  dayTimer = setTimeout(async () => {
    console.log('[Engine] Discussion timer expired — starting lynch vote.');

    // Kirim peringatan 
    if (globalChat) {
      await globalChat.send({
        embeds: [{
          color: 0xe67e22,
          title: '⚖️ Waktu Diskusi Habis!',
          description: 'Saatnya menentukan nasib. Siapa yang paling mencurigakan?\n\nGunakan dropdown di bawah untuk memberikan suara.',
          timestamp: new Date().toISOString(),
        }],
      });
    }

    await startLynchVote(client);
  }, DAY_DISCUSSION);

  console.log(`[Engine] Day phase started. Discussion timer: ${DAY_DISCUSSION / 1000}s`);
}

/**
 * Kirim zone clue setelah pengumuman fajar.
 * - Zona yang diserang: clue langsung diumumkan
 * - Zona aman: tombol Reveal ephemeral
 */
async function sendZoneClues(guild, globalChat, killedIds) {
  const allClues = getAllClues();

  for (const [zoneId, clue] of allClues) {
    if (clue.isAttacked) {
      // Zona diserang → pengumuman publik
      await globalChat.send({
        embeds: [{
          color: 0xe74c3c,
          title: `⚠️ ${clue.zoneEmoji} ${clue.zoneName} — Zona Serangan!`,
          description: `Terjadi serangan di **${clue.zoneName}** semalam!\n\n${formatClueText(clue)}`,
          footer: { text: 'Salah satu jejak misterius itu milik sang predator...' },
          timestamp: new Date().toISOString(),
        }],
      });
    } else {
      // Zona aman → tombol Reveal
      if (clue.playersInZone.length === 0) continue; // skip zona kosong

      const revealButton = new ButtonBuilder()
        .setCustomId(`zone:reveal:${zoneId}`)
        .setLabel(`${clue.zoneEmoji} Lihat Clue ${clue.zoneName}`)
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(revealButton);

      await globalChat.send({
        embeds: [{
          color: 0x3498db,
          title: `${clue.zoneEmoji} ${clue.zoneName} — Zona Aman`,
          description: `Tidak ada serangan di **${clue.zoneName}**.` +
            `\nTerdeteksi **${clue.footprintCount}** jejak kaki.` +
            '\n\nKlik tombol di bawah untuk melihat detil clue.',
        }],
        components: [row],
      });
    }
  }
}

/**
 * Lewati fase diskusi siang dan langsung mulai voting.
 * Dipanggil oleh command /vote.
 * @param {import('discord.js').Client} client 
 */
export async function skipDayDiscussion(client) {
  if (gameState.phase !== 'day') return;
  
  clearTimeout(dayTimer);
  dayTimer = null;
  console.log('[Engine] Discussion skipped by user — starting lynch vote.');

  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
  if (globalChat) {
    await globalChat.send({
      embeds: [{
        color: 0xe67e22,
        title: '⚖️ Waktu Diskusi Dipercepat!',
        description: 'Seseorang telah mempercepat waktu diskusi!\nSaatnya menentukan nasib. Siapa yang paling mencurigakan?\n\nGunakan dropdown di bawah untuk memberikan suara.',
        timestamp: new Date().toISOString(),
      }],
    });
  }

  await startLynchVote(client);
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAME END
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Akhiri permainan dan kirim rekapitulasi.
 * @param {import('discord.js').Client} client
 * @param {{ winner: string, reason: string }} winResult
 */
export async function endGame(client, winResult) {
  gameState.phase = 'ended';
  clearTimeout(nightTimer);
  clearTimeout(dayTimer);

  const guild = client.guilds.cache.get(gameState.guild_id);
  if (!guild) return;

  console.log(`[Engine] ──── GAME OVER: ${winResult.winner} WIN ────`);

  // Unmute semua orang di Voice Channel (force unmute)
  const voiceChannelId = gameState.channels.voice_lobby;
  if (voiceChannelId) {
    const vc = guild.channels.cache.get(voiceChannelId);
    if (vc) {
      for (const [, member] of vc.members) {
        if (!member.user.bot) {
          await member.voice.setMute(false, 'Game ended').catch(() => null);
        }
      }
    }
  }

  await lockGlobalChat(guild, false);

  // Cleanup server roles
  const guildCfg = await getGuildConfig(gameState.guild_id);
  for (const [userId] of Object.entries(gameState.players)) {
    await clearServerRoles(guild, guildCfg, userId);
  }

  // Cleanup zone state
  resetZones();

  const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
  if (!globalChat) return;

  // Buat rekapitulasi
  const allPlayers = Object.entries(gameState.players);
  const roleReveal = allPlayers.map(([id, data]) => {
    const roleDef = getRole(data.role);
    const statusEmoji = data.status === 'alive' ? '✅' : '💀';
    return `${statusEmoji} <@${id}> — ${roleDef?.emoji ?? '❓'} ${roleDef?.displayName ?? data.role}`;
  }).join('\n');

  const isWWWin = winResult.winner === 'werewolf';

  await globalChat.send({
    embeds: [{
      color: isWWWin ? 0x8b0000 : 0x2ecc71,
      title: isWWWin
        ? '🐺 WEREWOLF MENANG! 🐺'
        : '🏘️ VILLAGE MENANG! 🏘️',
      description: `${winResult.reason}\n\n**Permainan berakhir pada Hari ${gameState.day_count}.**\n*Saluran ini akan otomatis dibersihkan dalam 3 menit.*`,
      fields: [
        {
          name: '🎭 Pengungkapan Peran',
          value: roleReveal || '*Tidak ada data*',
        },
      ],
      footer: { text: 'Terima kasih telah bermain! Gunakan /stop untuk membersihkan arena lebih awal.' },
      timestamp: new Date().toISOString(),
    }],
  });

  // Auto purge after 3 minutes
  setTimeout(async () => {
    // Only purge if game hasn't been reset manually
    if (gameState.phase === 'ended' && gameState.channels.category_id) {
      const categoryId = gameState.channels.category_id;
      const { resetGame } = await import('../gameState.js');

      const gameChannelIds = [
        gameState.channels.global_chat,
        gameState.channels.ww_chat,
        gameState.channels.graveyard,
      ];
      for (const id of gameChannelIds) {
        if (!id) continue;
        const ch = guild.channels.cache.get(id);
        if (ch) await ch.delete('Auto purge after game end').catch(() => null);
      }

      resetGame();
      console.log(`[Engine] Auto-purged game channels for guild ${guild.id}`);
    }
  }, 3 * 60 * 1000);
}

// ══════════════════════════════════════════════════════════════════════════════
//  AFTER LYNCH → NEXT NIGHT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Dipanggil setelah lynch vote selesai.
 * Cek win condition, lalu transisi ke malam berikutnya.
 * @param {import('discord.js').Client} client
 */
export async function afterLynch(client) {
  // Update server roles for lynched player
  const guildCfg = await getGuildConfig(gameState.guild_id);
  const guild = client.guilds.cache.get(gameState.guild_id);

  // Cek win condition
  const winResult = checkWinCondition();
  if (winResult) {
    await endGame(client, winResult);
    return;
  }

  // Lanjut ke malam berikutnya
  gameState.day_count += 1;
  await startNightPhase(client);
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lock/Unlock #global-chat.
 * Lock = semua pemain tidak bisa kirim pesan.
 * Unlock = pemain hidup bisa kirim pesan.
 */
async function lockGlobalChat(guild, lock) {
  const channelId = gameState.channels.global_chat;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const alivePlayers = getAlivePlayers();

  try {
    if (lock) {
      // Lock: deny SendMessages untuk @everyone
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        ViewChannel: true,
      });
    } else {
      // Unlock: allow SendMessages untuk pemain hidup
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        ViewChannel: true,
      });

      // Override per-player: pemain hidup bisa kirim
      for (const player of alivePlayers) {
        await channel.permissionOverwrites.edit(player.id, {
          SendMessages: true,
          ViewChannel: true,
        });
      }
    }
  } catch (err) {
    console.error(`[Engine] Error ${lock ? 'locking' : 'unlocking'} global-chat:`, err.message);
  }
}

/**
 * Server-mute / unmute semua pemain di Voice Channel.
 * Saat mute: semua pemain di-mute.
 * Saat unmute: hanya pemain hidup yang di-unmute (dead tetap mute).
 */
async function muteAllPlayers(guild, mute) {
  const voiceChannelId = gameState.channels.voice_lobby;
  if (!voiceChannelId) return;

  const voiceChannel = guild.channels.cache.get(voiceChannelId);
  if (!voiceChannel) return;

  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot) continue;

    const playerData = gameState.players[memberId];
    if (!playerData) {
      // Bukan pemain (spectator) → selalu mute
      try { await member.voice.setMute(true, 'Spectator auto-mute'); } catch (_) { }
      continue;
    }

    try {
      if (mute) {
        // Malam: mute semua
        await member.voice.setMute(true, 'Night phase');
        setPlayer(memberId, { is_muted: true });
      } else {
        // Siang: unmute hanya pemain hidup
        if (playerData.status === 'alive') {
          await member.voice.setMute(false, 'Day phase');
          setPlayer(memberId, { is_muted: false });
        }
        // Dead players tetap mute
      }
    } catch (err) {
      console.error(`[Engine] Mute error for ${memberId}:`, err.message);
    }
  }
}

/**
 * Update permissions untuk pemain yang mati:
 *  - Buka akses #graveyard
 *  - Tutup akses kirim pesan di #global-chat (tapi masih bisa lihat)
 */
async function updateDeadPlayerPermissions(guild, userId) {
  try {
    // Buka akses graveyard
    const graveyard = guild.channels.cache.get(gameState.channels.graveyard);
    if (graveyard) {
      await graveyard.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    // Tutup akses kirim di global-chat (tapi masih bisa lihat)
    const globalChat = guild.channels.cache.get(gameState.channels.global_chat);
    if (globalChat) {
      await globalChat.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: false,
      });
    }
  } catch (err) {
    console.error(`[Engine] Error updating dead player permissions for ${userId}:`, err.message);
  }
}

/**
 * Update server roles (alive/dead) untuk seorang pemain.
 */
async function updateServerRoles(guild, guildCfg, userId, newStatus) {
  if (!guildCfg?.alive_role_id || !guildCfg?.dead_role_id) return;

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    if (newStatus === 'dead') {
      await member.roles.remove(guildCfg.alive_role_id, 'Player died').catch(() => null);
      await member.roles.add(guildCfg.dead_role_id, 'Player died').catch(() => null);
    } else if (newStatus === 'alive') {
      await member.roles.add(guildCfg.alive_role_id, 'Game start').catch(() => null);
      await member.roles.remove(guildCfg.dead_role_id, 'Game start').catch(() => null);
    }
  } catch (err) {
    console.error(`[Engine] Error updating server roles for ${userId}:`, err.message);
  }
}

/**
 * Clear server roles (dipanggil saat game berakhir).
 */
async function clearServerRoles(guild, guildCfg, userId) {
  if (!guildCfg?.alive_role_id || !guildCfg?.dead_role_id) return;

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await member.roles.remove(guildCfg.alive_role_id, 'Game ended').catch(() => null);
    await member.roles.remove(guildCfg.dead_role_id, 'Game ended').catch(() => null);
  } catch (err) {
    console.error(`[Engine] Error clearing server roles for ${userId}:`, err.message);
  }
}

// Exported for use in start.js
export { updateServerRoles, clearServerRoles };

/**
 * Cleanup timers (dipanggil saat /stop).
 */
export function cleanupTimers() {
  clearTimeout(nightTimer);
  clearTimeout(dayTimer);
  nightTimer = null;
  dayTimer = null;
}
