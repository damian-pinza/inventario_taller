// utils/pdf.js — Generación de reportes PDF (A4 y A3) con PDFKit
const PDFDocument = require('pdfkit');
let SVGtoPDF = null;
try { SVGtoPDF = require('svg-to-pdfkit'); } catch (_) { /* opcional */ }

const { qrBuffer } = require('./qr');

const ESTADO_LABEL = { operativo: 'Operativo', mantenimiento: 'En Mantenimiento', baja: 'Dado de Baja' };
const ESTADO_COLOR = { operativo: '#16a34a', mantenimiento: '#f59e0b', baja: '#dc2626' };

function money(v) {
  if (v === null || v === undefined || v === '') return '-';
  return Number(v).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Descarga una imagen remota a Buffer con timeout (para A3). Devuelve null si falla.
async function fetchImagen(url, ms = 4000) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } catch (_) {
    return null;
  }
}

// Dibuja el encabezado institucional en la página actual.
function dibujarEncabezado(doc, { config, titulo, generadoPor }) {
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;

  // Logo SVG (si existe y la librería está disponible)
  let textX = left;
  if (config?.logo_svg && SVGtoPDF) {
    try {
      SVGtoPDF(doc, config.logo_svg, left, top, { width: 70, height: 70, assumePt: true });
      textX = left + 84;
    } catch (_) { /* si el SVG falla, seguimos solo con texto */ }
  }

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15)
    .text(config?.nombre_institucion || 'Institución', textX, top, { width: right - textX });
  doc.font('Helvetica').fontSize(11).fillColor('#374151')
    .text(titulo, textX, doc.y + 2, { width: right - textX });

  const fecha = new Date().toLocaleString('es-EC');
  doc.fontSize(8).fillColor('#6b7280')
    .text(`Generado: ${fecha}    ·    Por: ${generadoPor || '-'}`, textX, doc.y + 2, { width: right - textX });

  const lineY = Math.max(doc.y, top + 74) + 6;
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(1).strokeColor('#d1d5db').stroke();
  doc.y = lineY + 10;
  return { left, right, contentW };
}

// Dibuja el pie (número de página + sistema) en TODAS las páginas (buffered).
function dibujarPiePaginas(doc, config) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom + 8;
    doc.fontSize(8).fillColor('#9ca3af');
    doc.text(`Documento generado por ${config?.nombre_sistema || 'Sistema de Inventario'}`, left, y, { width: 300, lineBreak: false });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, right - 120, y, { width: 120, align: 'right', lineBreak: false });
  }
}

// Bloque de firmas al final del documento.
function dibujarFirmas(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const w = (right - left - 40) / 2;

  if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
  let y = doc.page.height - doc.page.margins.bottom - 70;

  const firma = (x, rol) => {
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.8).strokeColor('#111111').stroke();
    doc.fontSize(9).fillColor('#374151')
      .text('Nombre: ____________________________', x, y + 6, { width: w })
      .text('Cargo: _____________________________', x, y + 20, { width: w })
      .font('Helvetica-Bold').text(rol, x, y + 36, { width: w }).font('Helvetica');
  };
  firma(left, 'Responsable del inventario');
  firma(left + w + 40, 'Jefe / Director');
}

// ---------- Reporte A4: tabla de datos (rápido, escalable) ----------
function reporteA4(doc, activos, header) {
  const { left, right } = header;
  // Columnas: clave -> {label, w}
  const cols = [
    { key: 'codigo_interno', label: 'Código', w: 58 },
    { key: 'nombre',         label: 'Nombre', w: 120 },
    { key: 'categoria_nombre', label: 'Categoría', w: 70 },
    { key: 'marca',          label: 'Marca/Modelo', w: 80 },
    { key: 'estado',         label: 'Estado', w: 70 },
    { key: 'taller_nombre',  label: 'Ubicación', w: 75 },
    { key: 'cantidad',       label: 'Cant.', w: 32, align: 'right' },
    { key: 'valor_referencial', label: 'Valor', w: 55, align: 'right' }
  ];
  const rowH = 20;

  const drawHeaderRow = () => {
    let x = left;
    doc.rect(left, doc.y, right - left, rowH).fill('#1f2937');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c) => {
      doc.text(c.label, x + 3, doc.y + 6, { width: c.w - 6, align: c.align || 'left', lineBreak: false });
      x += c.w;
    });
    doc.y += rowH;
    doc.font('Helvetica').fillColor('#111111');
  };

  drawHeaderRow();
  activos.forEach((a, idx) => {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeaderRow();
    }
    if (idx % 2 === 0) doc.rect(left, doc.y, right - left, rowH).fill('#f3f4f6');
    let x = left;
    cols.forEach((c) => {
      let val = a[c.key];
      if (c.key === 'estado') val = ESTADO_LABEL[val] || val;
      if (c.key === 'marca') val = [a.marca, a.modelo].filter(Boolean).join(' / ') || '-';
      if (c.key === 'valor_referencial') val = money(val);
      doc.fillColor(c.key === 'estado' ? (ESTADO_COLOR[a.estado] || '#111') : '#111111')
        .fontSize(8)
        .text(val ?? '-', x + 3, doc.y + 6, { width: c.w - 6, align: c.align || 'left', lineBreak: false });
      x += c.w;
    });
    doc.y += rowH;
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor('#374151').text(`Total de activos: ${activos.length}`, left, doc.y);
}

// ---------- Reporte A3: tarjetas visuales grandes (cartelería) ----------
async function reporteA3(doc, activos, header, fotos) {
  const { left, right } = header;
  const colW = (right - left - 20) / 2; // 2 columnas
  const cardH = 200;
  let col = 0;
  let rowTop = doc.y;

  for (let i = 0; i < activos.length; i++) {
    const a = activos[i];
    if (rowTop + cardH > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      rowTop = doc.y;
      col = 0;
    }
    const x = left + col * (colW + 20);
    const y = rowTop;

    // Marco
    doc.roundedRect(x, y, colW, cardH, 6).lineWidth(1).strokeColor('#d1d5db').stroke();

    // Foto (o placeholder)
    const imgBuf = fotos[a.id];
    const imgBox = { x: x + 12, y: y + 12, w: 150, h: 150 };
    if (imgBuf) {
      try { doc.image(imgBuf, imgBox.x, imgBox.y, { fit: [imgBox.w, imgBox.h], align: 'center', valign: 'center' }); }
      catch (_) { /* ignore */ }
    } else {
      doc.rect(imgBox.x, imgBox.y, imgBox.w, imgBox.h).fill('#f3f4f6');
      doc.fillColor('#9ca3af').fontSize(9).text('Sin foto', imgBox.x, imgBox.y + 70, { width: imgBox.w, align: 'center' });
    }

    // Datos
    const tx = imgBox.x + imgBox.w + 14;
    const tw = x + colW - tx - 12;
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(13).text(a.nombre || '-', tx, y + 14, { width: tw });
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text(`Código: ${a.codigo_interno || '-'}`, tx, doc.y + 2, { width: tw })
      .text(`Categoría: ${a.categoria_nombre || '-'}`, tx, doc.y + 1, { width: tw })
      .text(`Marca/Modelo: ${[a.marca, a.modelo].filter(Boolean).join(' / ') || '-'}`, tx, doc.y + 1, { width: tw })
      .text(`Ubicación: ${a.taller_nombre || '-'}`, tx, doc.y + 1, { width: tw });

    // Badge de estado
    const by = doc.y + 6;
    doc.roundedRect(tx, by, 110, 18, 9).fill(ESTADO_COLOR[a.estado] || '#6b7280');
    doc.fillColor('#fff').fontSize(9).text(ESTADO_LABEL[a.estado] || a.estado, tx, by + 5, { width: 110, align: 'center' });

    // QR grande
    if (a.qr_token) {
      const buf = await qrBuffer(a.qr_token, 220);
      doc.image(buf, x + colW - 92, y + cardH - 92, { width: 80, height: 80 });
    }

    col++;
    if (col === 2) { col = 0; rowTop = y + cardH + 16; }
  }
  doc.y = rowTop + (col === 1 ? cardH + 16 : 0);
}

/**
 * Genera un PDF y devuelve un Buffer.
 * @param {Object} opts
 * @param {Object} opts.config     fila de configuracion (nombre_institucion, logo_svg, nombre_sistema)
 * @param {string} opts.titulo     título del reporte
 * @param {string} opts.generadoPor nombre del usuario
 * @param {Array}  opts.activos    activos con categoria_nombre y taller_nombre
 * @param {string} opts.formato    'A4' | 'A3'
 */
async function generarReportePDF({ config, titulo, generadoPor, activos, formato = 'A4' }) {
  const doc = new PDFDocument({
    size: formato === 'A3' ? 'A3' : 'A4',
    layout: formato === 'A3' ? 'landscape' : 'portrait',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const header = dibujarEncabezado(doc, { config, titulo, generadoPor });

  if (formato === 'A3') {
    // Precargar fotos principales (en paralelo) para las tarjetas.
    const fotos = {};
    await Promise.all(activos.map(async (a) => { fotos[a.id] = await fetchImagen(a.foto_principal_url); }));
    await reporteA3(doc, activos, header, fotos);
  } else {
    reporteA4(doc, activos, header);
  }

  dibujarFirmas(doc);
  dibujarPiePaginas(doc, config);

  doc.end();
  return done;
}

/**
 * Genera un PDF de etiquetas QR para impresión.
 * @param {Array} activos
 * @param {string} tamanio 'pequeno' | 'mediano' | 'grande'
 */
async function generarEtiquetasPDF({ config, activos, tamanio = 'mediano' }) {
  const dims = { pequeno: 142, mediano: 227, grande: 283 }; // 5/8/10 cm en pt aprox
  const side = dims[tamanio] || dims.mediano;

  const doc = new PDFDocument({ size: 'A4', margins: { top: 28, bottom: 28, left: 28, right: 28 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = Math.max(1, Math.floor(usableW / (side + 10)));
  let col = 0, rowTop = doc.page.margins.top;

  for (const a of activos) {
    if (rowTop + side > doc.page.height - doc.page.margins.bottom) {
      doc.addPage(); rowTop = doc.page.margins.top; col = 0;
    }
    const x = left + col * (side + 10);
    const y = rowTop;
    doc.roundedRect(x, y, side, side, 6).lineWidth(1).strokeColor('#111').stroke();

    doc.fillColor('#111').font('Helvetica-Bold').fontSize(side > 200 ? 11 : 9)
      .text(config?.nombre_institucion || '', x + 6, y + 6, { width: side - 12, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(side > 200 ? 10 : 8)
      .text(a.nombre || '', x + 6, y + 22, { width: side - 12, align: 'center', height: 26, ellipsis: true });

    const qrSize = side - 80;
    const buf = await qrBuffer(a.qr_token, 300);
    doc.image(buf, x + (side - qrSize) / 2, y + 44, { width: qrSize, height: qrSize });

    doc.fontSize(side > 200 ? 10 : 8).fillColor('#374151')
      .text(`Cód: ${a.codigo_interno || '-'}`, x + 6, y + side - 20, { width: side - 12, align: 'center', lineBreak: false });

    col++;
    if (col >= cols) { col = 0; rowTop = y + side + 10; }
  }

  doc.end();
  return done;
}

module.exports = { generarReportePDF, generarEtiquetasPDF };
