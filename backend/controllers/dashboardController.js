// controllers/dashboardController.js
const pool = require('../config/db');
const { asyncHandler } = require('../middlewares/errorHandler');

// GET /api/dashboard/estadisticas
exports.estadisticas = asyncHandler(async (req, res) => {
  const [[totales]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(estado = 'operativo') AS operativos,
       SUM(estado = 'mantenimiento') AS mantenimiento,
       SUM(estado = 'baja') AS baja
     FROM activos`
  );

  const [porTaller] = await pool.query(
    `SELECT COALESCE(t.nombre, 'Sin asignar') AS nombre, COUNT(*) AS total
     FROM activos a LEFT JOIN talleres t ON t.id = a.taller_id
     GROUP BY a.taller_id ORDER BY total DESC LIMIT 12`
  );

  const [porCategoria] = await pool.query(
    `SELECT COALESCE(c.nombre, 'Sin categoría') AS nombre, COUNT(*) AS total
     FROM activos a LEFT JOIN categorias c ON c.id = a.categoria_id
     GROUP BY a.categoria_id ORDER BY total DESC LIMIT 12`
  );

  const [ultimos] = await pool.query(
    `SELECT a.id, a.codigo_interno, a.nombre, a.estado, a.modificado_en,
            c.nombre AS categoria_nombre, t.nombre AS taller_nombre
     FROM activos a
     LEFT JOIN categorias c ON c.id = a.categoria_id
     LEFT JOIN talleres t ON t.id = a.taller_id
     ORDER BY a.modificado_en DESC LIMIT 10`
  );

  const [[prestamosVencidos]] = await pool.query(
    `SELECT COUNT(*) AS n FROM prestamos WHERE estado = 'vencido'
        OR (estado = 'activo' AND fecha_devolucion_esperada IS NOT NULL AND fecha_devolucion_esperada < NOW())`
  );

  const [[mantProximos]] = await pool.query(
    `SELECT COUNT(*) AS n FROM mantenimientos m
     WHERE m.proxima_fecha IS NOT NULL
       AND m.proxima_fecha <= DATE_ADD(CURDATE(), INTERVAL
         COALESCE((SELECT dias_alerta_mantenimiento FROM configuracion LIMIT 1), 15) DAY)
       AND m.estado <> 'completado'`
  );

  res.json({
    totales: {
      total: Number(totales.total) || 0,
      operativos: Number(totales.operativos) || 0,
      mantenimiento: Number(totales.mantenimiento) || 0,
      baja: Number(totales.baja) || 0
    },
    porTaller,
    porCategoria,
    ultimos,
    alertas: {
      prestamos_vencidos: Number(prestamosVencidos.n) || 0,
      mantenimientos_proximos: Number(mantProximos.n) || 0
    }
  });
});
