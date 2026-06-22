// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user || !user.activo) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const payload = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });

  await registrarAuditoria({ usuarioId: user.id, accion: 'login', tabla: 'usuarios', registroId: user.id, ip: req.ip });

  res.json({ token, usuario: payload });
});

exports.logout = asyncHandler(async (req, res) => {
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'logout', tabla: 'usuarios', registroId: req.user.id, ip: req.ip });
  // El token es stateless: el frontend simplemente lo descarta.
  res.json({ ok: true });
});

exports.me = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(rows[0]);
});
