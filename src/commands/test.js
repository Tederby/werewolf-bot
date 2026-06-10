/**
 * test.js — /test Command: Solo Testing Mode
 *
 * Menjalankan simulasi game penuh secara step-by-step.
 * Admin menekan Next/End/Restart untuk mengontrol alur.
 * Virtual players mengisi slot yang diperlukan.
 *
 * SCALABLE: Steps di-generate otomatis dari role registry.
 * Menambahkan role baru = otomatis dapat test step baru.
 */

import {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { gameState, resetGame, activateGame, setChannels, setPlayer, getAlivePlayers } from '../gameState.js';
import { getNightActionRoles, getRole, getAllRoles } from '../roles/index.js';
import { resetNightActions, submitAction, resolveNight } from '../roles/nightActions.js';
import { calculateAutoRoles } from '../utils/roleCalculator.js';
import { checkWinCondition } from '../engine/winCondition.js';
import { cleanupTimers } from '../engine/phaseEngine.js';
import { cleanupLynchVote } from '../engine/lynchVote.js';

// ── Test Session State ──────────────────────────────────────────────────────
const session = {
  active: false,
  step: -1,
  steps: [],
  results: [],
  adminId: null,
  msgId: null,
  channelId: null,
  virtualIds: [],
  allPlayerIds: [],
};

const VIRTUAL_COUNT = 5; // admin + 5 virtual = 6 pemain

// ── Slash Command ───────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('test')
  .setDescription('🧪 Mode testing solo — simulasi game tanpa pemain lain.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (session.active) {
    return interaction.reply({ content: '⚠️ Sesi test sudah berjalan. Tekan **End** untuk menghentikan.', ephemeral: true });
  }
  if (gameState.phase !== 'idle') {
    return interaction.reply({ content: '⚠️ Ada game aktif. Gunakan `/stop` dulu.', ephemeral: true });
  }

  session.active = true;
  session.step = -1;
  session.results = [];
  session.adminId = interaction.user.id;
  session.channelId = interaction.channelId;
  session.virtualIds = Array.from({ length: VIRTUAL_COUNT }, (_, i) =>
    `10000000000000${String(i).padStart(4, '0')}`
  );
  session.allPlayerIds = [session.adminId, ...session.virtualIds];
  session.steps = buildPipeline();

  console.log('\n[Test] ══════════════════════════════════════');
  console.log(`[Test] Session started by ${interaction.user.tag}`);
  console.log(`[Test] ${session.steps.length} steps generated`);
  console.log('[Test] ══════════════════════════════════════\n');

  const msg = await interaction.reply({ ...buildEmbed(), fetchReply: true });
  session.msgId = msg.id;
}

// ── Button Handlers (exported for index.js) ─────────────────────────────────

export async function handleTestButton(interaction, action) {
  if (!session.active) {
    return interaction.reply({ content: '⚠️ Tidak ada sesi test aktif.', ephemeral: true });
  }
  if (interaction.user.id !== session.adminId) {
    return interaction.reply({ content: '⛔ Hanya admin yang memulai test bisa mengontrol.', ephemeral: true });
  }

  if (action === 'next') {
    session.step++;
    if (session.step >= session.steps.length) {
      await interaction.update({ ...buildEmbed('✅ Semua step selesai!'), components: [buildEndOnlyRow()] });
      return;
    }
    const step = session.steps[session.step];
    console.log(`\n[Test] ──── Step ${session.step + 1}/${session.steps.length}: ${step.name} ────`);

    await interaction.deferUpdate();
    const result = await runStep(step, interaction.client, interaction.guild);
    session.results.push(result);

    const ch = interaction.guild.channels.cache.get(session.channelId);
    const msg = ch ? await ch.messages.fetch(session.msgId).catch(() => null) : null;
    if (msg) await msg.edit(buildEmbed());

  } else if (action === 'end') {
    console.log('\n[Test] ──── SESSION ENDED BY ADMIN ────');
    await doCleanup(interaction.client, interaction.guild);
    await interaction.update({ ...buildEmbed('🛑 Test dihentikan.'), components: [] });

  } else if (action === 'restart') {
    console.log('\n[Test] ──── RESTARTING ────');
    await doCleanup(interaction.client, interaction.guild);
    session.step = -1;
    session.results = [];
    session.steps = buildPipeline();
    console.log(`[Test] ${session.steps.length} steps re-generated`);
    await interaction.update(buildEmbed());
  }
}

// ── Step Runner ─────────────────────────────────────────────────────────────

async function runStep(step, client, guild) {
  const t0 = Date.now();
  try {
    const detail = await step.run({ client, guild, session });
    const ms = Date.now() - t0;
    console.log(`[Test] ✅ PASS (${ms}ms) — ${detail}`);
    return { name: step.name, pass: true, detail, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`[Test] ❌ FAIL (${ms}ms) — ${err.message}`);
    console.error(err.stack);
    return { name: step.name, pass: false, detail: err.message, ms };
  }
}

// ── Dynamic Pipeline Builder ────────────────────────────────────────────────
// Ini adalah kunci scalability: steps di-generate dari registry.

function buildPipeline() {
  const steps = [
    stepInit,
    stepChannels,
    stepRoleAssign,
    stepNightStart,
  ];

  // Tambahkan 1 step per role yang punya night action (DYNAMIC!)
  for (const roleDef of getNightActionRoles()) {
    steps.push(createNightActionStep(roleDef));
  }

  steps.push(stepDawnResolve, stepDayPhase, stepLynchVote, stepWinCheck, stepCleanup);
  return steps;
}

// ── Step Definitions ────────────────────────────────────────────────────────

const stepInit = {
  name: '🔧 Inisialisasi',
  desc: 'Reset state, buat virtual players, init lobby.',
  async run({ guild, session: s }) {
    resetGame();
    gameState.guild_id = guild.id;
    gameState.host_id = s.adminId;
    gameState.phase = 'lobby';
    gameState.lobby_players = s.allPlayerIds;
    activateGame();

    const roles = calculateAutoRoles(s.allPlayerIds.length);
    const summary = roles
      ? `🐺${roles.werewolves} 🔮${roles.seers} 👨‍🌾${roles.villagers}`
      : 'N/A';
    return `${s.allPlayerIds.length} pemain (1 admin + ${s.virtualIds.length} virtual). Roles: ${summary}`;
  },
};

const stepChannels = {
  name: '🏗️ Buat Channel',
  desc: 'Buat category + channels sementara.',
  async run({ guild }) {
    const everyone = guild.roles.everyone;
    const botId = guild.client.user.id;
    const basePerm = [
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
    ];

    const cat = await guild.channels.create({ name: '🧪 Test — Werewolf', type: ChannelType.GuildCategory });

    const gc = await guild.channels.create({
      name: 'test-global-chat', type: ChannelType.GuildText, parent: cat.id,
      permissionOverwrites: [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }, ...basePerm],
    });
    const ww = await guild.channels.create({
      name: 'test-werewolf-pact', type: ChannelType.GuildText, parent: cat.id,
      permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...basePerm],
    });
    const gy = await guild.channels.create({
      name: 'test-graveyard', type: ChannelType.GuildText, parent: cat.id,
      permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...basePerm],
    });

    setChannels({ category_id: cat.id, global_chat: gc.id, ww_chat: ww.id, graveyard: gy.id, voice_lobby: null });

    // Beri admin akses lihat semua channel untuk testing
    for (const ch of [gc, ww, gy]) {
      await ch.permissionOverwrites.edit(session.adminId, { ViewChannel: true, SendMessages: false });
    }

    return `Category: ${cat.name} | #${gc.name}, #${ww.name}, #${gy.name}`;
  },
};

const stepRoleAssign = {
  name: '🎭 Distribusi Role',
  desc: 'Acak dan tetapkan role ke semua pemain.',
  async run({ guild, session: s }) {
    const roles = calculateAutoRoles(s.allPlayerIds.length);
    if (!roles) throw new Error('Tidak bisa hitung roles');

    const shuffled = [...s.allPlayerIds].sort(() => Math.random() - 0.5);
    let idx = 0;
    const assigns = [];

    for (let i = 0; i < roles.werewolves; i++, idx++) {
      setPlayer(shuffled[idx], { role: 'werewolf' });
      assigns.push(`🐺 ${label(shuffled[idx], s)}`);
      // Beri akses WW channel
      const wwCh = guild.channels.cache.get(gameState.channels.ww_chat);
      if (wwCh) await wwCh.permissionOverwrites.edit(shuffled[idx], { ViewChannel: true, SendMessages: true }).catch(() => null);
    }
    for (let i = 0; i < roles.seers; i++, idx++) {
      setPlayer(shuffled[idx], { role: 'seer' });
      assigns.push(`🔮 ${label(shuffled[idx], s)}`);
    }
    while (idx < shuffled.length) {
      setPlayer(shuffled[idx], { role: 'villager' });
      assigns.push(`👨‍🌾 ${label(shuffled[idx], s)}`);
      idx++;
    }

    // Kirim ringkasan ke global-chat
    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.send({ embeds: [{ color: 0x9b59b6, title: '🧪 [TEST] Distribusi Role', description: assigns.join('\n') }] });
    }

    console.log('[Test] Role assignments:');
    assigns.forEach(a => console.log(`  ${a}`));
    return assigns.join(' | ');
  },
};

const stepNightStart = {
  name: '🌙 Mulai Fase Malam',
  desc: 'Set phase=night, lock chat, kirim pengumuman.',
  async run({ guild }) {
    gameState.phase = 'night';
    resetNightActions();

    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, ViewChannel: true });
      await gc.send({ embeds: [{ color: 0x1a1a2e, title: `🌙 [TEST] Malam Hari ${gameState.day_count}`, description: 'Fase malam dimulai. Channel dikunci.' }] });
    }

    return `Phase: ${gameState.phase} | Day: ${gameState.day_count}`;
  },
};

/** Factory: buat step untuk setiap role dengan night action. */
function createNightActionStep(roleDef) {
  return {
    name: `${roleDef.emoji} Aksi: ${roleDef.displayName}`,
    desc: `Auto-submit aksi malam untuk ${roleDef.displayName}.`,
    async run({ guild, session: s }) {
      const actors = getAlivePlayers().filter(p => p.data.role === roleDef.name);
      if (actors.length === 0) return `Tidak ada ${roleDef.displayName} hidup — skip.`;

      const actor = actors[0];
      // Pilih target yang valid (bukan diri sendiri, bukan team sendiri untuk WW)
      const targets = getAlivePlayers().filter(p => {
        if (p.id === actor.id) return false;
        if (roleDef.name === 'werewolf' && p.data.role === 'werewolf') return false;
        return true;
      });

      if (targets.length === 0) return `Tidak ada target valid untuk ${roleDef.displayName} — skip.`;

      const target = targets[Math.floor(Math.random() * targets.length)];
      submitAction(roleDef.name, actor.id, target.id);

      // Kirim info ke WW channel atau global-chat
      const chId = roleDef.name === 'werewolf' ? gameState.channels.ww_chat : gameState.channels.global_chat;
      const ch = guild.channels.cache.get(chId);
      if (ch) {
        await ch.send({ embeds: [{
          color: roleDef.name === 'werewolf' ? 0x8b0000 : 0x9b59b6,
          title: `🧪 [TEST] ${roleDef.emoji} ${roleDef.displayName} Action`,
          description: `Actor: **${label(actor.id, s)}**\nTarget: **${label(target.id, s)}**`,
        }] });
      }

      return `${label(actor.id, s)} → ${label(target.id, s)}`;
    },
  };
}

const stepDawnResolve = {
  name: '🌅 Resolusi Fajar',
  desc: 'Resolve semua aksi malam secara simultan.',
  async run({ guild, session: s }) {
    gameState.phase = 'resolving';
    const results = resolveNight();

    const killed = [], reveals = [], blocked = [];
    for (const r of results) {
      if (r.type === 'kill') killed.push(r.targetId);
      else if (r.type === 'reveal') reveals.push(r);
      else if (r.type === 'protect_blocked') blocked.push(r.targetId);
    }

    // Apply kills
    for (const id of killed) setPlayer(id, { status: 'dead' });

    // Log
    const lines = results.map(r => {
      const icon = r.type === 'kill' ? '💀' : r.type === 'reveal' ? '🔮' : r.type === 'protect_blocked' ? '🛡️' : '⏭️';
      return `${icon} ${r.roleName}: ${r.type} → ${r.targetId ? label(r.targetId, s) : 'none'}`;
    });
    console.log('[Test] Dawn resolution:');
    lines.forEach(l => console.log(`  ${l}`));

    // Post ke global-chat
    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.send({ embeds: [{
        color: killed.length > 0 ? 0xe74c3c : 0x2ecc71,
        title: '🧪 [TEST] Resolusi Fajar',
        description: lines.join('\n') || 'Tidak ada aksi.',
        fields: [
          { name: 'Tewas', value: killed.map(id => label(id, s)).join(', ') || 'Tidak ada', inline: true },
          { name: 'Dilindungi', value: blocked.map(id => label(id, s)).join(', ') || 'Tidak ada', inline: true },
        ],
      }] });
    }

    // Seer reveal info
    for (const rev of reveals) {
      const rd = getRole(rev.meta.revealedRole);
      console.log(`[Test] 🔮 Seer reveal: ${label(rev.targetId, s)} = ${rd?.emoji ?? '?'} ${rd?.displayName ?? rev.meta.revealedRole}`);
    }

    return `${results.length} results | ${killed.length} killed | ${blocked.length} blocked | ${reveals.length} reveals`;
  },
};

const stepDayPhase = {
  name: '☀️ Fase Siang',
  desc: 'Umumkan korban, buka chat.',
  async run({ guild, session: s }) {
    gameState.phase = 'day';
    const alive = getAlivePlayers();
    const dead = Object.entries(gameState.players).filter(([, d]) => d.status === 'dead');

    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, ViewChannel: true });
      await gc.permissionOverwrites.edit(session.adminId, { SendMessages: true, ViewChannel: true });

      const killedTonight = dead.filter(([id]) => {
        // Simplification: announce all dead
        return true;
      });

      await gc.send({ embeds: [{
        color: 0xf1c40f,
        title: `☀️ [TEST] Hari ${gameState.day_count}`,
        description: `**${alive.length}** pemain masih hidup.\n**${dead.length}** pemain sudah tewas.`,
        fields: [
          { name: '✅ Hidup', value: alive.map(p => `${getRole(p.data.role)?.emoji ?? '?'} ${label(p.id, s)}`).join('\n') || '-' },
          { name: '💀 Mati', value: dead.map(([id, d]) => `${getRole(d.role)?.emoji ?? '?'} ${label(id, s)}`).join('\n') || '-' },
        ],
      }] });
    }

    return `Alive: ${alive.length} | Dead: ${dead.length}`;
  },
};

const stepLynchVote = {
  name: '⚖️ Voting Lynch',
  desc: 'Auto-submit lynch votes dari semua pemain hidup.',
  async run({ guild, session: s }) {
    const alive = getAlivePlayers();
    if (alive.length < 2) return 'Kurang dari 2 pemain hidup — skip.';

    // Semua vote target random (bukan diri sendiri)
    /** @type {Map<string, string>} */
    const votes = new Map();
    for (const voter of alive) {
      const targets = alive.filter(p => p.id !== voter.id);
      const target = targets[Math.floor(Math.random() * targets.length)];
      votes.set(voter.id, target.id);
    }

    // Tally
    const tally = new Map();
    for (const [, tid] of votes) tally.set(tid, (tally.get(tid) ?? 0) + 1);

    let maxV = 0, tops = [];
    for (const [tid, cnt] of tally) {
      if (cnt > maxV) { maxV = cnt; tops = [tid]; }
      else if (cnt === maxV) tops.push(tid);
    }

    const tallyLines = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tid, cnt]) => `${label(tid, s)}: ${'█'.repeat(cnt)}${'░'.repeat(alive.length - cnt)} (${cnt})`);

    let lynchResult;
    if (tops.length !== 1) {
      lynchResult = 'Seri — tidak ada eksekusi.';
    } else {
      setPlayer(tops[0], { status: 'dead' });
      lynchResult = `💀 ${label(tops[0], s)} dieksekusi!`;
    }

    // Post
    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.send({ embeds: [{
        color: tops.length === 1 ? 0x2c2f33 : 0x808080,
        title: `⚖️ [TEST] Hasil Lynch`,
        description: `${lynchResult}\n\n${tallyLines.join('\n')}`,
      }] });
    }

    console.log('[Test] Lynch votes:');
    for (const [vid, tid] of votes) console.log(`  ${label(vid, s)} → ${label(tid, s)}`);
    console.log(`[Test] Result: ${lynchResult}`);

    return lynchResult;
  },
};

const stepWinCheck = {
  name: '🏆 Cek Kondisi Menang',
  desc: 'Periksa apakah ada pemenang.',
  async run({ guild, session: s }) {
    const result = checkWinCondition();
    const alive = getAlivePlayers();

    const ww = alive.filter(p => p.data.role === 'werewolf').length;
    const vil = alive.filter(p => p.data.role !== 'werewolf').length;

    const gc = guild.channels.cache.get(gameState.channels.global_chat);
    if (gc) {
      await gc.send({ embeds: [{
        color: result ? (result.winner === 'werewolf' ? 0x8b0000 : 0x2ecc71) : 0x3498db,
        title: result ? `🏆 [TEST] ${result.winner.toUpperCase()} WIN!` : '🏆 [TEST] Belum Ada Pemenang',
        description: result ? result.reason : `Werewolf: ${ww} | Non-WW: ${vil} — game berlanjut.`,
      }] });
    }

    console.log(`[Test] Win check: WW=${ww} Village=${vil} | Winner: ${result?.winner ?? 'none'}`);
    return result ? `${result.winner} menang!` : `Belum ada pemenang (WW:${ww} vs Village:${vil})`;
  },
};

const stepCleanup = {
  name: '🧹 Cleanup',
  desc: 'Hapus channel test dan reset state.',
  async run({ client, guild }) {
    await doCleanup(client, guild);
    return 'Channels dihapus, state di-reset.';
  },
};

// ── Cleanup Helper ──────────────────────────────────────────────────────────

async function doCleanup(client, guild) {
  cleanupTimers();
  cleanupLynchVote();

  const catId = gameState.channels.category_id;
  if (catId) {
    const children = guild.channels.cache.filter(c => c.parentId === catId);
    for (const [, ch] of children) await ch.delete('Test cleanup').catch(() => null);
    await guild.channels.cache.get(catId)?.delete('Test cleanup').catch(() => null);
  }

  resetGame();
  session.active = false;
  console.log('[Test] Cleanup complete.');
}

// ── UI Builders ─────────────────────────────────────────────────────────────

function buildEmbed(statusOverride) {
  const total = session.steps.length;
  const current = session.step + 1;
  const passed = session.results.filter(r => r.pass).length;
  const failed = session.results.filter(r => !r.pass).length;

  const nextStep = session.steps[session.step + 1];
  const lastResult = session.results[session.results.length - 1];

  const progressBar = total > 0
    ? '█'.repeat(current) + '░'.repeat(total - current)
    : '░'.repeat(10);

  const fields = [];

  if (lastResult) {
    const icon = lastResult.pass ? '✅' : '❌';
    fields.push({
      name: `📊 Hasil Terakhir`,
      value: `${icon} **${lastResult.name}** — ${lastResult.ms}ms\n\`\`\`${lastResult.detail}\`\`\``,
    });
  }

  if (nextStep && !statusOverride) {
    fields.push({
      name: '📋 Selanjutnya',
      value: `**${nextStep.name}**\n${nextStep.desc}`,
    });
  }

  fields.push({
    name: '📈 Progress',
    value: `\`${progressBar}\` ${current}/${total}  (✅ ${passed} | ❌ ${failed})`,
  });

  // Daftar semua step dengan status
  const stepList = session.steps.map((s, i) => {
    let icon = '⬜';
    if (i < session.results.length) icon = session.results[i].pass ? '✅' : '❌';
    else if (i === session.step + 1) icon = '▶️';
    return `${icon} ${s.name}`;
  }).join('\n');

  fields.push({ name: '📝 Pipeline', value: stepList });

  return {
    embeds: [{
      color: statusOverride ? 0x808080 : 0x3498db,
      title: statusOverride ?? `🧪 Mode Testing — Tahap ${current}/${total}`,
      description: 'Kontrol simulasi game dengan tombol di bawah.',
      fields,
      footer: { text: 'Hasil lengkap tersedia di console bot.' },
      timestamp: new Date().toISOString(),
    }],
    components: statusOverride ? [] : [buildButtonRow()],
  };
}

function buildButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('test:next').setLabel('▶️ Next').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('test:restart').setLabel('🔄 Restart').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('test:end').setLabel('⏹️ End').setStyle(ButtonStyle.Danger),
  );
}

function buildEndOnlyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('test:restart').setLabel('🔄 Restart').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('test:end').setLabel('⏹️ End').setStyle(ButtonStyle.Danger),
  );
}

// ── Utils ───────────────────────────────────────────────────────────────────

function label(id, s) {
  if (id === s.adminId) return `Admin (${id.slice(-4)})`;
  const vIdx = s.virtualIds.indexOf(id);
  if (vIdx !== -1) return `Bot-${vIdx + 1}`;
  return `User-${id.slice(-4)}`;
}
