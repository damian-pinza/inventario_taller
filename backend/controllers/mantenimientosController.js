// controllers/mantenimientosController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');

// GET /api/mantenimientos  (?activo_id=&proximos=true)
exports.listar = asyncHandler(async (req, res) => {
  const { activo_id, proximos } = req.query;
  const where = [], params = [];
  if (activo_id) { where.push('m.activo_id = ?'); params.push(activo_id); }
  if (proximos === 'true') {
    const [cfg] = await pool.query('SELECT dias_alerta_mantenimiento FROM configuracion LIMIT 1');
    const dias = cfg[0]?.dias_alerta_mantenimiento || 15;
    where.push('m.proxima_fecha IS NOT NULL AND m.proxima_fecha <= DATE_ADD(CURDATE(), INTERVAL ? DAY)');
    params.push(dias);
  }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT m.*, a.nombre AS activo_nombre, a.codigo_interno
     FROM mantenimientos m JOIN activos a ON a.id = m.activo_id
     ${whereSQL} ORDER BY m.fecha_inicio DESC`, params
  );
  res.json(rows);
});

// POST /api/mantenimientos
exports.crear = asyncHandler(async (req, res) => {
  const { activo_id, tipo, fecha_inicio, fecha_fin, descripcion, tecnico_responsable, costo, proxima_fecha, estado } = req.body;
  if (!activo_id || !tipo) return res.status(400).json({ error: 'Activo y tipo son obligatorios.' });

  const [r] = await pool.query(
    `INSERT INTO mantenimientos (activo_id, tipo, fecha_inicio, fecha_fin, descripcion, tecnico_responsable, costo, proxima_fecha, estado, registrado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [activo_id, tipo, fecha_inicio || new Date(), fecha_fin || null, descripcion || null, tecnico_responsable || null,
     costo || null, proxima_fecha || null, estado || 'programado', req.user.id]
  );

  // Si el mantenimiento está en proceso, el activo pasa a "En Mantenimiento".
  if ((estado || 'programado') === 'en_proceso') {
    await pool.query('UPDATE activos SET estado = "mantenimiento" WHERE id = ?', [activo_id]);
  }

  await registrarAuditoria({ usuarioId: req.user.id, accion: 'mantenimiento', tabla: 'mantenimientos', registroId: r.insertId, ip: req.ip });
  const [rows] = await pool.query('SELECT * FROM mantenimientos WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

// PUT /api/mantenimientos/:id
exports.actualizar = asyncHandler(async (req, res) => {
  const campos = ['tipo', 'fecha_inicio', 'fecha_fin', 'descripcion', 'tecnico_responsable', 'costo', 'proxima_fecha', 'estado'];
  const set = [], params = [];
  campos.forEach((c) => { if (req.body[c] !== undefined) { set.push(`${c} = ?`); params.push(req.body[c] === '' ? null : req.body[c]); } });
  if (!set.length) return res.status(400).json({ error: 'No hay campos para actualizar.' });

  params.push(req.params.id);
  const [r] = await pool.query(`UPDATE mantenimientos SET ${set.join(', ')} WHERE id = ?`, params);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Mantenimiento no encontrado.' });

  // Al completar, devolver el activo a "Operativo".
  if (req.body.estado === 'completado') {
    const [m] = await pool.query('SELECT activo_id FROM mantenimientos WHERE id = ?', [req.params.id]);
    if (m[0]) await pool.query('UPDATE activos SET estado = "operativo" WHERE id = ? AND estado = "mantenimiento"', [m[0].activo_id]);
  } else if (req.body.estado === 'en_proceso') {
    const [m] = await pool.query('SELECT activo_id FROM mantenimientos WHERE id = ?', [req.params.id]);
    if (m[0]) await pool.query('UPDATE activos SET estado = "mantenimiento" WHERE id = ?', [m[0].activo_id]);
  }

  const [rows] = await pool.query('SELECT * FROM mantenimientos WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});
