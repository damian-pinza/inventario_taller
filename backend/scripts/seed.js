// scripts/seed.js — Datos iniciales del sistema
// Ejecuta:  npm run seed
// Es idempotente: si el administrador ya existe, no lo duplica.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generarToken } = require('../utils/qr');

async function seed() {
  console.log('🌱 Iniciando carga de datos iniciales...\n');

  // ---------- 1. Configuración global ----------
  const [cfg] = await pool.query('SELECT id FROM configuracion LIMIT 1');
  if (cfg.length === 0) {
    await pool.query(
      `INSERT INTO configuracion (nombre_institucion, nombre_administrador, nombre_sistema, color_primario, dias_alerta_mantenimiento)
       VALUES (?,?,?,?,?)`,
      ['Mi Institución Educativa', process.env.ADMIN_NOMBRE || 'Administrador',
       'Inventario de Talleres', '#1f6feb', 15]
    );
    console.log('✅ Configuración global creada.');
  } else {
    console.log('• Configuración ya existente, se omite.');
  }

  // ---------- 2. Usuario administrador ----------
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@taller.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin1234';
  const adminNombre = process.env.ADMIN_NOMBRE || 'Administrador';

  const [adm] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [adminEmail]);
  let adminId;
  if (adm.length === 0) {
    const hash = await bcrypt.hash(adminPass, 10);
    const [r] = await pool.query(
      'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?,?,?,?)',
      [adminNombre, adminEmail, hash, 'administrador']
    );
    adminId = r.insertId;
    console.log(`✅ Administrador creado:  ${adminEmail}  /  ${adminPass}`);
  } else {
    adminId = adm[0].id;
    console.log(`• Administrador ya existe: ${adminEmail}`);
  }

  // ---------- 3. Categorías de ejemplo ----------
  const categorias = [
    ['Herramientas manuales', 'Llaves, martillos, destornilladores, etc.'],
    ['Herramientas eléctricas', 'Taladros, amoladoras, sierras eléctricas.'],
    ['Equipos de medición', 'Calibradores, multímetros, balanzas.'],
    ['Maquinaria', 'Tornos, fresadoras, compresores.'],
    ['Equipos de cómputo', 'Computadoras, proyectores, impresoras.'],
    ['Mobiliario', 'Mesas de trabajo, estanterías, bancos.'],
    ['Seguridad', 'EPP, extintores, botiquines.']
  ];
  const [catExist] = await pool.query('SELECT COUNT(*) AS n FROM categorias');
  if (catExist[0].n === 0) {
    for (const [nombre, desc] of categorias) {
      await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?,?)', [nombre, desc]);
    }
    console.log(`✅ ${categorias.length} categorías de ejemplo creadas.`);
  } else {
    console.log('• Ya existen categorías, se omiten.');
  }

  // ---------- 4. Talleres de ejemplo ----------
  const talleres = [
    ['Taller de Mecánica Industrial', 'Área de tornos y fresadoras.'],
    ['Taller de Electricidad', 'Instalaciones y mediciones eléctricas.'],
    ['Taller de Carpintería', 'Trabajo en madera y ebanistería.'],
    ['Laboratorio de Informática', 'Equipos de cómputo y redes.']
  ];
  const [talExist] = await pool.query('SELECT COUNT(*) AS n FROM talleres');
  if (talExist[0].n === 0) {
    for (const [nombre, desc] of talleres) {
      await pool.query('INSERT INTO talleres (nombre, descripcion, responsable_id) VALUES (?,?,?)',
        [nombre, desc, adminId]);
    }
    console.log(`✅ ${talleres.length} talleres de ejemplo creados.`);
  } else {
    console.log('• Ya existen talleres, se omiten.');
  }

  // ---------- 5. Activos de demostración ----------
  const [actExist] = await pool.query('SELECT COUNT(*) AS n FROM activos');
  if (actExist[0].n === 0) {
    const [cats] = await pool.query('SELECT id, nombre FROM categorias');
    const [tals] = await pool.query('SELECT id, nombre FROM talleres');
    const cat = (n) => (cats.find((c) => c.nombre === n) || cats[0]).id;
    const tal = (n) => (tals.find((t) => t.nombre === n) || tals[0]).id;

    const demo = [
      ['HM-001', 'Juego de llaves combinadas', cat('Herramientas manuales'), 'Stanley', 'STMT74180', 'operativo', 3, tal('Taller de Mecánica Industrial'), 45.50],
      ['HE-001', 'Taladro percutor 1/2"', cat('Herramientas eléctricas'), 'Bosch', 'GSB 550', 'operativo', 2, tal('Taller de Mecánica Industrial'), 120.00],
      ['HE-002', 'Amoladora angular 4½"', cat('Herramientas eléctricas'), 'DeWalt', 'DWE4120', 'mantenimiento', 1, tal('Taller de Mecánica Industrial'), 95.00],
      ['EM-001', 'Calibrador digital 150mm', cat('Equipos de medición'), 'Mitutoyo', '500-196-30', 'operativo', 4, tal('Taller de Mecánica Industrial'), 85.00],
      ['MQ-001', 'Torno paralelo', cat('Maquinaria'), 'Sumore', 'SP2102', 'operativo', 1, tal('Taller de Mecánica Industrial'), 4200.00],
      ['EC-001', 'Computadora de escritorio', cat('Equipos de cómputo'), 'HP', 'ProDesk 400', 'operativo', 10, tal('Laboratorio de Informática'), 650.00],
      ['EC-002', 'Proyector multimedia', cat('Equipos de cómputo'), 'Epson', 'PowerLite E20', 'operativo', 2, tal('Laboratorio de Informática'), 480.00],
      ['SG-001', 'Extintor PQS 10 lb', cat('Seguridad'), 'Buckeye', 'ABC-10', 'operativo', 6, tal('Taller de Electricidad'), 35.00]
    ];
    for (const d of demo) {
      await pool.query(
        `INSERT INTO activos
          (codigo_interno, nombre, categoria_id, marca, modelo, estado, cantidad, taller_id, valor_referencial, qr_token, creado_por, modificado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], generarToken(), adminId, adminId]
      );
    }
    console.log(`✅ ${demo.length} activos de demostración creados.`);
  } else {
    console.log('• Ya existen activos, se omiten.');
  }

  console.log('\n🎉 Datos iniciales cargados correctamente.');
  console.log('───────────────────────────────────────────');
  console.log(`   Ingresa con:  ${adminEmail}  /  ${adminPass}`);
  console.log('───────────────────────────────────────────');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en el seed:', err.message);
    process.exit(1);
  });
