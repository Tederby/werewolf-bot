# Werewolf Bot

Discord bot untuk memainkan game minigame Werewolf di server Discord. Bot ini masih dalam tahap development awal (barebone).

## Deskripsi

Bot Discord yang dirancang untuk mengorganisir dan menjalankan game Werewolf di channel Discord. Game ini melibatkan pemain yang berperan sebagai villager atau werewolf, dengan tujuan untuk mengidentifikasi dan mengeliminasi werewolf.

## Fitur yang Telah Diimplementasikan 🚀

Bot ini telah memiliki fondasi mesin permainan (*Core Engine*) yang kokoh dan sepenuhnya *playable*:

- **🧠 State Manager & Engine Solid**: Siklus permainan terotomatisasi penuh (Lobby → Malam → Fajar → Siang → Voting → Malam). Dilengkapi timer Anti-AFK untuk mencegah *softlock* jika pemain lupa bertindak.
- **🛡️ Channel & Permission Dinamis**: Membuat dan menghapus kategori beserta saluran khusus (seperti `#global-chat` dan `#graveyard`) secara *on-the-fly*. Sistem ini juga mengamankan jalannya diskusi siang dengan fitur *Auto Server-Mute* berbasis fase dan status hidup/mati pemain.
- **🎭 Ephemeral UI Night Actions**: Pengalaman UX kelas atas dengan menggunakan sistem *Global Action Button* di server. Aksi malam dilakukan via *dropdown* rahasia (*ephemeral*) tanpa memerlukan *Direct Message* (DM), memecahkan masalah privasi DM tertutup pada Discord.
- **⚙️ Dynamic Role Registry**: Arsitektur bot sangat *scalable*. Menambah peran baru sangat mudah menggunakan *template* tanpa perlu merusak struktur *engine* utama. Peran saat ini: 🐺 Werewolf, 🔮 Seer, dan 👨‍🌾 Villager.
- **⚖️ Automated Lynch Vote**: Diskusi siang hari otomatis diakhiri dengan pemungutan suara mayoritas untuk mengeksekusi pemain yang dicurigai.
- **🤖 E2E Solo Testing Framework**: Mode `/test` rahasia untuk Developer! Mensimulasikan game secara *solo* menggunakan *Virtual Bots*, memungkinkan pengujian peran dan *engine* baru dalam hitungan detik tanpa membutuhkan *alt-account* atau tester lain.
- **🚧 Edge Case Armor**: Proteksi bawaan terhadap kecurangan. Pemain tidak bisa *unmute* paksa di luar giliran. Bot juga sudah mampu menangani *player* yang mencoba keluar masuk atau *disconnect* di tengah jalannya permainan.

## Ide Fitur & Rencana Kedepan (Roadmap) 🗺️

Karena *core engine* sudah sangat matang, pengembangan selanjutnya difokuskan pada kedalaman *gameplay* (ekspansi Role) dan fitur komunitas.

### 1. Penambahan Peran (Roles) Ekstensif
Memanfaatkan arsitektur `rolemaker.txt`, fitur paling menarik ke depan adalah menambah berbagai peran baru. Misalkan:
- [ ] 🛡️ **Guardian Angel / Bodyguard**: Melindungi satu orang setiap malam dari gigitan Werewolf.
- [ ] 🧙‍♀️ **Witch (Penyihir)**: Memiliki 1 Ramuan Kehidupan dan 1 Ramuan Racun yang hanya bisa dipakai masing-masing satu kali seumur hidup.
- [ ] 🤡 **Fool / Jester (Neutral)**: Berbeda dari WW atau Village, role ini punya *Win Condition* mandiri, yaitu harus berhasil meyakinkan orang lain untuk mengeksekusinya di siang hari.
- [ ] 🔫 **Hunter**: Jika mati, ia bisa membawa satu orang lain ke liang lahat bersamanya.
- [ ] 🐺 **Alpha Werewolf**: Sang bos Werewolf. Akan terdeteksi sebagai *"Villager biasa"* jika diterawang oleh Seer.
- [ ] ⚖️ **Algoritma Role Balancing (Sistem Poin)**: Seiring bertambah luasnya peran, akan dikembangkan algoritma pembagian role (*auto-role*) yang menggunakan nilai poin (contoh: WW bernilai minus, Village bernilai plus) agar secara otomatis menghasilkan komposisi yang adil dengan menargetkan total poin mendekati 0.
- Dan lain sebagainya...

### 2. Peningkatan User Experience (UX / QoL)
- [ ] **UX Interaktif untuk** `/config`: Merombak antarmuka konfigurasi agar lebih nyaman dan rapi, menggunakan menu *Embed* atau *Modal/Dropdown* alih-alih teks biasa.
- [ ] **Notifikasi**: Menambahkan teks atau gambar *ASCII/GIF* saat pengumuman fajar.
- [ ] **Bisikan Hantu**: Menambahkan elemen *gameplay* seru di mana pemain di `#graveyard` bisa menebak siapa WW sebenarnya.
- Dan lain sebagainya...

### 3. Sistem Ekonomi & Database Server
- [ ] **Database Persisten (MongoDB / SQLite)**: Menghindari kehilangan data jika bot di-*restart* tiba-tiba.
- [ ] **Leaderboard & Statistik**: Melacak pemain mana yang memiliki rekor kemenangan tertinggi, atau melacak pemain dengan gelar "Paling Sering Terbunuh di Malam Pertama".
- Dan lain sebagainya...

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
       - `Manage Roles` & `Manage Permissions` (Krusial untuk kunci channel & *graveyard*)
       - `Mute Members` (Krusial untuk *Server-Mute* otomatis)
       - `Send Messages`, `Embed Links`, `Read Messages/View Channels`
     - Salin URL yang di-generate dan undang bot ke server Anda.

5. **Jalankan bot:**
   ```bash
   npm start
   ```

## Testing & Simulasi 🧪

Bot ini menggunakan sistem **Slash Commands (/)** modern. Anda harus melakukan inisialisasi awal di server Anda terlebih dahulu:

1. Ketik `/setup-werewolf` di server. Bot akan membuat kategori konfigurasi otomatis dan *setup channel*.
2. **E2E Solo Testing Framework:**
   Jika Anda developer dan ingin menguji siklus permainan tanpa butuh 5 orang lain, gunakan command rahasia:
   `/test`
   Bot akan men-generate 5 *Virtual Players* dan memandu Anda step-by-step (Distribusi Role, Fase Malam, Resolusi Fajar, hingga Voting) via tombol UI interaktif!

## Development 💻

Arsitektur bot ini sepenuhnya *modular*.
- **`src/engine/`**: Jantung permainan (Phase, Vote, Win Condition).
- **`src/roles/`**: Registrasi peran. Untuk membuat *role* baru, gunakan kerangka di `src/roles/defs/rolemaker.txt`. Sistem akan mengaitkan *role* baru ke dalam *engine* dan `/test` *framework* secara otomatis.
- **Console Log**: Berjalan sangat rapi. Akan ada tag `[Engine]`, `[Router]`, atau `[Test]` untuk memudahkan *debugging* siklus permainan.

## Tech Stack
- **Node.js**
- **discord.js v14**
- **dotenv**

## Security
⚠️ **JANGAN** membagikan token bot. File `.env` sudah dimasukkan ke dalam `.gitignore`.
