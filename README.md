# 🌟 Kuis Pintar - Game Kuis Anak SD

Game kuis interaktif dan menyenangkan untuk anak-anak SD dengan animasi seru dan papan skor bersama!

## Fitur
- 🎮 4 Kategori: Matematika, IPA, Bahasa Indonesia, Pengetahuan Umum
- ⏱️ Timer countdown per soal
- ❤️ Sistem nyawa (3 nyawa)
- ⭐ Scoring dengan bonus waktu
- 🏆 Papan skor bersama (semua pemain bisa lihat)
- 🎉 Animasi confetti & feedback interaktif
- 📱 Responsive (bisa di HP)

## Jalankan Lokal

```bash
npm install
npm start
```
Buka http://localhost:3000

---

## 🚀 Deploy (Gratis)

### Opsi 1: Railway (Paling Mudah)
1. Buat akun di [railway.app](https://railway.app)
2. Install Railway CLI atau pakai web dashboard
3. Hubungkan ke GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Kuis Pintar"
   ```
4. Push ke GitHub, lalu di Railway → "New Project" → "Deploy from GitHub repo"
5. Railway otomatis detect Node.js & jalankan `npm start`
6. Dapat URL publik otomatis! ✅

### Opsi 2: Render
1. Buat akun di [render.com](https://render.com)
2. Push code ke GitHub
3. Di Render → "New" → "Web Service" → pilih repo
4. Setting:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Pilih plan **Free** → Deploy! ✅

### Opsi 3: Glitch (Tanpa GitHub)
1. Buka [glitch.com](https://glitch.com)
2. "New Project" → "Import from GitHub" atau "glitch-hello-node"
3. Upload/paste semua file
4. Otomatis jalan & dapat URL publik! ✅

> **⚠️ Catatan:** Skor disimpan di file JSON di server. Pada platform gratis, data bisa hilang saat server restart. Untuk produksi serius, pertimbangkan pakai database gratis seperti MongoDB Atlas atau Supabase.
