// controllers/configController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');

// Devuelve (y crea si no existe) la fila única de configuración.
async function obtenerConfig() {
  const [rows] = await pool.query('SELECT * FROM configuracion ORDER BY id LIMIT 1');
  if (rows[0]) return rows[0];
  const [r] = await pool.query(
    `INSERT INTO configuracion (nombre_institucion, nombre_administrador, nombre_sistema)
     VALUES (?,?,?)`,
    ['Mi Institución', 'Administrador', 'Inventario de Talleres']
  );
  const [nuevo] = await pool.query('SELECT * FROM configuracion WHERE id = ?', [r.insertId]);
  return nuevo[0];
}

// GET /api/config  (público: el frontend necesita el logo y nombres en el login)
exports.get = asyncHandler(async (req, res) => {
  const config = await obtenerConfig();
  res.json(config);
});

// PUT /api/config  (solo administrador)
exports.update = asyncHandler(async (req, res) => {
  const config = await obtenerConfig();
  const { nombre_institucion, nombre_administrador, nombre_sistema, color_primario, dias_alerta_mantenimiento, logo_svg } = req.body;

  await pool.query(
    `UPDATE configuracion SET
       nombre_institucion = COALESCE(?, nombre_institucion),
       nombre_administrador = COALESCE(?, nombre_administrador),
       nombre_sistema = COALESCE(?, nombre_sistema),
       color_primario = COALESCE(?, color_primario),
       dias_alerta_mantenimiento = COALESCE(?, dias_alerta_mantenimiento),
       logo_svg = COALESCE(?, logo_svg)
     WHERE id = ?`,
    [nombre_institucion, nombre_administrador, nombre_sistema, color_primario, dias_alerta_mantenimiento, logo_svg, config.id]
  );

  await registrarAuditoria({ usuarioId: req.user.id, accion: 'actualizar', tabla: 'configuracion', registroId: config.id, ip: req.ip });
  const [rows] = await pool.query('SELECT * FROM configuracion WHERE id = ?', [config.id]);
  res.json(rows[0]);
});

// POST /api/config/logo  { svg: "<svg ...>...</svg>" }  (solo administrador)
exports.subirLogo = asyncHandler(async (req, res) => {
  const svg = req.body.svg;
  if (!svg || !String(svg).trim().toLowerCase().includes('<svg')) {
    return res.status(400).json({ error: 'Debes enviar el contenido de un archivo SVG válido.' });
  }
  const config = await obtenerConfig();
  await pool.query('UPDATE configuracion SET logo_svg = ? WHERE id = ?', [svg, config.id]);
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'logo', tabla: 'configuracion', registroId: config.id, ip: req.ip });
  res.json({ ok: true });
});

module.exports.obtenerConfig = obtenerConfig;
