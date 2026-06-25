// utils/pdf.js — Generación de reportes PDF (A4 / A3) y actas con PDFKit
const PDFDocument = require('pdfkit');
let SVGtoPDF = null;
try { SVGtoPDF = require('svg-to-pdfkit'); } catch (_) { /* opcional */ }

const { qrBuffer, qrBufferURL } = require('./qr');

const CM = 28.3465; // 1 cm en puntos PDF
const ESTADO_LABEL = { operativo: 'Operativo', mantenimiento: 'En Mantenimiento', baja: 'Dado de Baja' };
const ESTADO_COLOR = { operativo: '#16a34a', mantenimiento: '#b45309', baja: '#dc2626' };

function txt(v) { return (v === null || v === undefined || v === '') ? '-' : String(v); }

// Descarga una imagen remota a Buffer con timeout. Devuelve null si falla.
async function fetchImagen(url, ms = 5000) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch (_) { return null; }
}

// ---------- Encabezado institucional (se dibuja en cada página) ----------
function dibujarEncabezado(doc, ctx) {
  const { config, titulo, generadoPor, qrHeaderBuf } = ctx;
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  const logoH = 2.5 * CM;        // logo de 2,5 cm de alto
  const qrSize = 2 * CM;         // QR de acceso al inventario digital (~2 cm)
  let rightLimit = right;

  // QR del inventario digital (solo en el encabezado)
  if (qrHeaderBuf) {
    try {
      doc.image(qrHeaderBuf, right - qrSize, top, { width: qrSize, height: qrSize });
      doc.font('Helvetica').fontSize(6).fillColor('#6b7280')
        .text('Inventario digital', right - qrSize - 8, top + qrSize + 1, { width: qrSize + 16, align: 'center', lineBreak: false });
      rightLimit = right - qrSize - 14;
    } catch (_) { /* sin QR */ }
  }

  // Logo SVG (2,5 cm)
  let textX = left;
  if (config?.logo_svg && SVGtoPDF) {
    try {
      SVGtoPDF(doc, config.logo_svg, left, top, { width: logoH, height: logoH, assumePt: true });
      textX = left + logoH + 12;
    } catch (_) { /* solo texto */ }
  }

  // Datos institucionales
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(14)
    .text(config?.nombre_institucion || 'Institución', textX, top, { width: rightLimit - textX });
  doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
  if (config?.direccion) doc.text(config.direccion, textX, doc.y + 1, { width: rightLimit - textX });
  const ct = [config?.ciudad, config?.telefono ? 'Tel: ' + config.telefono : null].filter(Boolean).join('  ·  ');
  if (ct) doc.text(ct, textX, doc.y + 1, { width: rightLimit - textX });

  // Título del reporte
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937')
    .text(titulo, textX, doc.y + 4, { width: rightLimit - textX });
  const fecha = new Date().toLocaleString('es-EC');
  doc.font('Helvetica').fontSize(7.5).fillColor('#6b7280')
    .text(`Generado: ${fecha}   ·   Por: ${generadoPor || '-'}`, textX, doc.y + 1, { width: rightLimit - textX });

  const lineY = Math.max(doc.y, top + logoH, top + qrSize + 8) + 6;
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(1).strokeColor('#cbd5e1').stroke();
  doc.y = lineY + 9;
}

// ---------- Pie con numeración (todas las páginas, buffered) ----------
function dibujarPiePaginas(doc, config) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Anular temporalmente el margen inferior: escribir en esa franja
    // dispararía un salto de página automático en PDFKit.
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - 26;
    doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af');
    doc.text(config?.nombre_sistema || 'Sistema de Inventario', left, y, { width: 320, lineBreak: false });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, right - 140, y, { width: 140, align: 'right', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

// ---------- Bloque de firmas (flujo; una fila de N firmas) ----------
function dibujarFirmas(doc, firmas) {
  if (!firmas || !firmas.length) return;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const n = firmas.length;
  const gap = 26;
  const w = (right - left - gap * (n - 1)) / n;

  if (doc.y + 72 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const y = doc.y + 34; // espacio para la firma manuscrita
  firmas.forEach((f, i) => {
    const x = left + i * (w + gap);
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.8).strokeColor('#111111').stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
      .text(f.nombre || ' ', x, y + 5, { width: w, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#374151')
      .text(f.rol, x, y + 18, { width: w, align: 'center', lineBreak: false });
  });
  doc.y = y + 36;
}

// ---------- Columnas A4 (con ocultamiento contextual) ----------
function colsA4(contentW, ocultar) {
  let base = [
    { key: 'codigo_interno',  label: 'Código',    w: 52 },
    { key: 'nombre',          label: 'Nombre',    w: 84 },
    { key: 'categoria_nombre',label: 'Categoría', w: 54 },
    { key: 'marca',           label: 'Marca',     w: 46 },
    { key: 'modelo',          label: 'Modelo',    w: 48 },
    { key: 'numero_serie',    label: 'N° Serie',  w: 54 },
    { key: 'estado',          label: 'Estado',    w: 72 },
    { key: 'cantidad',        label: 'Cant.',     w: 30, align: 'center' },
    { key: 'taller_nombre',   label: 'Ubicación', w: 75 }
  ];
  base = base.filter((c) => !ocultar.includes(c.key));
  const sum = base.reduce((s, c) => s + c.w, 0);
  const diff = contentW - sum;
  const nombre = base.find((c) => c.key === 'nombre');
  if (nombre) nombre.w += diff;            // el sobrante va a la columna Nombre
  return base;
}

// ---------- Reporte A4: tabla en lista ----------
function reporteA4(doc, activos, ctx) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;
  const cols = colsA4(contentW, ctx.ocultar);
  const rowH = 18;

  const drawHead = () => {
    const hy = doc.y;
    let x = left;
    doc.rect(left, hy, contentW, rowH).fill('#1f2937');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c) => { doc.text(c.label, x + 4, hy + 5, { width: c.w - 8, align: c.align || 'left', lineBreak: false }); x += c.w; });
    doc.y = hy + rowH;
    doc.font('Helvetica').fillColor('#111111');
  };

  const nuevaPagina = () => { doc.addPage(); dibujarEncabezado(doc, ctx); drawHead(); };

  dibujarEncabezado(doc, ctx);
  drawHead();

  if (!activos.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No hay activos para este reporte.', left, doc.y + 8);
    doc.y += 30;
    return;
  }

  activos.forEach((a, idx) => {
    // Valores y altura dinámica de la fila (acomoda celdas de 2 líneas sin solapar)
    const valores = cols.map((c) => c.key === 'estado' ? (ESTADO_LABEL[a[c.key]] || a[c.key]) : a[c.key]);
    doc.font('Helvetica').fontSize(8);
    let cellH = 0;
    cols.forEach((c, ci) => { const h = doc.heightOfString(txt(valores[ci]), { width: c.w - 8 }); if (h > cellH) cellH = h; });
    const rh = Math.max(rowH, cellH + 7);

    if (doc.y + rh > doc.page.height - doc.page.margins.bottom - 8) nuevaPagina();
    const ry = doc.y;
    if (idx % 2 === 0) doc.rect(left, ry, contentW, rh).fill('#f1f5f9');
    let x = left;
    cols.forEach((c, ci) => {
      const color = c.key === 'estado' ? (ESTADO_COLOR[a.estado] || '#111111') : '#111111';
      doc.fillColor(color).font(c.key === 'estado' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .text(txt(valores[ci]), x + 4, ry + 4, { width: c.w - 8, align: c.align || 'left', height: rh - 6 });
      x += c.w;
    });
    doc.font('Helvetica');
    doc.y = ry + rh;
  });

  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text(`Total de activos: ${activos.length}`, left, doc.y);
  doc.font('Helvetica');
}

// ---------- Reporte A3: tarjetas (3 columnas × 4 filas) ----------
async function reporteA3(doc, activos, ctx, fotos) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const COLS = 3, ROWS = 4;
  const gapX = 14, gapY = 12;
  const cardW = (right - left - gapX * (COLS - 1)) / COLS;

  const camposBase = [
    { key: 'codigo_interno',  label: 'Código' },
    { key: 'categoria_nombre',label: 'Categoría' },
    { key: 'marca',           label: 'Marca' },
    { key: 'modelo',          label: 'Modelo' },
    { key: 'numero_serie',    label: 'N° Serie' },
    { key: 'estado',          label: 'Estado' },
    { key: 'cantidad',        label: 'Cantidad' },
    { key: 'taller_nombre',   label: 'Ubicación' }
  ].filter((c) => !ctx.ocultar.includes(c.key));

  let topY = 0, idxInPage = 0;
  const iniciarPagina = (primera) => {
    if (!primera) doc.addPage();
    dibujarEncabezado(doc, ctx);
    topY = doc.y;
    idxInPage = 0;
  };

  iniciarPagina(true);
  // Altura de tarjeta calculada para que entren ROWS filas en el espacio restante
  const dispH = (doc.page.height - doc.page.margins.bottom - topY);
  const cardH = (dispH - gapY * (ROWS - 1)) / ROWS;

  for (let i = 0; i < activos.length; i++) {
    if (idxInPage >= COLS * ROWS) iniciarPagina(false);
    const a = activos[i];
    const r = Math.floor(idxInPage / COLS);
    const c = idxInPage % COLS;
    const x = left + c * (cardW + gapX);
    const y = topY + r * (cardH + gapY);

    // Marco
    doc.roundedRect(x, y, cardW, cardH, 5).lineWidth(0.8).strokeColor('#cbd5e1').stroke();

    const pad = 8;
    // Título (nombre)
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10.5)
      .text(txt(a.nombre), x + pad, y + pad, { width: cardW - pad * 2, height: 26, ellipsis: true, lineBreak: true });

    const contentTop = y + pad + 24;
    const side = Math.min(4 * CM, cardH - (contentTop - y) - pad); // foto/QR de 4 cm (o lo que quepa)

    // Foto (izquierda)
    const imgBuf = fotos[a.id];
    if (imgBuf) {
      try { doc.image(imgBuf, x + pad, contentTop, { fit: [side, side], align: 'center', valign: 'center' }); }
      catch (_) { doc.rect(x + pad, contentTop, side, side).fill('#f1f5f9'); }
    } else {
      doc.rect(x + pad, contentTop, side, side).fill('#f1f5f9');
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(8).text('Sin foto', x + pad, contentTop + side / 2 - 5, { width: side, align: 'center' });
    }

    // QR (derecha) — 4 cm
    if (a.qr_token) {
      try {
        const qb = await qrBuffer(a.qr_token, 300);
        doc.image(qb, x + cardW - pad - side, contentTop, { width: side, height: side });
      } catch (_) { /* sin QR */ }
    }

    // Datos (columna central, entre foto y QR)
    const midX = x + pad + side + 8;
    const midW = (x + cardW - pad - side) - midX - 6;
    let ty = contentTop;
    doc.font('Helvetica').fontSize(7.4);
    camposBase.forEach((f) => {
      let v = a[f.key];
      if (f.key === 'estado') v = ESTADO_LABEL[v] || v;
      doc.font('Helvetica-Bold').fillColor('#475569').text(f.label + ': ', midX, ty, { width: midW, continued: true, lineBreak: false });
      doc.font('Helvetica').fillColor(f.key === 'estado' ? (ESTADO_COLOR[a.estado] || '#111') : '#111111')
        .text(txt(v), { width: midW, lineBreak: false, ellipsis: true });
      ty += 11.5;
    });

    idxInPage++;
  }

  // Posicionar el cursor debajo de la última fila usada
  const filasUsadas = Math.ceil((idxInPage || 1) / COLS);
  doc.y = topY + filasUsadas * (cardH + gapY);
  if (doc.y > doc.page.height - doc.page.margins.bottom) doc.y = doc.page.height - doc.page.margins.bottom - 4;
}

/**
 * Genera un reporte PDF (A4 tabla / A3 tarjetas) y devuelve un Buffer.
 */
async function generarReportePDF({ config, titulo, generadoPor, activos, formato = 'A4', ocultar = [], firmas, qrHeaderUrl }) {
  const esA3 = String(formato).toUpperCase() === 'A3';
  const m = esA3 ? 30 : 40;
  const doc = new PDFDocument({
    size: esA3 ? 'A3' : 'A4',
    layout: esA3 ? 'landscape' : 'portrait',
    margins: { top: m, bottom: m, left: m, right: m },
    bufferPages: true
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  let qrHeaderBuf = null;
  if (qrHeaderUrl) { try { qrHeaderBuf = await qrBufferURL(qrHeaderUrl, 240); } catch (_) {} }

  const ctx = { config, titulo, generadoPor, qrHeaderBuf, ocultar };

  if (esA3) {
    const fotos = {};
    await Promise.all(activos.map(async (a) => { fotos[a.id] = await fetchImagen(a.foto_principal_url); }));
    await reporteA3(doc, activos, ctx, fotos);
  } else {
    reporteA4(doc, activos, ctx);
  }

  const firmasFinal = (firmas && firmas.length) ? firmas : [
    { rol: 'Responsable del inventario', nombre: config?.nombre_administrador || '' },
    { rol: 'Coordinador', nombre: config?.coordinador_nombre || '' },
    { rol: 'Rector', nombre: config?.rector_nombre || '' }
  ];
  dibujarFirmas(doc, firmasFinal);
  dibujarPiePaginas(doc, config);

  doc.end();
  return done;
}

/**
 * Genera un ACTA DE ENTREGA-RECEPCIÓN y devuelve un Buffer (A4 vertical).
 * @param {Object} opts
 * @param {string} opts.alcanceTitulo  texto descriptivo del alcance (área / general / herramienta)
 * @param {Array}  opts.activos        ítems a entregar
 * @param {string} opts.entregaNombre  quién entrega
 * @param {string} opts.recibeNombre   quién recibe
 */
async function generarActaPDF({ config, generadoPor, alcanceTitulo, activos, entregaNombre, recibeNombre, qrHeaderUrl }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 45, bottom: 45, left: 50, right: 50 }, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  let qrHeaderBuf = null;
  if (qrHeaderUrl) { try { qrHeaderBuf = await qrBufferURL(qrHeaderUrl, 240); } catch (_) {} }

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;

  dibujarEncabezado(doc, { config, titulo: 'ACTA DE ENTREGA-RECEPCIÓN DE HERRAMIENTAS Y EQUIPOS', generadoPor, qrHeaderBuf });

  // Subtítulo (alcance)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(alcanceTitulo, left, doc.y + 2, { width: contentW });
  doc.moveDown(0.6);

  // Párrafo introductorio
  const fechaTxt = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
  const lugar = [config?.ciudad].filter(Boolean).join('') || '____________';
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937').text(
    `En ${lugar}, a ${fechaTxt}, se realiza la entrega-recepción de los bienes (herramientas y equipos) que se detallan a continuación, ` +
    `los cuales quedan bajo responsabilidad de quien los recibe, comprometiéndose a su buen uso, cuidado y conservación.`,
    left, doc.y, { width: contentW, align: 'justify' }
  );
  doc.moveDown(0.8);

  // Partes
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
    .text('Entrega: ', left, doc.y, { continued: true }).font('Helvetica').text(entregaNombre || '__________________________');
  doc.font('Helvetica-Bold').text('Recibe: ', left, doc.y + 2, { continued: true }).font('Helvetica').text(recibeNombre || '__________________________');
  doc.moveDown(0.8);

  // Tabla de ítems
  const cols = [
    { key: 'codigo_interno', label: 'Código', w: 60 },
    { key: 'nombre', label: 'Nombre', w: 0 }, // se ajusta al sobrante
    { key: 'marca_modelo', label: 'Marca / Modelo', w: 110 },
    { key: 'numero_serie', label: 'N° Serie', w: 70 },
    { key: 'estado', label: 'Estado', w: 70 },
    { key: 'cantidad', label: 'Cant.', w: 35, align: 'center' }
  ];
  const fija = cols.reduce((s, c) => s + c.w, 0);
  cols.find((c) => c.key === 'nombre').w = contentW - fija;
  const rowH = 18;

  const head = () => {
    const hy = doc.y;
    let x = left;
    doc.rect(left, hy, contentW, rowH).fill('#1f2937');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c) => { doc.text(c.label, x + 4, hy + 5, { width: c.w - 8, align: c.align || 'left', lineBreak: false }); x += c.w; });
    doc.y = hy + rowH;
    doc.font('Helvetica').fillColor('#111');
  };
  const nuevaPagina = () => { doc.addPage(); dibujarEncabezado(doc, { config, titulo: 'ACTA DE ENTREGA-RECEPCIÓN (continuación)', generadoPor, qrHeaderBuf }); head(); };

  head();
  activos.forEach((a, idx) => {
    const valores = cols.map((c) => {
      if (c.key === 'marca_modelo') return [a.marca, a.modelo].filter(Boolean).join(' / ');
      if (c.key === 'estado') return ESTADO_LABEL[a.estado] || a.estado;
      return a[c.key];
    });
    doc.font('Helvetica').fontSize(8);
    let cellH = 0;
    cols.forEach((c, ci) => { const h = doc.heightOfString(txt(valores[ci]), { width: c.w - 8 }); if (h > cellH) cellH = h; });
    const rh = Math.max(rowH, cellH + 7);

    if (doc.y + rh > doc.page.height - doc.page.margins.bottom - 8) nuevaPagina();
    const ry = doc.y;
    if (idx % 2 === 0) doc.rect(left, ry, contentW, rh).fill('#f1f5f9');
    let x = left;
    cols.forEach((c, ci) => {
      doc.fillColor(c.key === 'estado' ? (ESTADO_COLOR[a.estado] || '#111') : '#111')
        .font('Helvetica').fontSize(8)
        .text(txt(valores[ci]), x + 4, ry + 4, { width: c.w - 8, align: c.align || 'left', height: rh - 6 });
      x += c.w;
    });
    doc.y = ry + rh;
  });

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text(`Total de ítems entregados: ${activos.length}`, left, doc.y);
  doc.moveDown(1);

  // Cláusula de cierre
  doc.font('Helvetica').fontSize(9.5).fillColor('#1f2937').text(
    'Para constancia de lo actuado y en señal de conformidad, firman las partes y los testigos que a continuación se detallan.',
    left, doc.y, { width: contentW, align: 'justify' }
  );
  doc.moveDown(0.5);

  // Firmas: fila 1 (Entrega / Recibe), fila 2 (Coordinador / Rector)
  dibujarFirmas(doc, [
    { rol: 'Entregado por', nombre: entregaNombre || '' },
    { rol: 'Recibido por', nombre: recibeNombre || '' }
  ]);
  dibujarFirmas(doc, [
    { rol: 'Coordinador', nombre: config?.coordinador_nombre || '' },
    { rol: 'Rector', nombre: config?.rector_nombre || '' }
  ]);

  dibujarPiePaginas(doc, config);
  doc.end();
  return done;
}

// ---------- Etiquetas QR (sin cambios de diseño) ----------
async function generarEtiquetasPDF({ config, activos, tamanio = 'mediano' }) {
  const dims = { pequeno: 142, mediano: 227, grande: 283 };
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
    if (rowTop + side > doc.page.height - doc.page.margins.bottom) { doc.addPage(); rowTop = doc.page.margins.top; col = 0; }
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

module.exports = { generarReportePDF, generarEtiquetasPDF, generarActaPDF };
