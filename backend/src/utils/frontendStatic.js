'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

// Path thuộc backend — không bao giờ trả index.html cho chúng, để request API
// sai đường vẫn nhận 404 JSON thay vì một trang HTML.
const BACKEND_PREFIXES = ['/api/', '/static/', '/api-docs', '/health'];

const isBackendPath = (urlPath) =>
  urlPath === '/api' || BACKEND_PREFIXES.some((prefix) => urlPath.startsWith(prefix));

/**
 * Cho backend phục vụ luôn bản build frontend (image 1 container cho Render):
 * frontend và API chung một origin nên không cần CORS hay rewrite rule, SSE đi
 * thẳng tới Express.
 *
 * - `/assets/*` (Vite đặt tên file theo hash nội dung) cache 1 năm, immutable;
 *   file khác — nhất là index.html — `no-cache` để bản deploy mới có hiệu lực ngay.
 * - GET/HEAD tới route của SPA (không phải path backend, không phải file có
 *   thật) → index.html, để F5 ở `/courts` không ra 404.
 *
 * Trả về null khi không cấu hình — dev và cụm compose (nginx lo frontend) chạy
 * như cũ.
 */
const createFrontendHandlers = (distDir) => {
  if (!distDir) return null;
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`FRONTEND_DIST_DIR="${distDir}" không có index.html — build frontend trước.`);
  }

  const staticFiles = express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      const isHashedAsset = filePath.split(path.sep).includes('assets');
      res.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });

  const spaFallback = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isBackendPath(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  };

  return { staticFiles, spaFallback };
};

module.exports = { createFrontendHandlers, isBackendPath };
