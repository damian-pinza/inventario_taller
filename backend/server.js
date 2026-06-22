// server.js — Punto de entrada de la API
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { errorHandler } = require('./middlewares/errorHandler');
const rutas = require('./routes');

const app = express();

// ---- CORS ----
// Permitimos el frontend definido en FRONTEND_URL. Si no está configurado,
// se permite cualquier origen (útil para pruebas locales).
const origenes = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origenes.length === 0 || origenes.includes(origin.replace(/\/$/, ''))) {
      return cb(null, true);
    }
    return cb(null, true); // permisivo: el control real lo da el JWT
  }
}));

// ---- Body parsers ----
// Límite alto porque el logo SVG y la vista previa de importación pueden ser grandes.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// ---- Ruta de salud ----
app.get('/', (req, res) => {
  res.json({
    ok: true,
    servicio: 'API Inventario de Talleres',
    version: '1.0.0',
    hora: new Date().toISOString()
  });
});

// ---- Rutas de la API ----
app.use('/api', rutas);

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

// ---- Manejador de errores (siempre al final) ----
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
  console.log(`   Salud:  http://localhost:${PORT}/`);
  console.log(`   API:    http://localhost:${PORT}/api`);
});

module.exports = app;
