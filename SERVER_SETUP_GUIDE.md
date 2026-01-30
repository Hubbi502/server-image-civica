# Panduan Konfigurasi Server Storage - CIVICA

## Overview

Panduan ini menjelaskan cara setup server pribadi untuk menggantikan Firebase Storage dengan menggunakan subdomain `storage.sangkaraprasetya.site`.

---

## 🏗️ Arsitektur

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────────┐
│   CIVICA App    │ ───► │  storage.sangkaraprasetya │ ───► │  Private Server │
│  (React Native) │      │         .site             │      │  (File Storage) │
└─────────────────┘      └──────────────────────────┘      └─────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────────┐
                         │   Cloudflare Tunnel /    │
                         │   Nginx Reverse Proxy    │
                         └──────────────────────────┘
```

---

## 📋 Langkah-langkah Konfigurasi

### **STEP 1: Persiapan Server**

#### 1.1 Requirements

- Server dengan OS Linux (Ubuntu 20.04+ recommended)
- Node.js 18+ atau Python 3.9+
- Nginx
- Domain: `sangkaraprasetya.site` (sudah dimiliki)
- SSL Certificate (Let's Encrypt)

#### 1.2 Install Dependencies di Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install Certbot untuk SSL
sudo apt install -y certbot python3-certbot-nginx

# Install PM2 untuk process management
sudo npm install -g pm2
```

---

### **STEP 2: Setup Storage API Server**

#### 2.1 Buat Folder Project

```bash
# Di server
mkdir -p /var/www/storage-api
cd /var/www/storage-api

# Buat struktur folder
mkdir -p uploads/posts uploads/avatars
```

#### 2.2 Inisialisasi Project

```bash
npm init -y
npm install express multer cors sharp uuid helmet
```

#### 2.3 Buat File Server (`server.js`)

```javascript
// /var/www/storage-api/server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet());

// CORS Configuration - sesuaikan dengan kebutuhan
app.use(
  cors({
    origin: "*", // Untuk production, ganti dengan origin spesifik
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  }),
);

// API Key untuk autentikasi (ganti dengan key yang aman!)
const API_KEY = process.env.API_KEY || "your-super-secret-api-key-change-this";

// Middleware autentikasi
const authenticate = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Storage configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPEG, PNG, WebP, and GIF allowed."),
      );
    }
  },
});

// Upload directory
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Ensure upload directories exist
["posts", "avatars"].forEach((dir) => {
  const dirPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Serve static files
app.use("/uploads", express.static(UPLOAD_DIR));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Upload single image
app.post(
  "/upload/:type",
  authenticate,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const type = req.params.type; // 'posts' or 'avatars'
      if (!["posts", "avatars"].includes(type)) {
        return res.status(400).json({ error: "Invalid upload type" });
      }

      const filename = `${Date.now()}_${uuidv4()}.jpg`;
      const filepath = path.join(UPLOAD_DIR, type, filename);

      // Compress and resize image
      await sharp(req.file.buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(filepath);

      const imageUrl = `https://storage.sangkaraprasetya.site/uploads/${type}/${filename}`;

      res.json({
        success: true,
        url: imageUrl,
        filename,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

// Upload multiple images
app.post(
  "/upload-multiple/:type",
  authenticate,
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const type = req.params.type;
      if (!["posts", "avatars"].includes(type)) {
        return res.status(400).json({ error: "Invalid upload type" });
      }

      const uploadedUrls = [];

      for (const file of req.files) {
        const filename = `${Date.now()}_${uuidv4()}.jpg`;
        const filepath = path.join(UPLOAD_DIR, type, filename);

        await sharp(file.buffer)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(filepath);

        uploadedUrls.push(
          `https://storage.sangkaraprasetya.site/uploads/${type}/${filename}`,
        );
      }

      res.json({
        success: true,
        urls: uploadedUrls,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload images" });
    }
  },
);

// Delete image
app.delete("/delete", authenticate, async (req, res) => {
  try {
    const { filename, type } = req.body;

    if (!filename || !type) {
      return res.status(400).json({ error: "Filename and type required" });
    }

    if (!["posts", "avatars"].includes(type)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    const filepath = path.join(UPLOAD_DIR, type, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.json({ success: true, message: "File deleted" });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Storage API running on port ${PORT}`);
});
```

#### 2.4 Buat File Environment

```bash
# /var/www/storage-api/.env
PORT=3001
API_KEY=ganti-dengan-api-key-yang-aman-dan-random
```

#### 2.5 Start Server dengan PM2

```bash
cd /var/www/storage-api
pm2 start server.js --name "storage-api"
pm2 save
pm2 startup
```

---

### **STEP 3: Konfigurasi Nginx**

#### 3.1 Buat Nginx Config

```bash
sudo nano /etc/nginx/sites-available/storage.sangkaraprasetya.site
```

Isi dengan:

```nginx
server {
    listen 80;
    server_name storage.sangkaraprasetya.site;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name storage.sangkaraprasetya.site;

    # SSL certificates (akan diisi setelah certbot)
    ssl_certificate /etc/letsencrypt/live/storage.sangkaraprasetya.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storage.sangkaraprasetya.site/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Max upload size
    client_max_body_size 50M;

    # Gzip
    gzip on;
    gzip_types text/plain application/json image/svg+xml;

    # Static files (gambar)
    location /uploads {
        alias /var/www/storage-api/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    # API proxy
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 3.2 Enable Site & Restart Nginx

```bash
# Hapus konfigurasi sementara untuk mendapatkan SSL dulu
sudo rm /etc/nginx/sites-available/storage.sangkaraprasetya.site

# Buat konfigurasi minimal untuk certbot
sudo nano /etc/nginx/sites-available/storage.sangkaraprasetya.site
```

Konfigurasi minimal (untuk dapat SSL):

```nginx
server {
    listen 80;
    server_name storage.sangkaraprasetya.site;

    location / {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/storage.sangkaraprasetya.site /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

---

### **STEP 4: Setup DNS & SSL**

#### 4.1 Konfigurasi DNS

Di panel domain `sangkaraprasetya.site`, tambahkan DNS record:

| Type | Name    | Value/Target   | TTL  |
| ---- | ------- | -------------- | ---- |
| A    | storage | IP_SERVER_KAMU | 3600 |

Atau jika menggunakan Cloudflare Tunnel, gunakan CNAME.

#### 4.2 Generate SSL Certificate

```bash
# Pastikan DNS sudah propagate dulu (cek dengan dig atau nslookup)
nslookup storage.sangkaraprasetya.site

# Generate SSL
sudo certbot --nginx -d storage.sangkaraprasetya.site

# Setelah berhasil, update config nginx dengan versi lengkap di atas
```

---

### **STEP 5: Alternatif - Cloudflare Tunnel (Recommended)**

Jika server tidak memiliki IP publik atau ingin lebih secure:

#### 5.1 Install Cloudflared

```bash
# Download dan install
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Login ke Cloudflare
cloudflared tunnel login
```

#### 5.2 Buat Tunnel

```bash
# Buat tunnel baru
cloudflared tunnel create civica-storage

# Buat config
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Isi `config.yml`:

```yaml
tunnel: <TUNNEL_ID_DARI_STEP_SEBELUMNYA>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: storage.sangkaraprasetya.site
    service: http://localhost:3001
  - service: http_status:404
```

#### 5.3 Route DNS

```bash
cloudflared tunnel route dns civica-storage storage.sangkaraprasetya.site
```

#### 5.4 Jalankan sebagai Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

---

### **STEP 6: Testing**

#### 6.1 Test Health Check

```bash
curl https://storage.sangkaraprasetya.site/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "2026-01-30T12:00:00.000Z" }
```

#### 6.2 Test Upload (menggunakan curl)

```bash
curl -X POST \
  https://storage.sangkaraprasetya.site/upload/posts \
  -H "X-API-Key: your-api-key" \
  -F "image=@/path/to/test-image.jpg"
```

---

### **STEP 7: Security Checklist**

- [ ] Ganti `API_KEY` dengan value yang random dan aman
- [ ] Simpan API_KEY di environment variable, jangan hardcode
- [ ] Setup firewall (UFW)
  ```bash
  sudo ufw allow 22
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```
- [ ] Setup rate limiting di Nginx
- [ ] Setup backup otomatis untuk folder uploads
- [ ] Monitor disk space

---

## 📝 API Endpoints

| Method | Endpoint                     | Description                    | Auth |
| ------ | ---------------------------- | ------------------------------ | ---- |
| GET    | `/health`                    | Health check                   | No   |
| POST   | `/upload/posts`              | Upload single image untuk post | Yes  |
| POST   | `/upload/avatars`            | Upload avatar user             | Yes  |
| POST   | `/upload-multiple/posts`     | Upload multiple images         | Yes  |
| DELETE | `/delete`                    | Delete image                   | Yes  |
| GET    | `/uploads/{type}/{filename}` | Get image (static)             | No   |

---

## 🔐 Headers Required

```
X-API-Key: your-api-key-here
Content-Type: multipart/form-data
```

---

## 📱 Integrasi dengan CIVICA App

Setelah server siap, update file `services/storage.ts` di app React Native. File ini sudah saya update terpisah.

---

## 🛠️ Troubleshooting

### Upload gagal dengan error 413

- Periksa `client_max_body_size` di Nginx

### SSL Certificate error

- Pastikan DNS sudah propagate
- Jalankan ulang `sudo certbot --nginx -d storage.sangkaraprasetya.site`

### Connection refused

- Pastikan storage-api running: `pm2 status`
- Cek logs: `pm2 logs storage-api`

### Permission denied pada folder uploads

```bash
sudo chown -R www-data:www-data /var/www/storage-api/uploads
sudo chmod -R 755 /var/www/storage-api/uploads
```

---

## 📁 Struktur Final di Server

```
/var/www/storage-api/
├── server.js
├── package.json
├── .env
├── node_modules/
└── uploads/
    ├── posts/
    │   ├── 1706612400000_abc123.jpg
    │   └── ...
    └── avatars/
        ├── 1706612500000_def456.jpg
        └── ...
```

---

**Setelah server siap**, beri tahu saya untuk update kode di CIVICA app agar menggunakan server storage baru ini!
