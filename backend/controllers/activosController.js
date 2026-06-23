// controllers/activosController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../utils/audit');
const { generarToken, qrDataURL, urlPublica } = require('../utils/qr');

const ESTADOS = ['operativo', 'mantenimiento', 'baja'];

// Campos editables del activo
const CAMPOS = [
  'codigo_interno', 'codigo_patrimonial', 'nombre', 'categoria_id', 'marca', 'modelo',
  'numero_serie', 'estado', 'cantidad', 'taller_id', 'responsable', 'fecha_adquisicion',
  'valor_referencial', 'observaciones', 'cuidado_mantenimiento', 'foto_principal_url'
];

function limpiarActivo(body) {
  const out = {};
  for (const k of CAMPOS) {
    if (body[k] !== undefined) out[k] = body[k] === '' ? null : body[k];
  }
  return out;
}

// GET /api/activos — listado con búsqueda, filtros y paginación
exports.listar = asyncHandler(async (req, res) => {
  const {
    q, taller_id, categoria_id, estado, responsable,
    fecha_desde, fecha_hasta, valor_min, valor_max,
    sort = 'creado_en', dir = 'desc'
  } = req.query;

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  if (q) {
    where.push('(a.codigo_interno LIKE ? OR a.nombre LIKE ? OR a.marca LIKE ? OR a.numero_serie LIKE ? OR a.codigo_patrimonial LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (taller_id) { where.push('a.taller_id = ?'); params.push(taller_id); }
  if (categoria_id) { where.push('a.categoria_id = ?'); params.push(categoria_id); }
  if (estado && ESTADOS.includes(estado)) { where.push('a.estado = ?'); params.push(estado); }
  if (responsable) { where.push('a.responsable LIKE ?'); params.push(`%${responsable}%`); }
  if (fecha_desde) { where.push('a.fecha_adquisicion >= ?'); params.push(fecha_desde); }
  if (fecha_hasta) { where.push('a.fecha_adquisicion <= ?'); params.push(fecha_hasta); }
  if (valor_min) { where.push('a.valor_referencial >= ?'); params.push(valor_min); }
  if (valor_max) { where.push('a.valor_referencial <= ?'); params.push(valor_max); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Ordenamiento seguro (whitelist)
  const sortCols = { creado_en: 'a.creado_en', nombre: 'a.nombre', codigo_interno: 'a.codigo_interno', estado: 'a.estado', valor_referencial: 'a.valor_referencial' };
  const orderBy = sortCols[sort] || 'a.creado_en';
  const orderDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const baseSQL = `
    FROM activos a
    LEFT JOIN categorias c ON c.id = a.categoria_id
    LEFT JOIN talleres t ON t.id = a.taller_id
    ${whereSQL}`;

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseSQL}`, params);
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT a.*, c.nombre AS categoria_nombre, t.nombre AS taller_nombre
     ${baseSQL}
     ORDER BY ${orderBy} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    data: rows,
    paginacion: { page, limit, total, totalPaginas: Math.ceil(total / limit) }
  });
});

// GET /api/activos/:id — detalle (con fotos)
exports.detalle = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, c.nombre AS categoria_nombre, t.nombre AS taller_nombre
     FROM activos a
     LEFT JOIN categorias c ON c.id = a.categoria_id
     LEFT JOIN talleres t ON t.id = a.taller_id
     WHERE a.id = ?`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Activo no encontrado.' });

  const [fotos] = await pool.query('SELECT * FROM fotos_activo WHERE activo_id = ? ORDER BY orden, id', [req.params.id]);
  const activo = rows[0];
  activo.fotos = fotos;
  activo.url_publica = urlPublica(activo.qr_token);
  activo.qr_data_url = activo.qr_token ? await qrDataURL(activo.qr_token) : null;
  res.json(activo);
});

// POST /api/activos — crear
exports.crear = asyncHandler(async (req, res) => {
  // --- Modo LOTE: el body trae un array "unidades" con datos individuales por equipo ---
  if (Array.isArray(req.body.unidades) && req.body.unidades.length > 0) {
    const unidades = req.body.unidades;

    // Datos comunes (excluye los individuales)
    const comunes = limpiarActivo(req.body);
    delete comunes.codigo_interno;
    delete comunes.numero_serie;
    delete comunes.estado;
    delete comunes.cantidad;

    if (!comunes.nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }

    // Validación previa de cada unidad
    const codigosVistos = new Set();
    for (let i = 0; i < unidades.length; i++) {
      const u = unidades[i];
      if (!u || !u.codigo_interno || String(u.codigo_interno).trim() === '') {
        return res.status(400).json({ error: `Falta el código interno de la unidad ${i + 1}.` });
      }
      const cod = String(u.codigo_interno).trim().toLowerCase();
      if (codigosVistos.has(cod)) {
        return res.status(400).json({ error: `Código interno duplicado en el formulario: "${u.codigo_interno}".` });
      }
      codigosVistos.add(cod);
      if (u.estado && !ESTADOS.includes(u.estado)) {
        return res.status(400).json({ error: `Estado inválido en la unidad ${i + 1}.` });
      }
    }

    const conn = await pool.getConnection();
    const creados = [];
    try {
      await conn.beginTransaction();
      for (const u of unidades) {
        const datos = {
          ...comunes,
          codigo_interno: String(u.codigo_interno).trim(),
          numero_serie: u.numero_serie ? String(u.numero_serie).trim() : null,
          estado: u.estado || 'operativo',
          cantidad: 1
        };
        const qr_token = generarToken();
        const cols = [...Object.keys(datos), 'qr_token', 'creado_por', 'modificado_por'];
        const vals = [...Object.values(datos), qr_token, req.user.id, req.user.id];
        const placeholders = cols.map(() => '?').join(',');
        const [r] = await conn.query(`INSERT INTO activos (${cols.join(',')}) VALUES (${placeholders})`, vals);
        creados.push({ id: r.insertId, codigo_interno: datos.codigo_interno, qr_token });
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Uno de los códigos internos ya existe en el sistema. No se creó ningún registro.' });
      }
      throw e;
    } finally {
      conn.release();
    }

    await registrarAuditoria({
      usuarioId: req.user.id, accion: 'crear_lote', tabla: 'activos',
      detalle: `${creados.length} unidades: ${creados.map(c => c.codigo_interno).join(', ')}`, ip: req.ip
    });

    // Recuperar el primer activo completo para devolverlo (compatibilidad con flujo existente)
    const [rows] = await pool.query('SELECT * FROM activos WHERE id = ?', [creados[0].id]);
    const primero = rows[0];
    primero.qr_data_url = await qrDataURL(creados[0].qr_token);

    return res.status(201).json({
      modo: 'lote',
      creadas: creados.length,
      ids: creados.map(c => c.id),
      codigos: creados.map(c => c.codigo_interno),
      primero
    });
  }

  // --- Modo CLÁSICO: un solo activo (comportamiento original) ---
  const datos = limpiarActivo(req.body);
  if (!datos.codigo_interno || !datos.nombre) {
    return res.status(400).json({ error: 'Código interno y nombre son obligatorios.' });
  }
  if (datos.estado && !ESTADOS.includes(datos.estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  datos.estado = datos.estado || 'operativo';
  datos.cantidad = datos.cantidad || 1;
  const qr_token = generarToken();

  const cols = [...Object.keys(datos), 'qr_token', 'creado_por', 'modificado_por'];
  const vals = [...Object.values(datos), qr_token, req.user.id, req.user.id];
  const placeholders = cols.map(() => '?').join(',');

  const [r] = await pool.query(`INSERT INTO activos (${cols.join(',')}) VALUES (${placeholders})`, vals);

  await registrarAuditoria({ usuarioId: req.user.id, accion: 'crear', tabla: 'activos', registroId: r.insertId, detalle: datos.codigo_interno, ip: req.ip });

  const [rows] = await pool.query('SELECT * FROM activos WHERE id = ?', [r.insertId]);
  const activo = rows[0];
  activo.qr_data_url = await qrDataURL(qr_token);
  res.status(201).json(activo);
});

// PUT /api/activos/:id — editar
exports.actualizar = asyncHandler(async (req, res) => {
  const datos = limpiarActivo(req.body);
  if (datos.estado && !ESTADOS.includes(datos.estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  if (Object.keys(datos).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  datos.modificado_por = req.user.id;
  const setSQL = Object.keys(datos).map((k) => `${k} = ?`).join(', ');
  const [r] = await pool.query(`UPDATE activos SET ${setSQL} WHERE id = ?`, [...Object.values(datos), req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Activo no encontrado.' });

  await registrarAuditoria({ usuarioId: req.user.id, accion: 'editar', tabla: 'activos', registroId: Number(req.params.id), ip: req.ip });
  const [rows] = await pool.query('SELECT * FROM activos WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

// DELETE /api/activos/:id — eliminar (?baja=true marca como dado de baja sin borrar)
exports.eliminar = asyncHandler(async (req, res) => {
  if (req.query.baja === 'true') {
    const [r] = await pool.query('UPDATE activos SET estado = "baja", modificado_por = ? WHERE id = ?', [req.user.id, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Activo no encontrado.' });
    await registrarAuditoria({ usuarioId: req.user.id, accion: 'baja', tabla: 'activos', registroId: Number(req.params.id), ip: req.ip });
    return res.json({ ok: true, accion: 'dado_de_baja' });
  }
  const [r] = await pool.query('DELETE FROM activos WHERE id = ?', [req.params.id]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Activo no encontrado.' });
  await registrarAuditoria({ usuarioId: req.user.id, accion: 'eliminar', tabla: 'activos', registroId: Number(req.params.id), ip: req.ip });
  res.json({ ok: true, accion: 'eliminado' });
});

// GET /api/publico/:token — ficha pública (SIN autenticación, solo datos no sensibles)
exports.publico = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.nombre, a.categoria_id, a.marca, a.modelo, a.estado, a.cuidado_mantenimiento,
            a.foto_principal_url, a.codigo_interno,
            c.nombre AS categoria_nombre, t.nombre AS taller_nombre
     FROM activos a
     LEFT JOIN categorias c ON c.id = a.categoria_id
     LEFT JOIN talleres t ON t.id = a.taller_id
     WHERE a.qr_token = ?`, [req.params.token]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Activo no encontrado.' });
  // No se devuelve valor, responsable, ni datos internos.
  res.json(rows[0]);
});

// GET /api/activos/:id/qr — devuelve el QR como Data URL
exports.qr = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT qr_token FROM activos WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Activo no encontrado.' });
  let token = rows[0].qr_token;
  if (!token) {
    token = generarToken();
    await pool.query('UPDATE activos SET qr_token = ? WHERE id = ?', [token, req.params.id]);
  }
  res.json({ token, url_publica: urlPublica(token), qr_data_url: await qrDataURL(token) });
});
