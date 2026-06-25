// utils/qr.js — Generación de códigos QR
const QRCode = require('qrcode');
const crypto = require('crypto');

// Token público permanente (va en la URL del QR, no cambia nunca).
function generarToken() {
  return crypto.randomBytes(12).toString('hex'); // 24 caracteres
}

// URL pública a la que apunta el QR (ficha pública del activo, sin login).
function urlPublica(token) {
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  return `${base}/pages/publico.html?token=${token}`;
}

// Devuelve el QR como Data URL (PNG base64) para mostrar en HTML.
async function qrDataURL(token) {
  return QRCode.toDataURL(urlPublica(token), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 400
  });
}

// Devuelve el QR como Buffer PNG (para incrustar en PDF de etiquetas).
async function qrBuffer(token, width = 300) {
  return QRCode.toBuffer(urlPublica(token), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width
  });
}

// QR de una URL arbitraria (p. ej. el inventario digital en el encabezado del PDF).
async function qrBufferURL(url, width = 300) {
  return QRCode.toBuffer(String(url || ''), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width
  });
}

module.exports = { generarToken, urlPublica, qrDataURL, qrBuffer, qrBufferURL };
