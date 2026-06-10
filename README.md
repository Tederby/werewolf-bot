# Werewolf Bot

Discord bot untuk memainkan game minigame Werewolf di server Discord. Bot ini masih dalam tahap development awal (barebone).

## Deskripsi

Bot Discord yang dirancang untuk mengorganisir dan menjalankan game Werewolf di channel Discord. Game ini melibatkan pemain yang berperan sebagai villager atau werewolf, dengan tujuan untuk mengidentifikasi dan mengeliminasi werewolf.

## Fitur (Roadmap)

### 1. Struktur Data *In-Memory (The Brain)*

Pusat kendali permainan berada di dalam satu *global object/dictionary* di dalam memori bot. Setiap entitas harus dilacak (*track*) menggunakan ID Discord mereka. 

**Contoh representasi logika data:**
```json
{
  "game_active": true,
  "phase": "night", 
  "day_count": 1,
  "channels": {
    "category_id": "123456",
    "global_chat": "111",
    "ww_chat": "222",
    "graveyard": "333",
    "voice_lobby": "444"
  },
  "players": {
    "user_id_A": {"role": "villager", "status": "alive", "is_muted": false},
    "user_id_B": {"role": "werewolf", "status": "alive", "is_muted": false},
    "user_id_C": {"role": "seer", "status": "dead", "is_muted": true}
  },
  "night_actions": {
    "werewolf_votes": {"target_id": 2}, 
    "seer_check": "user_id_A"
  }
}
```

**Tasks:**
- [x] Buat global game state object di memori
- [x] Implement fungsi untuk initialize/reset game state
- [x] Struktur ini wajib dikosongkan sepenuhnya setiap kali `game_active` berubah menjadi `false`

### 2. Topologi Saluran & Penimpaan Izin (*Permission Overrides*)

Bot membutuhkan hak akses administrator untuk menimpa (*override*) izin saluran secara dinamis.

**Setup saluran otomatis saat permainan dimulai:**

- **`#setup-cmd`**: 
  - [ ] Hanya bot dan Host (pemicu `/start`)
  - [ ] Menampilkan log progress permainan

- **`#global-chat`**:
  - [ ] **Siang:** `Send Messages: TRUE` untuk pemain hidup, `Attach Files / Embeds: FALSE`
  - [ ] **Malam:** `Send Messages: FALSE`
  - [ ] **Pemain Mati/Spectator:** `View Channel: TRUE`, `Send Messages: FALSE`

- **`#werewolf-pact`**:
  - [x] Hanya visible untuk pemain dengan role Werewolf
  - [ ] Komunikasi bebas sepanjang waktu

- **`#graveyard`**:
  - [x] Hidden default untuk pemain hidup
  - [ ] Terbuka untuk pemain dead dan spectator

- **`Voice - Town Square`**:
  - [x] Semua pemain wajib di saluran ini
  - [ ] Fungsi *server-mute* diatur melalui bot

### 3. Alur Permainan & Mesin Status (*State Machine / The Engine*)

**State 0: Inisialisasi (`/start_game`)**
- [x] Bot memindai pemain di `Voice - Town Square`
- [x] Filter bot lain dan penonton
- [x] Validasi minimum pemain (default: 5 orang)
- [x] Hitung persentase peran & acak susunan ID pemain
- [x] Tetapkan peran ke dalam RAM
- [x] Kirim pesan Ephemeral (via DM) ke setiap pemain: "Peran Anda: [ROLE]. Tujuan Anda: [WIN_CONDITION]."
- [x] Transisi ke State 1: Night Phase

**State 1: Fase Malam (Eksekusi Aksi)**
- [x] Apply *server-mute* ke seluruh pemain di voice channel
- [x] Kunci `#global-chat`
- [x] Kirim UI Menu Dropdown Ephemeral ke peran aktif (WW, Seer, dll)
- [x] Dropdown berisi daftar pemain hidup dari RAM
- [x] **Timer berjalan** (default: 60 detik)
- [x] Jika WW tidak pilih hingga timeout → skip aksi pembunuhan
- [x] Kalkulasi hasil (tentukan korban)
- [x] Transisi ke State 2: Day Phase

**State 2: Fase Siang (Diskusi & Eksekusi)**
- [x] Cabut *server-mute* dari pemain hidup (tetap mute untuk dead)
- [x] Buka kembali `#global-chat`
- [x] Umumkan siapa yang gugur (tanpa sebutkan peran)
- [x] Update RAM: Status korban → `dead`, akses → `#graveyard`
- [x] **Timer Diskusi berjalan** (default: 3-5 menit)
- [x] Setelah diskusi: Menu Dropdown untuk **Voting** (semua pemain memberikan suara)
- [x] Suara mayoritas menentukan target eksekusi (status → `dead` → `#graveyard`)
- [x] Periksa Win Condition
  - [x] Jika tidak ada pemenang → kembali ke State 1
  - [x] Jika ada pemenang → ke State 3

**State 3: Akhir Permainan (Kalkulasi & Pembersihan)**
- [x] Trigger jika: Seluruh WW gugur (Villager Win), WW ≥ Villager (WW Win), atau Voice Channel kosong (Game Cancelled)
- [x] Kirim embed besar di `#global-chat` dengan rekapitulasi lengkap
- [x] Cabut *server-mute* dari semua pengguna untuk diskusi pasca-game
- [ ] Setelah beberapa menit: Purge `#global-chat` dan `#graveyard`
- [x] Reset RAM dan siap untuk permainan baru

### 4. Mitigasi Kasus Ekstrem (*Edge Case Mitigation / The Armor*)

**Event Listeners:**

- [ ] **`on_voice_state_update`** (KRUSIAL):
  - Logika: Jika game `active` dan user masuk ke voice channel
  - Cek di RAM apakah user terdaftar sebagai pemain hidup
  - Jika tidak → apply *server-mute*
  - Jika yes tapi fase malam → tetap *server-mute*
  - Jika mid-joiner → anggap sebagai spectator dengan mute

- [ ] **`on_member_disconnect`**:
  - Jika pemain disconnect selama game → anggap no action/forfeit
  - Jika voice channel jadi kosong → cancel game

**Commands (Recovery/Debugging):**

- [ ] `/cekrole` - Tampilkan peran pemain (ephemeral message)
- [ ] `/action` - Fetch dropdown UI ulang jika message corrupt/refresh

**Fitur Tambahan:**
- [ ] Game statistics & leaderboard (optional)
- [ ] Replay/log permainan untuk archive

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
