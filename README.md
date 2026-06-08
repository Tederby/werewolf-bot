# Werewolf Bot

Discord bot untuk memainkan game minigame Werewolf di server Discord. Bot ini masih dalam tahap development awal (barebone).

## Deskripsi

Bot Discord yang dirancang untuk mengorganisir dan menjalankan game Werewolf di channel Discord. Game ini melibatkan pemain yang berperan sebagai villager atau werewolf, dengan tujuan untuk mengidentifikasi dan mengeliminasi werewolf.

## Fitur (Roadmap)

- [ ] Command untuk memulai game
- [ ] Role assignment (villager, werewolf, seer)
- [ ] Vote system untuk eliminasi
- [ ] Day/Night cycle management
- [ ] Game statistics

## Setup

1. Clone repository:
   ```bash
   git clone https://github.com/Tederby/werewolf-bot.git
   cd werewolf-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Buat file `.env` dengan token bot:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```

4. Setup bot di Discord Developer Portal:
   - Buka https://discord.com/developers/applications
   - Buat aplikasi baru atau gunakan yang ada
   - Tab `Bot` → Copy token ke `.env`
   - Tab `OAuth2` → URL Generator:
     - Scope: `bot`
     - Permissions: `Send Messages`, `Read Messages/View Channels`
     - Salin URL dan undang bot ke server

5. Enable Privileged Gateway Intents (di Developer Portal):
   - ✅ Server Members Intent
   - ✅ Message Content Intent

6. Jalankan bot:
   ```bash
   npm start
   ```

## Testing

Bot merespon perintah sederhana untuk testing:
- `ping` → Bot balas `Pong!`
- `!ping` → Bot balas `Pong! (prefix test)`
- `/ping` → Bot balas `Pong! (slash test)`

## Development

Console akan menampilkan log setiap message yang diterima:
```
Message dari [username]: "pesan_anda"
```

## Tech Stack

- Node.js
- discord.js v14
- dotenv

## Security

⚠️ **JANGAN** membagikan token bot. Token sudah di-add ke `.gitignore`.

## License

Belum ditentukan

## Kontribusi

Proyek masih dalam tahap awal development.
