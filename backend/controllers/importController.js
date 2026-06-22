// controllers/importController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');
const { generarPlantillaExcel, parsearImportExcel } = require('../utils/excel');
const { generarToken } = require('../utils/qr');
const { registrarAuditoria } = require('../utils/audit');

const ESTADO_MAP = {
  'operativo': 'operativo',
  'en mantenimiento': 'mantenimiento',
  'mantenimiento': 'mantenimiento',
  'dado de baja': 'baja',
  'baja': 'baja'
};

async function cargarLookups() {
  const [cats] = await pool.query('SELECT id, nombre FROM categorias');
  const [tals] = await pool.query('SELECT id, nombre FROM talleres');
  const [codes] = await pool.query('SELECT codigo_interno FROM activos');
  const catMap = new Map(cats.map((c) => [c.nombre.trim().toLowerCase(), c.id]));
  const talMap = new Map(tals.map((t) => [t.nombre.trim().toLowerCase(), t.id]));
  const existentes = new Set(codes.map((c) => c.codigo_interno.toLowerCase()));
  return { cats, tals, catMap, talMap, existentes };
}

// Valida una lista de filas crudas. Devuelve filas anotadas + resumen.
async function validar(filas) {
  const { catMap, talMap, existentes } = await cargarLookups();
  const vistos = new Set();
  let validas = 0, errores = 0, advertencias = 0;

  const resultado = filas.map((f) => {
    const errs = [];
    const warns = [];

    if (!f.codigo_interno) errs.push('Falta código interno');
    if (!f.nombre) errs.push('Falta nombre');

    const code = (f.codigo_interno || '').toLowerCase();
    if (code && vistos.has(code)) errs.push('Código duplicado en el archivo');
    if (code && existentes.has(code)) errs.push('El código ya existe en el sistema');
    if (code) vistos.add(code);

    // Estado
    let estado = 'operativo';
    if (f.estado) {
      const m = ESTADO_MAP[f.estado.trim().toLowerCase()];
      if (!m) errs.push(`Estado inválido: "${f.estado}"`);
      else estado = m;
    } else warns.push('Estado vacío → se usará "Operativo"');

    // Categoría
    let categoria_id = null;
    if (f.categoria) {
      categoria_id = catMap.get(f.categoria.trim().toLowerCase()) || null;
      if (!categoria_id) errs.push(`Categoría no existe: "${f.categoria}"`);
    } else warns.push('Sin categoría');

    // Taller / ubicación
    let taller_id = null;
    if (f.ubicacion) {
      taller_id = talMap.get(f.ubicacion.trim().toLowerCase()) || null;
      if (!taller_id) errs.push(`Ubicación/taller no existe: "${f.ubicacion}"`);
    } else warns.push('Sin ubicación');

    // Cantidad
    let cantidad = 1;
    if (f.cantidad) {
      cantidad = parseInt(f.cantidad);
      if (Number.isNaN(cantidad) || cantidad < 0) errs.push('Cantidad no es un número válido');
    }

    // Valor
    let valor = null;
    if (f.valor_referencial) {
      valor = parseFloat(String(f.valor_referencial).replace(',', '.'));
      if (Number.isNaN(valor)) { warns.push('Valor referencial inválido → se ignora'); valor = null; }
    }

    // Fecha
    let fecha = null;
    if (f.fecha_adquisicion) {
      const d = String(f.fecha_adquisicion).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) fecha = d;
      else warns.push('Fecha inválida → se ignora');
    }

    const estadoFila = errs.length ? 'error' : (warns.length ? 'advertencia' : 'valida');
    if (estadoFila === 'error') errores++;
    else if (estadoFila === 'advertencia') advertencias++;
    else validas++;

    return {
      _fila: f._fila,
      _estado: estadoFila,
      _mensaje: [...errs, ...warns].join(' · '),
      datos: {
        codigo_interno: f.codigo_interno || null,
        codigo_patrimonial: f.codigo_patrimonial || null,
        nombre: f.nombre || null,
        categoria_id, marca: f.marca || null, modelo: f.modelo || null,
        numero_serie: f.numero_serie || null, estado, cantidad, taller_id,
        responsable: f.responsable || null, fecha_adquisicion: fecha,
        valor_referencial: valor, observaciones: f.observaciones || null,
        cuidado_mantenimiento: f.cuidado_mantenimiento || null
      }
    };
  });

  return { resumen: { total: filas.length, validas, advertencias, errores }, filas: resultado };
}

// GET /api/importar/plantilla — descarga la plantilla Excel
exports.plantilla = asyncHandler(async (req, res) => {
  const { cats, tals } = await cargarLookups();
  const buffer = await generarPlantillaExcel({ categorias: cats, talleres: tals });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_inventario.xlsx"');
  res.send(Buffer.from(buffer));
});

// POST /api/importar/validar — sube el Excel y devuelve la vista previa (sin insertar)
exports.validarArchivo = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Debes subir un archivo .xlsx' });
  const filas = await parsearImportExcel(req.file.buffer);
  if (filas.length === 0) return res.status(400).json({ error: 'El archivo no contiene filas de datos.' });
  const resultado = await validar(filas);
  res.json(resultado);
});

// POST /api/importar/ejecutar — inserta las filas válidas (recibe { filas: [...] })
exports.ejecutar = asyncHandler(async (req, res) => {
  const filas = req.body.filas;
  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ error: 'No se recibieron filas para importar.' });
  }
  // Solo se insertan las que NO son error.
  const aInsertar = filas.filter((f) => f._estado !== 'error' && f.datos && f.datos.codigo_interno && f.datos.nombre);

  const conn = await pool.getConnection();
  let insertadas = 0;
  const fallidas = [];
  try {
    await conn.beginTransaction();
    for (const f of aInsertar) {
      const d = f.datos;
      try {
        await conn.query(
          `INSERT INTO activos
             (codigo_interno, codigo_patrimonial, nombre, categoria_id, marca, modelo,
              numero_serie, estado, cantidad, taller_id, responsable, fecha_adquisicion,
              valor_referencial, observaciones, cuidado_mantenimiento, qr_token, creado_por, modificado_por)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [d.codigo_interno, d.codigo_patrimonial, d.nombre, d.categoria_id, d.marca, d.modelo,
           d.numero_serie, d.estado, d.cantidad, d.taller_id, d.responsable, d.fecha_adquisicion,
           d.valor_referencial, d.observaciones, d.cuidado_mantenimiento, generarToken(), req.user.id, req.user.id]
        );
        insertadas++;
      } catch (e) {
        fallidas.push({ fila: f._fila, codigo: d.codigo_interno, error: e.code === 'ER_DUP_ENTRY' ? 'Código duplicado' : e.message });
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await registrarAuditoria({ usuarioId: req.user.id, accion: 'importar', tabla: 'activos', detalle: `${insertadas} registros importados`, ip: req.ip });
  res.json({ insertadas, fallidas, total: aInsertar.length });
});
