/**
 * bot-config.js — Command Handler: /bot-config
 *
 * Konfigurasi global bot untuk server ini. Hanya bisa digunakan Admin.
 * TIDAK perlu dijalankan dari #setup-cmd — bisa dari mana saja.
 *
 * Subcommands:
 *   /bot-config show                    — Tampilkan semua setting saat ini
 *   /bot-config member-role [role]      — Set role "member aktif" (default: @everyone)
 *   /bot-config min-players [count]     — Minimum pemain untuk /start (default: 5)
 *   /bot-config night-timer [seconds]   — Durasi fase malam (default: 60 detik)
 *   /bot-config day-timer [minutes]     — Durasi diskusi siang (default: 3 menit)
 *   /bot-config vote-threshold [pct]    — % suara VC untuk vote /start//stop (default: 60)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, saveGuildConfig } from '../utils/serverConfig.js';

// ── Default values ─────────────────────────────────────────────────────────
export const BOT_CONFIG_DEFAULTS = {
  member_role_id    : null,   // null = gunakan @everyone
  min_players       : 5,
  night_timer       : 60,     // detik
  day_timer         : 3,      // menit
  vote_threshold    : 60,     // persen (%)
};

export const data = new SlashCommandBuilder()
  .setName('bot-config')
  .setDescription('Konfigurasi bot Werewolf untuk server ini (khusus Admin).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // ── /bot-config show ──────────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('show')
    .setDescription('Tampilkan semua konfigurasi bot yang aktif saat ini.'))

  // ── /bot-config member-role ───────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('member-role')
    .setDescription('Set role yang dianggap sebagai "member aktif" untuk permission channel.')
    .addRoleOption(opt => opt
      .setName('role')
      .setDescription('Role member server kamu (kosongkan untuk reset ke @everyone)')
      .setRequired(false)))

  // ── /bot-config min-players ───────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('min-players')
    .setDescription('Set jumlah minimum pemain untuk memulai permainan.')
    .addIntegerOption(opt => opt
      .setName('count')
      .setDescription('Minimum pemain (default: 5)')
      .setRequired(true)
      .setMinValue(3)
      .setMaxValue(20)))

  // ── /bot-config night-timer ───────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('night-timer')
    .setDescription('Set durasi fase malam (waktu Werewolf memilih target).')
    .addIntegerOption(opt => opt
      .setName('seconds')
      .setDescription('Durasi dalam detik (default: 60, min: 30, max: 180)')
      .setRequired(true)
      .setMinValue(30)
      .setMaxValue(180)))

  // ── /bot-config day-timer ─────────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('day-timer')
    .setDescription('Set durasi diskusi siang sebelum voting eksekusi.')
    .addIntegerOption(opt => opt
      .setName('minutes')
      .setDescription('Durasi dalam menit (default: 3, min: 1, max: 10)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10)))

  // ── /bot-config vote-threshold ────────────────────────────────────────────
  .addSubcommand(sub => sub
    .setName('vote-threshold')
    .setDescription('Set persentase suara VC yang dibutuhkan untuk voting /start atau /stop.')
    .addIntegerOption(opt => opt
      .setName('percent')
      .setDescription('Persentase (default: 60, min: 50, max: 100)')
      .setRequired(true)
      .setMinValue(50)
      .setMaxValue(100)));

// ─────────────────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const sub      = interaction.options.getSubcommand();
  const guild    = interaction.guild;
  const cfg      = await getGuildConfig(guild.id);
  const settings = mergeWithDefaults(cfg?.bot_config);

  // ── /bot-config show ──────────────────────────────────────────────────────
  if (sub === 'show') {
    const memberRoleText = settings.member_role_id
      ? `<@&${settings.member_role_id}>`
      : '`@everyone` *(default)*';

    return interaction.reply({
      embeds: [{
        color      : 0x5865f2,
        title      : '⚙️ Konfigurasi Bot Werewolf',
        description: `Berikut adalah pengaturan aktif untuk **${guild.name}**:`,
        fields: [
          {
            name  : '👥 Role Member',
            value :
              `${memberRoleText}\n` +
              `*Role ini dipakai bot saat mengatur permission channel game.*\n` +
              `*Ubah jika server kamu membatasi \`@everyone\` secara default.*`,
            inline: false,
          },
          {
            name  : '🎮 Minimum Pemain',
            value : `\`${settings.min_players}\` orang`,
            inline: true,
          },
          {
            name  : '🌙 Timer Fase Malam',
            value : `\`${settings.night_timer}\` detik`,
            inline: true,
          },
          {
            name  : '☀️ Timer Diskusi Siang',
            value : `\`${settings.day_timer}\` menit`,
            inline: true,
          },
          {
            name  : '🗳️ Threshold Voting',
            value : `\`${settings.vote_threshold}%\` dari anggota Voice Channel`,
            inline: true,
          },
        ],
        footer   : { text: 'Gunakan /bot-config <subcommand> untuk mengubah setting.' },
        timestamp: new Date().toISOString(),
      }],
      ephemeral: true,
    });
  }

  // ── /bot-config member-role ─────────────────────────────────────────
  if (sub === 'member-role') {
    const role = interaction.options.getRole('role');

    // Ambil role lama sebelum diubah (untuk dihapus overridenya nanti)
    const oldMemberRoleId = settings.member_role_id;

    // Cek apakah server sudah di-setup (ada channelnya)
    const guildCfg = await getGuildConfig(guild.id);
    const isSetup  = guildCfg?.configured && guildCfg?.setup_cmd_id;

    await interaction.deferReply({ ephemeral: true });

    if (!role || role.id === guild.roles.everyone.id) {
      // Reset ke @everyone
      settings.member_role_id = null;
      await saveBotConfig(guild.id, settings);

      if (isSetup) {
        await applyMemberRoleToChannels(guild, guildCfg, oldMemberRoleId, null);
      }

      return interaction.editReply(
        `✅ **Role Member** direset ke \`@everyone\` (default).` +
        (isSetup ? '\nPermission semua channel Werewolf telah diperbarui.' : '')
      );
    }

    // Set role baru
    settings.member_role_id = role.id;
    await saveBotConfig(guild.id, settings);

    let permUpdate = '';
    if (isSetup) {
      await applyMemberRoleToChannels(guild, guildCfg, oldMemberRoleId, role.id);
      permUpdate =
        '\n\n**Permission channel diperbarui sekarang:**\n' +
        '• `@everyone` — tidak bisa akses channel Werewolf sama sekali\n' +
        `• <@&${role.id}> — mendapat akses sesuai perannya di tiap channel`;
    }

    return interaction.editReply({
      embeds: [{
        color      : 0x2ecc71,
        title      : '✅ Role Member Diperbarui',
        description:
          `Role member sekarang: <@&${role.id}>\n` +
          (oldMemberRoleId && oldMemberRoleId !== role.id
            ? `Role lama (<@&${oldMemberRoleId}>) telah dihapus dari semua channel.\n`
            : '') +
          permUpdate,
        timestamp: new Date().toISOString(),
      }],
    });
  }

  // ── /bot-config min-players ───────────────────────────────────────────────
  if (sub === 'min-players') {
    const count = interaction.options.getInteger('count');
    settings.min_players = count;
    await saveBotConfig(guild.id, settings);
    return interaction.reply({
      content  : `✅ **Minimum Pemain** diset ke \`${count}\` orang.`,
      ephemeral: true,
    });
  }

  // ── /bot-config night-timer ───────────────────────────────────────────────
  if (sub === 'night-timer') {
    const seconds = interaction.options.getInteger('seconds');
    settings.night_timer = seconds;
    await saveBotConfig(guild.id, settings);
    return interaction.reply({
      content  : `✅ **Timer Fase Malam** diset ke \`${seconds}\` detik.`,
      ephemeral: true,
    });
  }

  // ── /bot-config day-timer ─────────────────────────────────────────────────
  if (sub === 'day-timer') {
    const minutes = interaction.options.getInteger('minutes');
    settings.day_timer = minutes;
    await saveBotConfig(guild.id, settings);
    return interaction.reply({
      content  : `✅ **Timer Diskusi Siang** diset ke \`${minutes}\` menit.`,
      ephemeral: true,
    });
  }

  // ── /bot-config vote-threshold ────────────────────────────────────────────
  if (sub === 'vote-threshold') {
    const percent = interaction.options.getInteger('percent');
    settings.vote_threshold = percent;
    await saveBotConfig(guild.id, settings);
    return interaction.reply({
      content  : `✅ **Threshold Voting** diset ke \`${percent}%\` dari anggota Voice Channel.`,
      ephemeral: true,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

/** Merge config tersimpan dengan default values agar tidak ada field yang undefined. */
export function mergeWithDefaults(botCfg) {
  return { ...BOT_CONFIG_DEFAULTS, ...(botCfg ?? {}) };
}

/** Simpan bot_config ke dalam entry guild di servers.json. */
async function saveBotConfig(guildId, settings) {
  await saveGuildConfig(guildId, { bot_config: settings });
}

/**
 * Update permission seluruh channel Werewolf secara langsung.
 *
 * Logika:
 *  - Jika newMemberRoleId ada (bukan @everyone):
 *      • @everyone  → deny ViewChannel (tidak bisa akses sama sekali)
 *      • newRole    → izin sesuai fungsi tiap channel
 *      • oldRole    → hapus override (jika berbeda dari newRole)
 *  - Jika newMemberRoleId null (reset ke @everyone):
 *      • @everyone  → restore ke izin default tiap channel
 *      • oldRole    → hapus override
 *
 * @param {import('discord.js').Guild} guild
 * @param {Object} guildCfg  — data dari servers.json
 * @param {string|null} oldRoleId  — role ID sebelumnya (bisa null)
 * @param {string|null} newRoleId  — role ID baru (null = @everyone/reset)
 */
export async function applyMemberRoleToChannels(guild, guildCfg, oldRoleId, newRoleId) {
  await guild.channels.fetch(); // pastikan cache fresh

  const everyoneId = guild.roles.everyone.id;
  const botId      = guild.client.user.id;
  const useCustom  = !!newRoleId; // true jika ada custom member role

  /**
   * Definisi permission per channel.
   *  memberAllow / memberDeny: permission untuk member role (atau @everyone jika reset)
   *  everyoneDeny: selalu di-deny ke @everyone jika useCustom
   */
  const channelDefs = [
    {
      id          : guildCfg.setup_cmd_id,
      // #setup-cmd: member bisa lihat & kirim, tapi tidak bisa attach/embed
      memberAllow : { ViewChannel: true,  SendMessages: true,  AttachFiles: false, EmbedLinks: false },
      resetAllow  : { ViewChannel: true,  SendMessages: true,  AttachFiles: false, EmbedLinks: false },
    },
    {
      id          : guildCfg.global_chat_id,
      // #global-chat: dikunci untuk member (bot yang control saat game)
      memberAllow : { ViewChannel: false, SendMessages: false },
      resetAllow  : { ViewChannel: false, SendMessages: false },
    },
    {
      id          : guildCfg.ww_pact_id,
      // #werewolf-pact: selalu hidden (bot buka per-user saat game)
      memberAllow : { ViewChannel: false },
      resetAllow  : { ViewChannel: false },
    },
    {
      id          : guildCfg.graveyard_id,
      // #graveyard: selalu hidden (bot buka untuk pemain mati)
      memberAllow : { ViewChannel: false },
      resetAllow  : { ViewChannel: false },
    },
    {
      id          : guildCfg.town_square_id,
      isVoice     : true,
      // Town Square: member bisa masuk & bicara di VC
      memberAllow : { ViewChannel: true, Connect: true, Speak: true },
      resetAllow  : { ViewChannel: true, Connect: true, Speak: true },
    },
  ];

  for (const def of channelDefs) {
    if (!def.id) continue;
    const ch = guild.channels.cache.get(def.id);
    if (!ch) continue;

    try {
      if (useCustom) {
        // 1. @everyone: blokir akses sepenuhnya
        await ch.permissionOverwrites.edit(everyoneId, { ViewChannel: false });

        // 2. Role baru: berikan izin sesuai fungsi channel
        await ch.permissionOverwrites.edit(newRoleId, def.memberAllow);

        // 3. Hapus override role lama jika berbeda dari role baru
        if (oldRoleId && oldRoleId !== newRoleId && oldRoleId !== everyoneId) {
          await ch.permissionOverwrites.delete(oldRoleId, 'Member role changed').catch(() => null);
        }
      } else {
        // Reset: @everyone kembali dapat izin default channel ini
        await ch.permissionOverwrites.edit(everyoneId, def.resetAllow);

        // Hapus override role lama
        if (oldRoleId && oldRoleId !== everyoneId) {
          await ch.permissionOverwrites.delete(oldRoleId, 'Member role reset to @everyone').catch(() => null);
        }
      }

      // Bot selalu punya akses penuh
      await ch.permissionOverwrites.edit(botId, {
        ViewChannel   : true,
        SendMessages  : true,
        EmbedLinks    : true,
        ManageMessages: true,
        ...(def.isVoice ? { Connect: true, MuteMembers: true, DeafenMembers: true } : {}),
      });

    } catch (err) {
      console.error(`[bot-config] Permission update gagal untuk channel ${def.id}:`, err.message);
    }
  }

  console.log(
    `[bot-config] Permissions updated | Guild: ${guild.id} | ` +
    `OldRole: ${oldRoleId ?? '@everyone'} → NewRole: ${newRoleId ?? '@everyone'}`
  );
}
