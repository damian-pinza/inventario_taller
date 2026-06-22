// routes/index.js — Definición de todas las rutas de la API
const express = require('express');
const multer = require('multer');
const router = express.Router();

const { verifyToken, requireRole } = require('../middlewares/auth');

const auth = require('../controllers/authController');
const config = require('../controllers/configController');
const activos = require('../controllers/activosController');
const fotos = require('../controllers/fotosController');
const importar = require('../controllers/importController');
const reportes = require('../controllers/reportesController');
const prestamos = require('../controllers/prestamosController');
const mantenimientos = require('../controllers/mantenimientosController');
const catalogos = require('../controllers/catalogosController');
const usuarios = require('../controllers/usuariosController');
const dashboard = require('../controllers/dashboardController');

// ---- Multer (subidas en memoria, se reenvían a Cloudinary) ----
const uploadImagenes = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB por imagen
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes.'));
  }
});
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname) ||
      file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel');
    cb(ok ? null : new Error('Solo se permiten archivos Excel (.xlsx)'), ok);
  }
});

// ===================== RUTAS PÚBLICAS =====================
router.post('/auth/login', auth.login);
router.get('/config', config.get);                 // logo y nombres para el login
router.get('/publico/:token', activos.publico);    // ficha pública por QR (sin login)

// ===================== AUTENTICACIÓN =====================
router.post('/auth/logout', verifyToken, auth.logout);
router.get('/auth/me', verifyToken, auth.me);

// ===================== CONFIGURACIÓN (admin) =====================
router.put('/config', verifyToken, requireRole('administrador'), config.update);
router.post('/config/logo', verifyToken, requireRole('administrador'), config.subirLogo);

// ===================== DASHBOARD =====================
router.get('/dashboard/estadisticas', verifyToken, dashboard.estadisticas);

// ===================== ACTIVOS =====================
router.get('/activos', verifyToken, activos.listar);
router.post('/activos', verifyToken, requireRole('jefe_taller'), activos.crear);
router.get('/activos/:id', verifyToken, activos.detalle);
router.put('/activos/:id', verifyToken, requireRole('jefe_taller'), activos.actualizar);
router.delete('/activos/:id', verifyToken, requireRole('jefe_taller'), activos.eliminar);
router.get('/activos/:id/qr', verifyToken, activos.qr);

// ===================== FOTOS =====================
router.post('/activos/:id/fotos', verifyToken, requireRole('jefe_taller'), uploadImagenes.array('fotos', 5), fotos.subir);
router.delete('/fotos/:id', verifyToken, requireRole('jefe_taller'), fotos.eliminar);
router.put('/fotos/:id/principal', verifyToken, requireRole('jefe_taller'), fotos.marcarPrincipal);

// ===================== IMPORTACIÓN MASIVA =====================
router.get('/importar/plantilla', verifyToken, importar.plantilla);
router.post('/importar/validar', verifyToken, requireRole('jefe_taller'), uploadExcel.single('archivo'), importar.validarArchivo);
router.post('/importar/ejecutar', verifyToken, requireRole('jefe_taller'), importar.ejecutar);

// ===================== REPORTES =====================
router.get('/reportes/pdf', verifyToken, reportes.pdf);
router.get('/reportes/excel', verifyToken, reportes.excel);
router.get('/reportes/etiquetas', verifyToken, reportes.etiquetas);
router.get('/reportes/prestamos', verifyToken, reportes.prestamos);

// ===================== PRÉSTAMOS =====================
router.get('/prestamos', verifyToken, prestamos.listar);
router.post('/prestamos', verifyToken, requireRole('docente'), prestamos.crear);
router.put('/prestamos/:id/devolver', verifyToken, requireRole('docente'), prestamos.devolver);

// ===================== MANTENIMIENTOS =====================
router.get('/mantenimientos', verifyToken, mantenimientos.listar);
router.post('/mantenimientos', verifyToken, requireRole('jefe_taller'), mantenimientos.crear);
router.put('/mantenimientos/:id', verifyToken, requireRole('jefe_taller'), mantenimientos.actualizar);

// ===================== CATEGORÍAS =====================
router.get('/categorias', verifyToken, catalogos.listarCategorias);
router.post('/categorias', verifyToken, requireRole('administrador'), catalogos.crearCategoria);
router.put('/categorias/:id', verifyToken, requireRole('administrador'), catalogos.actualizarCategoria);
router.delete('/categorias/:id', verifyToken, requireRole('administrador'), catalogos.eliminarCategoria);

// ===================== TALLERES =====================
router.get('/talleres', verifyToken, catalogos.listarTalleres);
router.post('/talleres', verifyToken, requireRole('administrador'), catalogos.crearTaller);
router.put('/talleres/:id', verifyToken, requireRole('administrador'), catalogos.actualizarTaller);
router.delete('/talleres/:id', verifyToken, requireRole('administrador'), catalogos.eliminarTaller);

// ===================== USUARIOS (admin) =====================
router.get('/usuarios', verifyToken, requireRole('administrador'), usuarios.listar);
router.post('/usuarios', verifyToken, requireRole('administrador'), usuarios.crear);
router.put('/usuarios/:id', verifyToken, requireRole('administrador'), usuarios.actualizar);

module.exports = router;
