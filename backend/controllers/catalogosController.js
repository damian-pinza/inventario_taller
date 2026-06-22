// controllers/catalogosController.js — Categorías y Talleres
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');

// ---------- Categorías ----------
exports.listarCategorias = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
});

exports.crearCategoria = asyncHandler(async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const [r] = await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?,?)', [nombre, descripcion || null]);
  const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

exports.actualizarCategoria = asyncHandler(async (req, res) => {
  const { nombre, descripcion } = req.body;
  const [r] = await pool.query('UPDATE categorias SET nombre = COALESCE(?,nombre), descripcion = ? WHERE id = ?',
    [nombre, descripcion ?? null, req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Categoría no encontrada.' });
  res.json({ ok: true });
});

exports.eliminarCategoria = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Talleres ----------
exports.listarTalleres = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, u.nombre AS responsable_nombre
     FROM talleres t LEFT JOIN usuarios u ON u.id = t.responsable_id
     ORDER BY t.nombre`
  );
  res.json(rows);
});

exports.crearTaller = asyncHandler(async (req, res) => {
  const { nombre, descripcion, responsable_id } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const [r] = await pool.query('INSERT INTO talleres (nombre, descripcion, responsable_id) VALUES (?,?,?)',
    [nombre, descripcion || null, responsable_id || null]);
  const [rows] = await pool.query('SELECT * FROM talleres WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

exports.actualizarTaller = asyncHandler(async (req, res) => {
  const { nombre, descripcion, responsable_id } = req.body;
  const [r] = await pool.query('UPDATE talleres SET nombre = COALESCE(?,nombre), descripcion = ?, responsable_id = ? WHERE id = ?',
    [nombre, descripcion ?? null, responsable_id || null, req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Taller no encontrado.' });
  res.json({ ok: true });
});

exports.eliminarTaller = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM talleres WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});
