# Werewolf Bot

Discord bot untuk memainkan game minigame Werewolf di server Discord. Bot ini sudah memasuki versi 1.1 dengan fitur UI/UX yang modern (bebas DM) dan *engine* mekanik yang komprehensif.

## Deskripsi

Bot Discord yang dirancang untuk mengorganisir dan menjalankan game Werewolf di channel Discord. Game ini melibatkan pemain yang berperan sebagai villager atau werewolf, dengan tujuan untuk mengidentifikasi dan mengeliminasi werewolf.

## Fitur yang Telah Diimplementasikan 🚀 (v1.1)

Bot ini telah memiliki fondasi mesin permainan (*Core Engine*) yang kokoh dan sepenuhnya *playable*:

- **🧠 State Manager & Engine Solid**: Siklus permainan terotomatisasi penuh (Lobby → Malam → Fajar → Siang → Voting → Malam).
- **⏱️ Timer & Konfigurasi Fleksibel**: Seluruh timer (Malam, Diskusi Siang, Voting) kini dapat diatur secara dinamis per server menggunakan command `/bot-config`.
- **🛡️ Manajemen Channel, Thread, & Role Server**: Membuat dan menghapus kategori beserta saluran khusus (`#global-chat`, `#werewolf-pact`, `#graveyard`). Ditambah proteksi *Anti-Thread* untuk mencegah kecurangan. Pemain juga otomatis diberi role Discord `Werewolf: Alive` atau `Werewolf: Dead` untuk identifikasi visual.
- **🎭 100% No-DM & Ephemeral UI**: Selamat tinggal Direct Message! Reveal Role, Aksi Malam (termasuk hasil terawangan Seer langsung), dan *voting* dilakukan sepenuhnya menggunakan *Interactive Buttons* & *Dropdown* rahasia (*ephemeral*) di dalam server.
- **🗺️ Sistem Zona & Investigasi (Baru!)**: Setiap malam pemain disebar ke 4 zona acak (🏛️ Balai Desa, 🏘️ Pemukiman, 🏚️ Gudang, 🌲 Hutan). Serangan Werewolf akan meninggalkan jejak yang dapat diinvestigasi oleh pemain lain di zona yang aman, menambah bumbu deduksi ekstra!
- **🐺 Sistem Voting Werewolf Majemuk**: Werewolf kini saling berdiskusi dan melakukan voting (mayoritas) untuk menentukan mangsa. Jika terjadi seri, sistem akan meminta re-vote.
- **⚙️ Dynamic Role Registry & Point System**: Arsitektur bot sangat *scalable*. Menambah peran baru mudah dan kini setiap role memiliki bobot poin (WW: -6, Seer: +4, Villager: 0) sebagai fondasi *auto-balancing*.
- **🎮 Lobby Host UI**: Embed Lobby interaktif di mana Host dapat menekan tombol `Config`, `Start`, atau `Cancel` secara langsung.
- **🤖 E2E Solo Testing Framework**: Mode `/test` rahasia untuk Developer! Mensimulasikan game secara *solo* menggunakan *Virtual Bots*.
- **🚧 Edge Case Armor**: Proteksi bawaan terhadap *disconnect*, AFK, *unmute* paksa di luar giliran, hingga proteksi tombol klik berulang.

## Ide Fitur & Rencana Kedepan (Roadmap) 🗺️

Karena *core engine*, antarmuka yang bebas DM, dan QoL (Quality of Life) Lobby sudah matang, pengembangan selanjutnya difokuskan pada kedalaman *gameplay* (ekspansi Role) dan fitur komunitas.

### 1. Penambahan Peran (Roles) Ekstensif
Memanfaatkan arsitektur `rolemaker.txt` dan *Sistem Poin*, penambahan role akan sangat mulus:
- [ ] 🛡️ **Guardian Angel / Bodyguard**: Melindungi satu orang setiap malam dari gigitan Werewolf (siap untuk integrasi UI ephemeral).
- [ ] 🧙‍♀️ **Witch (Penyihir)**: Memiliki 1 Ramuan Kehidupan dan 1 Ramuan Racun yang hanya bisa dipakai masing-masing satu kali seumur hidup.
- [ ] 🤡 **Fool / Jester (Neutral)**: Memiliki *Win Condition* mandiri (harus berhasil di-lynch di siang hari).
- [ ] 🔫 **Hunter**: Jika mati, ia bisa membawa satu orang lain ke liang lahat bersamanya.
- [ ] 🐺 **Alpha Werewolf**: Terdeteksi sebagai *"Villager biasa"* jika diterawang oleh Seer.
- [x] ⚖️ **Algoritma Role Balancing (Sistem Poin)**: Poin sudah diimplementasikan ke setiap role (v1.1), tinggal merancang algoritma peracik otomatisnya untuk `/config auto`.

### 2. Peningkatan User Experience (UX / QoL)
- [x] **UX Interaktif untuk Setup & Gameplay**: Tombol Host di Lobby, UI ephemeral bebas DM untuk Reveal Role & Hasil Aksi.
- [ ] **Notifikasi Naratif**: Menambahkan teks, gambar *ASCII/GIF*, atau pesan dinamis saat pengumuman fajar.
- [ ] **Bisikan Hantu**: Menambahkan elemen *gameplay* seru di mana pemain di `#graveyard` bisa menebak siapa WW sebenarnya.

### 3. Sistem Ekonomi & Database Server
- [ ] **Database Persisten (MongoDB / SQLite / PostgreSQL)**: Menghindari kehilangan data (konfigurasi timer per server, state game) jika bot di-*restart*.
- [ ] **Leaderboard & Statistik**: Melacak pemain dengan rekor kemenangan tertinggi, role terfavorit, dll.

## Setup & Instalasi 🛠️

1. **Clone repository:**
   ```bash
   git clone https://github.com/Tederby/werewolf-bot.git
   cd werewolf-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Buat file `.env` di *root directory* dan isi dengan variabel berikut:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_application_client_id
   DISCORD_GUILD_ID=your_server_guild_id
   ```
   *(Catatan: Saat ini bot diatur untuk me-deploy slash commands secara eksklusif ke satu server/guild demi kecepatan update. Pastikan `DISCORD_GUILD_ID` terisi dengan ID Server pengujian).*

4. **Setup Bot di Discord Developer Portal:**
   - Buka [Discord Developer Portal](https://discord.com/developers/applications)
   - Buka tab **Bot** → Copy token ke `.env`.
   - Aktifkan **Privileged Gateway Intents**:
     - ✅ Server Members Intent
     - ✅ Message Content Intent
   - Buka tab **OAuth2** → **URL Generator**:
     - **Scopes**: `bot`, `applications.commands`
     - **Bot Permissions**: 
       - `Manage Channels` (Krusial untuk membuat arena)
       - `Manage Roles` & `Manage Permissions` (Krusial untuk channel, role Alive/Dead, & *graveyard*)
       - `Mute Members` (Krusial untuk *Server-Mute* otomatis)
       - `Send Messages`, `Embed Links`, `Read Messages/View Channels`
     - Salin URL yang di-generate dan undang bot ke server Anda.

5. **Jalankan bot:**
   ```bash
   npm start
   ```

## Testing & Simulasi 🧪

Bot ini menggunakan sistem **Slash Commands (/)** modern. Anda harus melakukan inisialisasi awal di server Anda terlebih dahulu:

1. Ketik `/setup-werewolf` di server. Bot akan membuat kategori konfigurasi otomatis, 2 role server (Alive/Dead), dan *setup channel*.
2. **E2E Solo Testing Framework:**
   Jika Anda developer dan ingin menguji siklus permainan tanpa butuh 5 orang lain, gunakan command rahasia:
   `/test`
   Bot akan men-generate 5 *Virtual Players* dan memandu Anda step-by-step!

## Development 💻

Arsitektur bot ini sepenuhnya *modular*.
- **`src/engine/`**: Jantung permainan (Phase, Vote, Win Condition, Zone System).
- **`src/roles/`**: Registrasi peran beserta bobot poinnya. Untuk membuat *role* baru, gunakan kerangka di `src/roles/defs/rolemaker.txt`.
- **`src/utils/`**: Utilitas seperti pembantu konfigurasi server.
- **Console Log**: Berjalan sangat rapi. Akan ada tag `[Engine]`, `[Router]`, atau `[Test]` untuk memudahkan *debugging*.

## Tech Stack
- **Node.js**
- **discord.js v14**
- **dotenv**

## Security
⚠️ **JANGAN** membagikan token bot. File `.env` sudah dimasukkan ke dalam `.gitignore`.
