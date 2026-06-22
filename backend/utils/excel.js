// utils/excel.js — Plantilla de importación, parseo y reportes Excel (ExcelJS)
const ExcelJS = require('exceljs');

const COLUMNS = [
  'codigo_interno', 'codigo_patrimonial', 'nombre', 'categoria', 'marca', 'modelo',
  'numero_serie', 'estado', 'cantidad', 'ubicacion', 'responsable',
  'fecha_adquisicion', 'valor_referencial', 'observaciones', 'cuidado_mantenimiento'
];

const ESTADO_LABEL = { operativo: 'Operativo', mantenimiento: 'En Mantenimiento', baja: 'Dado de Baja' };

// ---------- Plantilla de importación con validaciones ----------
async function generarPlantillaExcel({ categorias = [], talleres = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Inventario';
  const ws = wb.addWorksheet('Inventario');

  ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: Math.max(16, c.length + 4) }));

  // Estilo del encabezado
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Fila de ejemplo
  ws.addRow({
    codigo_interno: 'INV-001', codigo_patrimonial: 'PAT-123', nombre: 'Taladro de banco',
    categoria: categorias[0]?.nombre || 'Herramientas', marca: 'Bosch', modelo: 'PBD 40',
    numero_serie: 'SN12345', estado: 'Operativo', cantidad: 1,
    ubicacion: talleres[0]?.nombre || 'Taller Mecánica', responsable: 'Juan Pérez',
    fecha_adquisicion: '2024-01-15', valor_referencial: 350.0,
    observaciones: 'Uso general', cuidado_mantenimiento: 'Lubricar mensualmente'
  });

  // Validaciones (listas desplegables) en las primeras 500 filas de datos
  const estados = Object.values(ESTADO_LABEL);
  const catList = categorias.map((c) => c.nombre);
  const tallerList = talleres.map((t) => t.nombre);

  const colIndex = (key) => COLUMNS.indexOf(key) + 1;
  const setDropdown = (key, values) => {
    if (!values.length) return;
    const letter = ws.getColumn(colIndex(key)).letter;
    for (let r = 2; r <= 502; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`"${values.join(',').slice(0, 250)}"`]
      };
    }
  };
  setDropdown('estado', estados);
  if (catList.join(',').length < 250) setDropdown('categoria', catList);
  if (tallerList.join(',').length < 250) setDropdown('ubicacion', tallerList);

  // Hoja de instrucciones
  const help = wb.addWorksheet('Instrucciones');
  help.columns = [{ width: 90 }];
  [
    'INSTRUCCIONES DE LLENADO',
    '',
    '1. No modifiques los nombres de las columnas de la hoja "Inventario".',
    '2. Campos obligatorios: codigo_interno, nombre, categoria, estado, cantidad, ubicacion, responsable.',
    '3. "estado" debe ser: Operativo, En Mantenimiento o Dado de Baja.',
    '4. "categoria" y "ubicacion" deben coincidir con las existentes en el sistema (usa el desplegable).',
    '5. "fecha_adquisicion" en formato AAAA-MM-DD (ej: 2024-01-15).',
    '6. "valor_referencial" y "cantidad" deben ser números.',
    '7. "codigo_interno" debe ser único; los duplicados se rechazarán.',
    '8. Borra la fila de ejemplo antes de subir el archivo.',
    '9. Las fotografías se cargan después, desde la ficha de cada activo.'
  ].forEach((t, i) => {
    const cell = help.getCell(`A${i + 1}`);
    cell.value = t;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  return wb.xlsx.writeBuffer();
}

// ---------- Parseo del archivo subido ----------
async function parsearImportExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Inventario') || wb.worksheets[0];
  if (!ws) throw new Error('El archivo no contiene ninguna hoja de datos.');

  // Mapear encabezados reales a índices de columna
  const headerRow = ws.getRow(1);
  const headerMap = {};
  headerRow.eachCell((cell, col) => {
    const name = String(cell.value || '').trim().toLowerCase();
    if (COLUMNS.includes(name)) headerMap[name] = col;
  });

  const filas = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const obj = { _fila: rowNumber };
    let vacia = true;
    COLUMNS.forEach((key) => {
      const col = headerMap[key];
      let val = col ? row.getCell(col).value : null;
      if (val && typeof val === 'object' && 'text' in val) val = val.text;     // rich text
      if (val && typeof val === 'object' && 'result' in val) val = val.result; // fórmula
      if (val instanceof Date) val = val.toISOString().slice(0, 10);
      if (val !== null && val !== undefined && String(val).trim() !== '') vacia = false;
      obj[key] = val === null || val === undefined ? '' : String(val).trim();
    });
    if (!vacia) filas.push(obj);
  });
  return filas;
}

// ---------- Reporte Excel con formato ----------
async function generarReporteExcel({ config, activos, titulo = 'Inventario' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = config?.nombre_sistema || 'Sistema de Inventario';

  // Hoja 1: datos
  const ws = wb.addWorksheet('Inventario');
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `${config?.nombre_institucion || ''} — ${titulo}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Generado: ${new Date().toLocaleString('es-EC')}`;
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  const headers = ['Código', 'Nombre', 'Categoría', 'Marca', 'Modelo', 'N° Serie', 'Estado', 'Cantidad', 'Ubicación', 'Responsable', 'Valor', 'Adquisición'];
  const headerRowIdx = 4;
  const hr = ws.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center' };
  });

  activos.forEach((a, i) => {
    const r = ws.getRow(headerRowIdx + 1 + i);
    r.values = [
      a.codigo_interno, a.nombre, a.categoria_nombre, a.marca, a.modelo, a.numero_serie,
      ESTADO_LABEL[a.estado] || a.estado, a.cantidad, a.taller_nombre, a.responsable,
      a.valor_referencial != null ? Number(a.valor_referencial) : null,
      a.fecha_adquisicion ? String(a.fecha_adquisicion).slice(0, 10) : ''
    ];
    if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; });
  });

  ws.columns.forEach((c, i) => { c.width = [12, 28, 16, 14, 14, 14, 16, 9, 18, 18, 12, 13][i] || 14; });
  ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: headers.length } };
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  // Hoja 2: resumen
  const resumen = wb.addWorksheet('Resumen');
  const porEstado = { operativo: 0, mantenimiento: 0, baja: 0 };
  activos.forEach((a) => { porEstado[a.estado] = (porEstado[a.estado] || 0) + 1; });
  resumen.getCell('A1').value = 'Resumen estadístico';
  resumen.getCell('A1').font = { bold: true, size: 14 };
  const rows = [
    ['Total de activos', activos.length],
    ['Operativos', porEstado.operativo],
    ['En mantenimiento', porEstado.mantenimiento],
    ['Dados de baja', porEstado.baja],
    ['Valor total referencial', activos.reduce((s, a) => s + (Number(a.valor_referencial) || 0), 0)]
  ];
  rows.forEach((row, i) => {
    resumen.getCell(`A${i + 3}`).value = row[0];
    resumen.getCell(`B${i + 3}`).value = row[1];
    resumen.getCell(`A${i + 3}`).font = { bold: true };
  });
  resumen.getColumn(1).width = 28;
  resumen.getColumn(2).width = 16;

  return wb.xlsx.writeBuffer();
}

module.exports = { generarPlantillaExcel, parsearImportExcel, generarReporteExcel, COLUMNS, ESTADO_LABEL };
