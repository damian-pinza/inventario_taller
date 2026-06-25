// controllers/reportesController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { obtenerConfig } = require('./configController');
const { generarReportePDF, generarEtiquetasPDF, generarActaPDF } = require('../utils/pdf');
const { generarReporteExcel } = require('../utils/excel');

const TITULOS = {
  general: 'Inventario general',
  taller: 'Inventario por taller',
  categoria: 'Inventario por categoría',
  estado: 'Inventario por estado',
  responsable: 'Inventario por responsable',
  mantenimiento: 'Activos en mantenimiento'
};

// Columna que se oculta según el filtro aplicado (ya está implícita en el reporte).
const OCULTAR_POR_TIPO = {
  categoria: ['categoria_nombre'],
  taller: ['taller_nombre'],
  estado: ['estado']
};

function urlInventarioDigital() {
  return (process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

// Construye la consulta de activos según el tipo de reporte.
async function obtenerActivosReporte({ tipo, id, valor }) {
  const where = [];
  const params = [];
  if (tipo === 'taller' && id) { where.push('a.taller_id = ?'); params.push(id); }
  if (tipo === 'categoria' && id) { where.push('a.categoria_id = ?'); params.push(id); }
  if (tipo === 'estado' && valor) { where.push('a.estado = ?'); params.push(valor); }
  if (tipo === 'responsable' && valor) { where.push('a.responsable = ?'); params.push(valor); }
  if (tipo === 'mantenimiento') { where.push('a.estado = ?'); params.push('mantenimiento'); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT a.*, c.nombre AS categoria_nombre, t.nombre AS taller_nombre
     FROM activos a
     LEFT JOIN categorias c ON c.id = a.categoria_id
     LEFT JOIN talleres t ON t.id = a.taller_id
     ${whereSQL}
     ORDER BY a.nombre`, params
  );
  return rows;
}

function tituloCompuesto(tipo, activos, id, valor) {
  let t = TITULOS[tipo] || 'Inventario';
  if (tipo === 'taller' && activos[0]) t += ` — ${activos[0].taller_nombre || ''}`;
  if (tipo === 'categoria' && activos[0]) t += ` — ${activos[0].categoria_nombre || ''}`;
  if (tipo === 'estado' && valor) t += ` — ${valor}`;
  if (tipo === 'responsable' && valor) t += ` — ${valor}`;
  return t;
}

// Nombre del docente responsable de un taller.
async function responsableDeTaller(id) {
  if (!id) return null;
  const [rows] = await pool.query(
    `SELECT t.nombre AS taller, u.nombre AS responsable
     FROM talleres t LEFT JOIN usuarios u ON u.id = t.responsable_id WHERE t.id = ?`, [id]
  );
  return rows[0] || null;
}

// Arma el bloque de firmas según el alcance del reporte.
function construirFirmas({ tipo, config, docenteNombre }) {
  const primera = (tipo === 'taller')
    ? { rol: 'Responsable del área (Docente)', nombre: docenteNombre || '' }
    : { rol: 'Responsable del inventario', nombre: config?.nombre_administrador || '' };
  return [
    primera,
    { rol: 'Coordinador', nombre: config?.coordinador_nombre || '' },
    { rol: 'Rector', nombre: config?.rector_nombre || '' }
  ];
}

// GET /api/reportes/pdf
exports.pdf = asyncHandler(async (req, res) => {
  const { tipo = 'general', formato = 'A4', id, valor } = req.query;
  const config = await obtenerConfig();
  const activos = await obtenerActivosReporte({ tipo, id, valor });
  const titulo = tituloCompuesto(tipo, activos, id, valor);

  let docenteNombre = null;
  if (tipo === 'taller' && id) { const t = await responsableDeTaller(id); docenteNombre = t?.responsable; }

  const buffer = await generarReportePDF({
    config, titulo, generadoPor: req.user.nombre, activos,
    formato: formato.toUpperCase(),
    ocultar: OCULTAR_POR_TIPO[tipo] || [],
    firmas: construirFirmas({ tipo, config, docenteNombre }),
    qrHeaderUrl: urlInventarioDigital()
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${tipo}_${formato}.pdf"`);
  res.send(buffer);
});

// GET /api/reportes/excel  (sin cambios)
exports.excel = asyncHandler(async (req, res) => {
  const { tipo = 'general', id, valor } = req.query;
  const config = await obtenerConfig();
  const activos = await obtenerActivosReporte({ tipo, id, valor });
  const titulo = tituloCompuesto(tipo, activos, id, valor);

  const buffer = await generarReporteExcel({ config, activos, titulo });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${tipo}.xlsx"`);
  res.send(Buffer.from(buffer));
});

// GET /api/reportes/acta?tipo=area|general|herramienta&id=&entrega=&recibe=
exports.acta = asyncHandler(async (req, res) => {
  const tipo = req.query.tipo || 'general';
  const id = req.query.id;
  const config = await obtenerConfig();
  const qrHeaderUrl = urlInventarioDigital();

  let activos = [];
  let alcanceTitulo = 'Entrega del inventario general';
  let entregaDefault = config?.nombre_administrador || '';

  if (tipo === 'area') {
    if (!id) return res.status(400).json({ error: 'Falta el id del taller/área.' });
    activos = await obtenerActivosReporte({ tipo: 'taller', id });
    const t = await responsableDeTaller(id);
    alcanceTitulo = `Entrega del área: ${t?.taller || ''}`;
    entregaDefault = t?.responsable || entregaDefault;
  } else if (tipo === 'herramienta') {
    if (!id) return res.status(400).json({ error: 'Falta el id de la herramienta.' });
    const [rows] = await pool.query(
      `SELECT a.*, c.nombre AS categoria_nombre, t.nombre AS taller_nombre
       FROM activos a LEFT JOIN categorias c ON c.id = a.categoria_id
       LEFT JOIN talleres t ON t.id = a.taller_id WHERE a.id = ?`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Herramienta no encontrada.' });
    activos = rows;
    alcanceTitulo = `Entrega de herramienta: ${rows[0].codigo_interno || ''} — ${rows[0].nombre || ''}`;
    entregaDefault = rows[0].responsable || entregaDefault;
  } else {
    activos = await obtenerActivosReporte({ tipo: 'general' });
    alcanceTitulo = 'Entrega del inventario general';
  }

  const entregaNombre = (req.query.entrega || entregaDefault || '').trim();
  const recibeNombre = (req.query.recibe || '').trim();

  const buffer = await generarActaPDF({
    config, generadoPor: req.user.nombre, alcanceTitulo, activos, entregaNombre, recibeNombre, qrHeaderUrl
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="acta_${tipo}.pdf"`);
  res.send(buffer);
});

// GET /api/reportes/etiquetas?ids=1,2,3&tamanio=mediano
exports.etiquetas = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x)).filter(Boolean);
  const tamanio = req.query.tamanio || 'mediano';
  const config = await obtenerConfig();

  let rows;
  if (ids.length) {
    [rows] = await pool.query(
      `SELECT id, nombre, codigo_interno, qr_token FROM activos WHERE id IN (${ids.map(() => '?').join(',')})`, ids
    );
  } else {
    [rows] = await pool.query('SELECT id, nombre, codigo_interno, qr_token FROM activos ORDER BY id LIMIT 200');
  }
  if (!rows.length) return res.status(400).json({ error: 'No hay activos para generar etiquetas.' });

  const buffer = await generarEtiquetasPDF({ config, activos: rows, tamanio });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="etiquetas_${tamanio}.pdf"`);
  res.send(buffer);
});

// GET /api/reportes/prestamos?formato=excel|pdf — historial de préstamos
exports.prestamos = asyncHandler(async (req, res) => {
  const formato = req.query.formato || 'excel';
  const config = await obtenerConfig();
  const [rows] = await pool.query(
    `SELECT p.*, a.nombre AS activo_nombre, a.codigo_interno
     FROM prestamos p JOIN activos a ON a.id = p.activo_id
     ORDER BY p.fecha_entrega DESC`
  );

  if (formato === 'excel') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Préstamos');
    ws.columns = [
      { header: 'Activo', key: 'activo', width: 28 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Receptor', key: 'receptor', width: 22 },
      { header: 'Cargo', key: 'cargo', width: 18 },
      { header: 'Entrega', key: 'entrega', width: 20 },
      { header: 'Devolución esperada', key: 'esp', width: 20 },
      { header: 'Devolución real', key: 'real', width: 20 },
      { header: 'Estado', key: 'estado', width: 12 }
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((p) => ws.addRow({
      activo: p.activo_nombre, codigo: p.codigo_interno, receptor: p.receptor_nombre,
      cargo: p.receptor_cargo, entrega: p.fecha_entrega, esp: p.fecha_devolucion_esperada,
      real: p.fecha_devolucion_real, estado: p.estado
    }));
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historial_prestamos.xlsx"');
    return res.send(Buffer.from(buffer));
  }

  const activos = rows.map((p) => ({
    codigo_interno: p.codigo_interno, nombre: p.activo_nombre,
    categoria_nombre: p.receptor_nombre, marca: p.receptor_cargo, modelo: '',
    numero_serie: '',
    estado: p.estado === 'devuelto' ? 'operativo' : (p.estado === 'vencido' ? 'baja' : 'mantenimiento'),
    taller_nombre: p.fecha_entrega ? new Date(p.fecha_entrega).toLocaleDateString('es-EC') : '',
    cantidad: '', valor_referencial: null
  }));
  const buffer = await generarReportePDF({
    config, titulo: 'Historial de préstamos', generadoPor: req.user.nombre, activos, formato: 'A4',
    qrHeaderUrl: urlInventarioDigital()
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="historial_prestamos.pdf"');
  res.send(buffer);
});
