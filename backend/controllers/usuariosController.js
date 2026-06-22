// controllers/usuariosController.js
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');

const ROLES = ['administrador', 'jefe_taller', 'docente', 'consulta'];

// GET /api/usuarios
exports.listar = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY nombre');
  res.json(rows);
});

// POST /api/usuarios
exports.crear = asyncHandler(async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (rol && !ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?,?,?,?)',
    [nombre, email, hash, rol || 'consulta']
  );
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'crear_usuario', tabla: 'usuarios', registroId: r.insertId, ip: req.ip });
  res.status(201).json({ id: r.insertId, nombre, email, rol: rol || 'consulta' });
});

// PUT /api/usuarios/:id
exports.actualizar = asyncHandler(async (req, res) => {
  const { nombre, email, rol, activo, password } = req.body;
  if (rol && !ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });

  const set = [], params = [];
  if (nombre !== undefined) { set.push('nombre = ?'); params.push(nombre); }
  if (email !== undefined) { set.push('email = ?'); params.push(email); }
  if (rol !== undefined) { set.push('rol = ?'); params.push(rol); }
  if (activo !== undefined) { set.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    set.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10));
  }
  if (!set.length) return res.status(400).json({ error: 'No hay campos para actualizar.' });

  params.push(req.params.id);
  const [r] = await pool.query(`UPDATE usuarios SET ${set.join(', ')} WHERE id = ?`, params);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'editar_usuario', tabla: 'usuarios', registroId: Number(req.params.id), ip: req.ip });
  res.json({ ok: true });
});
