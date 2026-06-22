// utils/audit.js — Registro de acciones en la tabla de auditoría
const pool = require('../config/db');

// Registra una acción. Nunca lanza error (no debe romper la operación principal).
async function registrarAuditoria({ usuarioId, accion, tabla, registroId, detalle, ip }) {
  try {
    await pool.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, detalle, ip_address)
       VALUES (?,?,?,?,?,?)`,
      [usuarioId || null, accion, tabla || null, registroId || null, detalle || null, ip || null]
    );
  } catch (e) {
    console.warn('No se pudo registrar auditoría:', e.message);
  }
}

module.exports = { registrarAuditoria };
