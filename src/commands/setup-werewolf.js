/**
 * setup-werewolf.js — First-Time & Recovery Server Setup
 *
 * Membuat channel PERMANEN Werewolf di server:
 *   📁 🐺 Werewolf Bot  (kategori)
 *     ├── #setup-cmd        — pusat komando
 *     └── 🔊 Town Square    — voice channel permainan
 *
 * Channel game (global-chat, werewolf-pact, graveyard) TIDAK dibuat di sini.
 * Mereka dibuat oleh /start dan dihapus oleh /stop.
 *
 * Bisa dijalankan ulang jika channel rusak/terhapus.
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

  // ── Cek apakah channel permanen masih valid ───────────────────────────────
  const existingCfg = await getGuildConfig(guild.id);
  if (existingCfg?.configured) {
    const isValid = await validateChannels(guild, existingCfg);
    if (isValid) {
      return interaction.editReply(
        `✅ Server ini sudah di-setup dan semua channel masih **valid**.\n` +
        `Pusat komando: <#${existingCfg.setup_cmd_id}>\n\n` +
        `Jalankan command ini lagi jika ada channel yang dihapus/rusak — bot akan membuat ulang.`
      );
    }

    // Ada channel yang rusak → bersihkan sisa lalu buat ulang
    await interaction.editReply('⚠️ Ditemukan channel yang rusak/hilang. Membersihkan dan membuat ulang...');
    await cleanupOldChannels(guild, existingCfg);
  }

  // ── Buat channel permanen dari awal ───────────────────────────────────────
  try {
    const cfg         = await getGuildConfig(guild.id);
    const botSettings = mergeWithDefaults(cfg?.bot_config);

    const memberRoleId = botSettings.member_role_id ?? guild.roles.everyone.id;
    const botId        = guild.client.user.id;

    // ── Kategori permanen ─────────────────────────────────────────────────
    const category = await guild.channels.create({
      name: '🐺 Werewolf Bot',
      type: ChannelType.GuildCategory,
    });

    // ── #setup-cmd ────────────────────────────────────────────────────────
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

    // ── 🔊 Town Square — Voice Channel permanen ──────────────────────────
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

    // ── Simpan ke servers.json ────────────────────────────────────────────
    await saveGuildConfig(guild.id, {
      configured        : true,
      setup_category_id : category.id,
      setup_cmd_id      : setupCmd.id,
      town_square_id    : townSquare.id,
      configured_at     : new Date().toISOString(),
      configured_by     : interaction.user.id,
    });

    // ── Pesan selamat datang ──────────────────────────────────────────────
    await setupCmd.send({
      embeds: [{
        color      : 0x5865f2,
        title      : '🐺 Werewolf Bot — Siap!',
        description: 'Setup berhasil! Channel permanen telah dibuat.',
        fields: [
          {
            name  : '📋 Channel Permanen',
            value :
              `<#${setupCmd.id}> — Pusat komando\n` +
              `**🔊 Town Square** — Voice channel permainan`,
            inline: false,
          },
          {
            name  : '📋 Channel Game (dibuat otomatis saat /start)',
            value : '#global-chat, #werewolf-pact, #graveyard',
            inline: false,
          },
          { name: '`/setup`',  value: 'Buka lobby & jadilah Host.',          inline: true },
          { name: '`/config`', value: 'Atur komposisi peran (khusus Host).', inline: true },
          { name: '`/start`',  value: 'Mulai permainan.',                    inline: true },
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
      `Kategori **🐺 Werewolf Bot** telah dibuat:\n` +
      `• <#${setupCmd.id}> — Pusat komando\n` +
      `• 🔊 Town Square — Voice Channel\n\n` +
      `Channel game (global-chat, werewolf-pact, graveyard) akan otomatis dibuat saat \`/start\`.`
    );

    console.log(`[/setup-werewolf] Configured | Guild: ${guild.id} | By: ${interaction.user.tag}`);

  } catch (err) {
    console.error('[/setup-werewolf] Error:', err);
    await interaction.editReply(`❌ Setup gagal: \`${err.message}\`\nPastikan bot memiliki permission **Administrator**.`);
  }
}

/**
 * Cek apakah channel permanen masih ada di Discord.
 */
async function validateChannels(guild, cfg) {
  const ids = [cfg.setup_category_id, cfg.setup_cmd_id, cfg.town_square_id];
  await guild.channels.fetch();
  return ids.every(id => id && guild.channels.cache.has(id));
}

/**
 * Hapus sisa channel lama sebelum buat ulang.
 */
async function cleanupOldChannels(guild, cfg) {
  await guild.channels.fetch();
  const idsToDelete = [cfg.setup_cmd_id, cfg.town_square_id, cfg.setup_category_id];
  for (const id of idsToDelete) {
    if (!id) continue;
    const ch = guild.channels.cache.get(id);
    if (ch) await ch.delete('Werewolf setup recovery').catch(() => null);
  }
}
