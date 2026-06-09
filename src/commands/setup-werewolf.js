/**
 * setup-werewolf.js — First-Time & Recovery Server Setup
 *
 * Membuat SELURUH channel permanen Werewolf di server:
 *   📁 Werewolf Bot  (kategori)
 *     ├── #setup-cmd        — pusat komando, semua bisa pakai
 *     ├── #global-chat      — chat umum saat siang hari
 *     ├── #werewolf-pact    — channel rahasia werewolf (hidden default)
 *     ├── #graveyard        — channel untuk pemain mati (hidden default)
 *     └── 🔊 Town Square    — voice channel permanen
 *
 * Bisa dijalankan ulang oleh Admin jika channel/kategori "rusak" atau terhapus.
 * Jika sudah ada konfigurasi valid (semua channel masih ada), bot akan memberikan
 * konfirmasi tanpa membuat ulang. Jika ada yang rusak, bot akan membuat ulang semua.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getGuildConfig, saveGuildConfig } from '../utils/serverConfig.js';
import { mergeWithDefaults } from './bot-config.js';

export const data = new SlashCommandBuilder()
  .setName('setup-werewolf')
  .setDescription('Setup/perbaiki channel bot Werewolf di server ini. Bisa diulang jika channel rusak.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const guild = interaction.guild;

  await interaction.deferReply({ ephemeral: true });

  // ── Cek apakah semua channel masih valid ──────────────────────────────────
  const existingCfg = await getGuildConfig(guild.id);
  if (existingCfg?.configured) {
    const isValid = await validateChannels(guild, existingCfg);
    if (isValid) {
      return interaction.editReply(
        `✅ Server ini sudah di-setup dan semua channel masih **valid**.\n` +
        `Pusat komando: <#${existingCfg.setup_cmd_id}>\n\n` +
        `Jalankan command ini lagi jika ada channel yang dihapus/rusak — bot akan membuat ulang semuanya.`
      );
    }

    // Ada channel yang rusak, bersihkan dulu sisa-sisanya sebelum buat ulang
    await interaction.editReply('⚠️ Ditemukan channel yang rusak/hilang. Membersihkan dan membuat ulang...');
    await cleanupOldChannels(guild, existingCfg);
  }

  // ── Buat semua channel dari awal ──────────────────────────────────────────
  try {
    const cfg         = await getGuildConfig(guild.id);
    const botSettings = mergeWithDefaults(cfg?.bot_config);

    // Gunakan member role dari bot-config jika ada, fallback ke @everyone
    const memberRoleId = botSettings.member_role_id ?? guild.roles.everyone.id;
    const botId        = guild.client.user.id;

    // ── Kategori permanen ──────────────────────────────────────────────────
    const category = await guild.channels.create({
      name: '🐺 Werewolf Bot',
      type: ChannelType.GuildCategory,
    });

    // ── #setup-cmd — Semua bisa lihat & kirim pesan ────────────────────────
    const setupCmd = await guild.channels.create({
      name  : 'setup-cmd',
      type  : ChannelType.GuildText,
      parent: category.id,
      topic : '📋 Pusat komando bot Werewolf. Ketik /setup untuk memulai lobby.',
      permissionOverwrites: [
        {
          id   : memberRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          deny : [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
        },
        {
          id   : botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    // ── #global-chat — Chat umum, dikunci saat malam ───────────────────────
    const globalChat = await guild.channels.create({
      name  : 'global-chat',
      type  : ChannelType.GuildText,
      parent: category.id,
      topic : '💬 Diskusi umum pemain. Aktif saat Fase Siang, dikunci saat Fase Malam.',
      permissionOverwrites: [
        {
          id  : memberRoleId,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id   : botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    // ── #werewolf-pact — Hidden untuk semua, bot buka per-user ────────────
    const wwPact = await guild.channels.create({
      name  : 'werewolf-pact',
      type  : ChannelType.GuildText,
      parent: category.id,
      topic : '🩸 Saluran rahasia para Werewolf. Hanya terlihat saat permainan berlangsung.',
      permissionOverwrites: [
        {
          id  : memberRoleId,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id   : botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    // ── #graveyard — Hidden, dibuka untuk pemain mati ─────────────────────
    const graveyard = await guild.channels.create({
      name  : 'graveyard',
      type  : ChannelType.GuildText,
      parent: category.id,
      topic : '⚰️ Khusus jiwa yang telah gugur. Pemain hidup tidak bisa melihat channel ini.',
      permissionOverwrites: [
        {
          id  : memberRoleId,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id   : botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    // ── 🔊 Town Square — Voice Channel permanen ───────────────────────────
    const townSquare = await guild.channels.create({
      name  : '🔊 Town Square',
      type  : ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        {
          id   : memberRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
        {
          id   : botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
          ],
        },
      ],
    });

    // ── Simpan semua ID ke servers.json ───────────────────────────────────
    await saveGuildConfig(guild.id, {
      configured        : true,
      setup_category_id : category.id,
      setup_cmd_id      : setupCmd.id,
      global_chat_id    : globalChat.id,
      ww_pact_id        : wwPact.id,
      graveyard_id      : graveyard.id,
      town_square_id    : townSquare.id,
      configured_at     : new Date().toISOString(),
      configured_by     : interaction.user.id,
    });

    // ── Pesan selamat datang di #setup-cmd ────────────────────────────────
    await setupCmd.send({
      embeds: [{
        color      : 0x5865f2,
        title      : '🐺 Werewolf Bot — Siap!',
        description: 'Setup berhasil! Semua channel telah dibuat.\nBerikut panduan penggunaan bot:',
        fields: [
          {
            name  : '📋 Channel Permanen',
            value :
              `<#${setupCmd.id}> — Pusat komando\n` +
              `<#${globalChat.id}> — Chat umum (dikelola otomatis)\n` +
              `<#${wwPact.id}> — Chat Werewolf (private)\n` +
              `<#${graveyard.id}> — Kuburan (private)\n` +
              `**🔊 Town Square** — Voice channel permainan`,
            inline: false,
          },
          { name: '`/setup`',  value: 'Buka lobby & jadilah Host.',          inline: true },
          { name: '`/config`', value: 'Atur komposisi peran (khusus Host).', inline: true },
          { name: '`/start`',  value: 'Mulai permainan setelah lobby siap.', inline: true },
          { name: '`/stop`',   value: 'Hentikan permainan.',                 inline: true },
          {
            name  : '⚠️ Catatan',
            value : `Semua command gameplay harus diketik di <#${setupCmd.id}> ini.\nJangan hapus channel ini!`,
            inline: false,
          },
        ],
        footer   : { text: `Setup oleh ${interaction.user.tag}` },
        timestamp: new Date().toISOString(),
      }],
    });

    await interaction.editReply(
      `✅ **Setup selesai!**\n` +
      `Kategori **🐺 Werewolf Bot** dan semua channelnya telah dibuat:\n` +
      `• <#${setupCmd.id}> — Pusat komando\n` +
      `• <#${globalChat.id}> — Global Chat\n` +
      `• <#${wwPact.id}> — Werewolf Pact\n` +
      `• <#${graveyard.id}> — Graveyard\n` +
      `• 🔊 Town Square — Voice Channel\n\n` +
      `Semua command gameplay hanya bisa dipakai di <#${setupCmd.id}>.`
    );

    console.log(`[/setup-werewolf] Configured | Guild: ${guild.id} | By: ${interaction.user.tag}`);

  } catch (err) {
    console.error('[/setup-werewolf] Error:', err);
    await interaction.editReply(`❌ Setup gagal: \`${err.message}\`\nPastikan bot memiliki permission **Administrator**.`);
  }
}

/**
 * Cek apakah semua channel yang tersimpan di config masih ada di Discord.
 * @returns {boolean} true jika semua valid
 */
async function validateChannels(guild, cfg) {
  const ids = [
    cfg.setup_category_id,
    cfg.setup_cmd_id,
    cfg.global_chat_id,
    cfg.ww_pact_id,
    cfg.graveyard_id,
    cfg.town_square_id,
  ];
  // Fetch semua channel terbaru dari Discord
  await guild.channels.fetch();
  return ids.every(id => id && guild.channels.cache.has(id));
}

/**
 * Hapus sisa channel lama (dari config yang sudah tidak valid) sebelum buat ulang.
 * Mencegah duplikasi channel.
 */
async function cleanupOldChannels(guild, cfg) {
  await guild.channels.fetch();

  const idsToDelete = [
    cfg.setup_cmd_id,
    cfg.global_chat_id,
    cfg.ww_pact_id,
    cfg.graveyard_id,
    cfg.town_square_id,
    cfg.setup_category_id, // kategori terakhir
  ];

  for (const id of idsToDelete) {
    if (!id) continue;
    const ch = guild.channels.cache.get(id);
    if (ch) await ch.delete('Werewolf setup recovery').catch(() => null);
  }
}
