// controllers/fotosController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { subirImagen, borrarImagen } = require('../utils/cloudinary');
const { registrarAuditoria } = require('../utils/audit');

const MAX_FOTOS = 5;

// Recalcula la foto principal del activo (la de menor orden marcada principal, o la primera).
async function sincronizarPrincipal(activoId) {
  const [fotos] = await pool.query('SELECT * FROM fotos_activo WHERE activo_id = ? ORDER BY orden, id', [activoId]);
  if (fotos.length === 0) {
    await pool.query('UPDATE activos SET foto_principal_url = NULL WHERE id = ?', [activoId]);
    return;
  }
  let principal = fotos.find((f) => f.es_principal) || fotos[0];
  await pool.query('UPDATE fotos_activo SET es_principal = (id = ?) WHERE activo_id = ?', [principal.id, activoId]);
  await pool.query('UPDATE activos SET foto_principal_url = ? WHERE id = ?', [principal.url, activoId]);
}

// POST /api/activos/:id/fotos — sube 1..5 imágenes (campo "fotos")
exports.subir = asyncHandler(async (req, res) => {
  const activoId = req.params.id;
  const [act] = await pool.query('SELECT id FROM activos WHERE id = ?', [activoId]);
  if (!act[0]) return res.status(404).json({ error: 'Activo no encontrado.' });

  const archivos = req.files || [];
  if (archivos.length === 0) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

  const [actuales] = await pool.query('SELECT COUNT(*) AS n FROM fotos_activo WHERE activo_id = ?', [activoId]);
  if (actuales[0].n + archivos.length > MAX_FOTOS) {
    return res.status(400).json({ error: `Máximo ${MAX_FOTOS} fotos por activo. Ya tiene ${actuales[0].n}.` });
  }

  const subidas = [];
  for (const file of archivos) {
    const { url, public_id } = await subirImagen(file.buffer, `inventario/activo_${activoId}`);
    const [r] = await pool.query(
      'INSERT INTO fotos_activo (activo_id, url, public_id, orden) VALUES (?,?,?,?)',
      [activoId, url, public_id, actuales[0].n + subidas.length]
    );
    subidas.push({ id: r.insertId, url, public_id });
  }

  await sincronizarPrincipal(activoId);
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'subir_fotos', tabla: 'fotos_activo', registroId: Number(activoId), detalle: `${subidas.length} fotos`, ip: req.ip });

  const [fotos] = await pool.query('SELECT * FROM fotos_activo WHERE activo_id = ? ORDER BY orden, id', [activoId]);
  res.status(201).json({ fotos });
});

// DELETE /api/fotos/:id — elimina una foto
exports.eliminar = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM fotos_activo WHERE id = ?', [req.params.id]);
  const foto = rows[0];
  if (!foto) return res.status(404).json({ error: 'Foto no encontrada.' });

  await borrarImagen(foto.public_id);
  await pool.query('DELETE FROM fotos_activo WHERE id = ?', [req.params.id]);
  await sincronizarPrincipal(foto.activo_id);
  res.json({ ok: true });
});

// PUT /api/fotos/:id/principal — marca como principal
exports.marcarPrincipal = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM fotos_activo WHERE id = ?', [req.params.id]);
  const foto = rows[0];
  if (!foto) return res.status(404).json({ error: 'Foto no encontrada.' });

  await pool.query('UPDATE fotos_activo SET es_principal = (id = ?) WHERE activo_id = ?', [foto.id, foto.activo_id]);
  await pool.query('UPDATE activos SET foto_principal_url = ? WHERE id = ?', [foto.url, foto.activo_id]);
  res.json({ ok: true });
});
