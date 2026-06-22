// controllers/prestamosController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');

// Marca como "vencido" los préstamos activos cuya fecha esperada ya pasó.
async function actualizarVencidos() {
  await pool.query(
    `UPDATE prestamos SET estado = 'vencido'
     WHERE estado = 'activo' AND fecha_devolucion_esperada IS NOT NULL AND fecha_devolucion_esperada < NOW()`
  );
}

// GET /api/prestamos
exports.listar = asyncHandler(async (req, res) => {
  await actualizarVencidos();
  const { activo_id, estado, receptor } = req.query;
  const where = [], params = [];
  if (activo_id) { where.push('p.activo_id = ?'); params.push(activo_id); }
  if (estado) { where.push('p.estado = ?'); params.push(estado); }
  if (receptor) { where.push('p.receptor_nombre LIKE ?'); params.push(`%${receptor}%`); }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT p.*, a.nombre AS activo_nombre, a.codigo_interno
     FROM prestamos p JOIN activos a ON a.id = p.activo_id
     ${whereSQL} ORDER BY p.fecha_entrega DESC`, params
  );
  res.json(rows);
});

// POST /api/prestamos
exports.crear = asyncHandler(async (req, res) => {
  const { activo_id, receptor_nombre, receptor_cargo, fecha_entrega, fecha_devolucion_esperada, observaciones } = req.body;
  if (!activo_id || !receptor_nombre) {
    return res.status(400).json({ error: 'Activo y nombre del receptor son obligatorios.' });
  }
  const [r] = await pool.query(
    `INSERT INTO prestamos (activo_id, receptor_nombre, receptor_cargo, fecha_entrega, fecha_devolucion_esperada, observaciones, registrado_por)
     VALUES (?,?,?,?,?,?,?)`,
    [activo_id, receptor_nombre, receptor_cargo || null, fecha_entrega || new Date(), fecha_devolucion_esperada || null, observaciones || null, req.user.id]
  );
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'prestamo', tabla: 'prestamos', registroId: r.insertId, ip: req.ip });
  const [rows] = await pool.query('SELECT * FROM prestamos WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

// PUT /api/prestamos/:id/devolver
exports.devolver = asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    `UPDATE prestamos SET estado = 'devuelto', fecha_devolucion_real = NOW() WHERE id = ? AND estado <> 'devuelto'`,
    [req.params.id]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Préstamo no encontrado o ya devuelto.' });
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'devolucion', tabla: 'prestamos', registroId: Number(req.params.id), ip: req.ip });
  res.json({ ok: true });
});
