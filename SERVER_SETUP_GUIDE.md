# 🏛️ Panduan Setup Server CIVICA dengan Cloudflare Tunnel

## 📖 Overview

Panduan ini menjelaskan cara setup **server pribadi (private server)** untuk CIVICA Storage API menggunakan **Cloudflare Tunnel**. Dengan teknik tunneling ini, server tidak memerlukan IP publik atau port forwarding - Cloudflare Tunnel akan membuat koneksi aman dari server ke jaringan Cloudflare.

### Kenapa Cloudflare Tunnel?

- ✅ **Tidak perlu IP publik** - Server bisa di belakang NAT/firewall
- ✅ **SSL/TLS otomatis** - Cloudflare handle semua sertifikat
- ✅ **Tidak perlu buka port** - Lebih aman, tidak ada port yang exposed
- ✅ **DDoS Protection** - Built-in dari Cloudflare
- ✅ **Gratis** - Cloudflare Tunnel gratis digunakan

---

## 🏗️ Arsitektur

```
┌─────────────────┐         HTTPS          ┌──────────────────────────┐
│   CIVICA App    │ ◄────────────────────► │   Cloudflare Network     │
│  (React Native) │                        │  (storage.sangkaraprasetya│
└─────────────────┘                        │         .site)           │
                                           └────────────┬─────────────┘
                                                        │
                                              Cloudflare Tunnel
                                           (Outbound connection)
                                                        │
                                                        ▼
                                           ┌──────────────────────────┐
                                           │   🏠 PRIVATE SERVER      │
                                           │   (Di rumah/kantor)      │
                                           │   ┌──────────────────┐   │
                                           │   │ cloudflared      │   │
                                           │   │ daemon           │   │
                                           │   └────────┬─────────┘   │
                                           │            │             │
                                           │   ┌────────▼─────────┐   │
                                           │   │ Node.js API      │   │
                                           │   │ (localhost:3001) │   │
                                           │   └──────────────────┘   │
                                           │            │             │
                                           │   ┌────────▼─────────┐   │
                                           │   │ File Storage     │   │
                                           │   │ /uploads/        │   │
                                           │   └──────────────────┘   │
                                           └──────────────────────────┘
```

**Alur Kerja:**

1. CIVICA App request ke `https://storage.sangkaraprasetya.site`
2. Request masuk ke Cloudflare Network
3. Cloudflare meneruskan request melalui tunnel ke `cloudflared` daemon
4. `cloudflared` forward request ke Node.js API di `localhost:3001`
5. Response dikirim balik melalui jalur yang sama

---

## 📋 Prerequisites

| Kebutuhan          | Keterangan                                |
| ------------------ | ----------------------------------------- |
| Server Linux       | Ubuntu 20.04+, Debian, atau distro lain   |
| Node.js            | Versi 18 atau lebih baru                  |
| Domain             | `sangkaraprasetya.site` (sudah ada)       |
| Cloudflare Account | Gratis, domain sudah di-manage Cloudflare |
| Internet           | Koneksi stabil (upload speed penting)     |

> ⚠️ **Tidak perlu:** IP publik, port forwarding, SSL certificate manual, Nginx

---

## 🚀 STEP 1: Persiapan Server

### 1.1 Update Sistem

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Node.js 18+

```bash
# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi
node --version  # Harus v18.x.x atau lebih
npm --version
```

### 1.3 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 1.4 Install Cloudflared

```bash
# Download dan install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Verifikasi instalasi
cloudflared --version

# Cleanup
rm cloudflared.deb
```

---

## 🚀 STEP 2: Setup Storage API

### 2.1 Buat Direktori Project

```bash
# Buat folder project
sudo mkdir -p /var/www/civica-storage
sudo chown -R $USER:$USER /var/www/civica-storage
cd /var/www/civica-storage

# Buat struktur folder
mkdir -p uploads/posts uploads/avatars uploads/reports
```

### 2.2 Inisialisasi Project

```bash
npm init -y
npm install express multer cors sharp uuid helmet dotenv
```

### 2.3 Buat File Environment

```bash
nano .env
```

Isi dengan:

```env
# Port server (jangan ubah jika pakai config tunnel default)
PORT=3001

# Domain untuk generate URL
DOMAIN=https://storage.sangkaraprasetya.site

# API Key - WAJIB DIGANTI dengan random string yang aman!
# Generate dengan: openssl rand -hex 32
API_KEY=GANTI_DENGAN_API_KEY_YANG_AMAN_MINIMAL_32_KARAKTER
```

### 2.4 Copy File Server

Copy file `server.js` dari repository ini ke `/var/www/civica-storage/server.js`

```bash
# Jika clone dari repo
cp /path/to/repo/docs/server/server.js /var/www/civica-storage/

# Atau buat manual dengan nano/vim
nano server.js
# Paste isi dari file server.js di repo ini
```

### 2.5 Test Server Lokal

```bash
# Test jalankan server
node server.js

# Output seharusnya:
# 🚀 Storage API Server running on port 3001
# 📁 Upload directory: /var/www/civica-storage/uploads
```

Tekan `Ctrl+C` untuk stop.

---

## 🚀 STEP 3: Setup Cloudflare Tunnel

### 3.1 Login ke Cloudflare

```bash
cloudflared tunnel login
```

Ini akan membuka browser untuk login ke akun Cloudflare. Pilih domain `sangkaraprasetya.site` ketika diminta.

> Jika server tidak punya GUI, copy URL yang muncul dan buka di browser lain.

### 3.2 Buat Tunnel Baru

```bash
cloudflared tunnel create civica-storage
```

**Output contoh:**

```
Tunnel credentials written to /home/user/.cloudflared/abc123-xxxx-xxxx.json
Created tunnel civica-storage with id abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> 📝 **CATAT TUNNEL_ID!** (contoh: `abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 3.3 Buat Config Tunnel

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Isi dengan:

```yaml
# Cloudflare Tunnel Config untuk CIVICA Storage
# Ganti <TUNNEL_ID> dengan ID tunnel dari step 3.2

tunnel: <TUNNEL_ID>
credentials-file: /home/<USERNAME>/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Storage API endpoint
  - hostname: storage.sangkaraprasetya.site
    service: http://localhost:3001
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false

  # Catch-all rule (wajib ada di paling bawah)
  - service: http_status:404
```

> ⚠️ Ganti `<TUNNEL_ID>` dan `<USERNAME>` dengan nilai yang sesuai!

### 3.4 Route DNS ke Tunnel

```bash
cloudflared tunnel route dns civica-storage storage.sangkaraprasetya.site
```

Ini akan otomatis membuat CNAME record di Cloudflare DNS.

### 3.5 Test Tunnel Manual

```bash
# Terminal 1: Jalankan API server
cd /var/www/civica-storage
node server.js

# Terminal 2: Jalankan tunnel
cloudflared tunnel run civica-storage
```

Test dari browser atau curl:

```bash
curl https://storage.sangkaraprasetya.site/health
```

**Response yang diharapkan:**

```json
{ "status": "ok", "timestamp": "2026-01-30T..." }
```

---

## 🚀 STEP 4: Setup Autostart (Systemd Services)

### 4.1 Setup PM2 untuk Node.js API

```bash
cd /var/www/civica-storage

# Start dengan PM2
pm2 start server.js --name civica-storage

# Simpan konfigurasi PM2
pm2 save

# Setup autostart saat boot
pm2 startup
# Jalankan command yang diberikan oleh PM2
```

### 4.2 Setup Cloudflared sebagai Service

```bash
sudo cloudflared service install
```

Ini akan:

- Copy config ke `/etc/cloudflared/config.yml`
- Membuat systemd service
- Enable autostart saat boot

### 4.3 Verifikasi Services

```bash
# Cek status cloudflared
sudo systemctl status cloudflared

# Cek status PM2
pm2 status

# Cek logs
sudo journalctl -u cloudflared -f  # Logs cloudflared
pm2 logs civica-storage             # Logs Node.js API
```

---

## 🧪 STEP 5: Testing

### 5.1 Health Check

```bash
curl https://storage.sangkaraprasetya.site/health
```

### 5.2 Test Upload (dengan API Key)

```bash
# Ganti YOUR_API_KEY dengan API key di .env
curl -X POST \
  https://storage.sangkaraprasetya.site/upload/posts \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "image=@/path/to/test-image.jpg"
```

**Response sukses:**

```json
{
  "success": true,
  "url": "https://storage.sangkaraprasetya.site/uploads/posts/1706612345_abc123.jpg",
  "filename": "1706612345_abc123.jpg"
}
```

### 5.3 Test Akses File

Buka URL dari response di browser - gambar harus bisa diakses.

---

## 🔧 Troubleshooting

### Tunnel tidak jalan

```bash
# Cek status
sudo systemctl status cloudflared

# Restart tunnel
sudo systemctl restart cloudflared

# Lihat logs
sudo journalctl -u cloudflared -n 50
```

### API tidak response

```bash
# Cek PM2
pm2 status
pm2 logs civica-storage

# Restart API
pm2 restart civica-storage
```

### Error 502 Bad Gateway

- Pastikan Node.js server berjalan di port 3001
- Cek apakah port sudah digunakan: `sudo lsof -i :3001`

### Error 401 Unauthorized

- Pastikan API Key di header sama dengan di `.env`
- Header: `X-API-Key: your-api-key`

---

## 📁 Struktur File di Server

```
/var/www/civica-storage/
├── .env                 # Environment variables (API_KEY, dll)
├── server.js            # API server
├── package.json         # Dependencies
├── node_modules/        # Installed packages
└── uploads/             # Uploaded files
    ├── posts/           # Post images
    ├── avatars/         # User avatars
    └── reports/         # Report attachments

~/.cloudflared/
├── config.yml           # Tunnel configuration
├── cert.pem             # Cloudflare certificate (dari login)
└── <TUNNEL_ID>.json     # Tunnel credentials
```

---

## 🔐 Keamanan

### Yang Sudah Ditangani:

1. **SSL/TLS** - Otomatis dari Cloudflare (tidak perlu setup manual)
2. **DDoS Protection** - Built-in dari Cloudflare
3. **API Key Authentication** - Semua upload/delete butuh API key
4. **Rate Limiting** - 100 request per menit per IP
5. **File Type Validation** - Hanya image yang diizinkan
6. **File Size Limit** - Maksimal 10MB per file

### Best Practices:

```bash
# Generate API Key yang aman
openssl rand -hex 32

# Jangan commit .env ke git
echo ".env" >> .gitignore

# Backup uploads folder secara berkala
rsync -avz /var/www/civica-storage/uploads/ /backup/civica/
```

---

## 📊 Monitoring

### Cloudflare Dashboard

1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Pilih domain `sangkaraprasetya.site`
3. Pergi ke **Traffic** untuk lihat analytics
4. Pergi ke **Zero Trust > Networks > Tunnels** untuk status tunnel

### Server Monitoring

```bash
# Real-time logs
pm2 logs civica-storage --lines 100

# Monitoring resource
pm2 monit

# Status semua service
pm2 status
sudo systemctl status cloudflared
```

---

## 🔄 Update & Maintenance

### Update Cloudflared

```bash
# Download versi terbaru
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Restart service
sudo systemctl restart cloudflared
```

### Update Dependencies API

```bash
cd /var/www/civica-storage
npm update
pm2 restart civica-storage
```

---

## 📞 Quick Commands Reference

| Task             | Command                                           |
| ---------------- | ------------------------------------------------- |
| Start API        | `pm2 start civica-storage`                        |
| Stop API         | `pm2 stop civica-storage`                         |
| Restart API      | `pm2 restart civica-storage`                      |
| Logs API         | `pm2 logs civica-storage`                         |
| Start Tunnel     | `sudo systemctl start cloudflared`                |
| Stop Tunnel      | `sudo systemctl stop cloudflared`                 |
| Restart Tunnel   | `sudo systemctl restart cloudflared`              |
| Logs Tunnel      | `sudo journalctl -u cloudflared -f`               |
| Check Status All | `pm2 status && sudo systemctl status cloudflared` |

---

## ✅ Checklist Setup

- [ ] Node.js 18+ terinstall
- [ ] PM2 terinstall
- [ ] Cloudflared terinstall
- [ ] Project folder dibuat (`/var/www/civica-storage`)
- [ ] Dependencies terinstall (`npm install`)
- [ ] File `.env` dibuat dengan API_KEY yang aman
- [ ] File `server.js` ada
- [ ] Cloudflared login sukses
- [ ] Tunnel dibuat (`cloudflared tunnel create`)
- [ ] Config tunnel dibuat (`~/.cloudflared/config.yml`)
- [ ] DNS route dibuat
- [ ] API server jalan via PM2
- [ ] Cloudflared service terinstall
- [ ] Health check sukses
- [ ] Test upload sukses

---

**🎉 Selesai! Server CIVICA Storage sudah siap digunakan.**
