// Storage API Server untuk CIVICA
// Deploy ke: storage.sangkaraprasetya.site
//
// INSTALASI:
// 1. npm init -y
// 2. npm install express multer cors sharp uuid helmet dotenv
// 3. Buat file .env dengan API_KEY
// 4. node server.js atau pm2 start server.js

require("dotenv").config();
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

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Domain untuk generate URL
  DOMAIN: process.env.DOMAIN || "https://storage.sangkaraprasetya.site",

  // API Key untuk autentikasi - WAJIB DIGANTI!
  API_KEY: process.env.API_KEY || "CHANGE_THIS_TO_A_SECURE_RANDOM_STRING",

  // Max file size (10MB)
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  // Max files per request
  MAX_FILES: 10,

  // Image compression quality (1-100)
  JPEG_QUALITY: 80,

  // Max image dimension
  MAX_DIMENSION: 1200,

  // Allowed MIME types
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],

  // Upload directories
  UPLOAD_TYPES: ["posts", "avatars", "reports"],
};

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: "*", // Production: ganti dengan origin spesifik
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  }),
);

app.use(express.json());

// Rate limiting sederhana (untuk production gunakan express-rate-limit)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 menit
const RATE_LIMIT_MAX = 100; // max 100 requests per menit

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip).filter((time) => time > windowStart);

  if (requests.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests" });
  }

  requests.push(now);
  requestCounts.set(ip, requests);
  next();
};

app.use(rateLimiter);

// Authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  if (apiKey !== CONFIG.API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
};

// =============================================================================
// FILE UPLOAD CONFIGURATION
// =============================================================================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (CONFIG.ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed: ${CONFIG.ALLOWED_TYPES.join(", ")}`,
      ),
      false,
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,
    files: CONFIG.MAX_FILES,
  },
  fileFilter,
});

// Upload directory
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Ensure upload directories exist
const ensureDirectories = () => {
  CONFIG.UPLOAD_TYPES.forEach((dir) => {
    const dirPath = path.join(UPLOAD_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  });
};
ensureDirectories();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const generateFilename = () => {
  return `${Date.now()}_${uuidv4().split("-")[0]}.jpg`;
};

const processImage = async (buffer, options = {}) => {
  const {
    maxWidth = CONFIG.MAX_DIMENSION,
    maxHeight = CONFIG.MAX_DIMENSION,
    quality = CONFIG.JPEG_QUALITY,
  } = options;

  return sharp(buffer)
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality })
    .toBuffer();
};

const saveImage = async (buffer, type, filename) => {
  const filepath = path.join(UPLOAD_DIR, type, filename);
  await fs.promises.writeFile(filepath, buffer);
  return `${CONFIG.DOMAIN}/uploads/${type}/${filename}`;
};

// =============================================================================
// ROUTES
// =============================================================================

// Serve static files (gambar)
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "30d",
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cache-Control", "public, max-age=2592000, immutable");
    },
  }),
);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API info
app.get("/", (req, res) => {
  res.json({
    name: "CIVICA Storage API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      upload: "POST /upload/:type",
      uploadMultiple: "POST /upload-multiple/:type",
      delete: "DELETE /delete",
      images: "GET /uploads/:type/:filename",
    },
  });
});

// Upload single image
app.post(
  "/upload/:type",
  authenticate,
  upload.single("image"),
  async (req, res) => {
    try {
      const { type } = req.params;

      if (!CONFIG.UPLOAD_TYPES.includes(type)) {
        return res.status(400).json({
          error: `Invalid type. Allowed: ${CONFIG.UPLOAD_TYPES.join(", ")}`,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const filename = generateFilename();
      const processedBuffer = await processImage(req.file.buffer);
      const url = await saveImage(processedBuffer, type, filename);

      console.log(`Uploaded: ${type}/${filename}`);

      res.json({
        success: true,
        url,
        filename,
        type,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res
        .status(500)
        .json({ error: "Failed to upload image", details: error.message });
    }
  },
);

// Upload multiple images
app.post(
  "/upload-multiple/:type",
  authenticate,
  upload.array("images", CONFIG.MAX_FILES),
  async (req, res) => {
    try {
      const { type } = req.params;

      if (!CONFIG.UPLOAD_TYPES.includes(type)) {
        return res.status(400).json({
          error: `Invalid type. Allowed: ${CONFIG.UPLOAD_TYPES.join(", ")}`,
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const results = [];

      for (const file of req.files) {
        const filename = generateFilename();
        const processedBuffer = await processImage(file.buffer);
        const url = await saveImage(processedBuffer, type, filename);
        results.push({ url, filename });
      }

      console.log(`Uploaded ${results.length} files to ${type}/`);

      res.json({
        success: true,
        count: results.length,
        urls: results.map((r) => r.url),
        files: results,
      });
    } catch (error) {
      console.error("Upload multiple error:", error);
      res
        .status(500)
        .json({ error: "Failed to upload images", details: error.message });
    }
  },
);

// Delete image
app.delete("/delete", authenticate, async (req, res) => {
  try {
    const { filename, type } = req.body;

    if (!filename || !type) {
      return res.status(400).json({ error: "filename and type are required" });
    }

    if (!CONFIG.UPLOAD_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid type. Allowed: ${CONFIG.UPLOAD_TYPES.join(", ")}`,
      });
    }

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(UPLOAD_DIR, type, sanitizedFilename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }

    await fs.promises.unlink(filepath);
    console.log(`Deleted: ${type}/${sanitizedFilename}`);

    res.json({
      success: true,
      message: "File deleted successfully",
      filename: sanitizedFilename,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res
      .status(500)
      .json({ error: "Failed to delete image", details: error.message });
  }
});

// Delete by URL
app.delete("/delete-by-url", authenticate, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    // Extract type and filename from URL
    const urlPattern = /\/uploads\/([^\/]+)\/([^\/]+)$/;
    const match = url.match(urlPattern);

    if (!match) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const [, type, filename] = match;

    if (!CONFIG.UPLOAD_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid type in URL" });
    }

    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(UPLOAD_DIR, type, sanitizedFilename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "File not found" });
    }

    await fs.promises.unlink(filepath);
    console.log(`Deleted by URL: ${type}/${sanitizedFilename}`);

    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete by URL error:", error);
    res
      .status(500)
      .json({ error: "Failed to delete image", details: error.message });
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Handle multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `File too large. Maximum size: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: `Too many files. Maximum: ${CONFIG.MAX_FILES}`,
      });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// General error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`CIVICA Storage API`);
  console.log("=".repeat(50));
  console.log(`Server running on port ${PORT}`);
  console.log(`Domain: ${CONFIG.DOMAIN}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
  console.log(`Allowed types: ${CONFIG.UPLOAD_TYPES.join(", ")}`);
  console.log("=".repeat(50));
});

module.exports = app;
