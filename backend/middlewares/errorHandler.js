// middlewares/errorHandler.js — Manejo centralizado de errores

// Envuelve controladores async para no repetir try/catch en cada uno.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Middleware final de errores.
function errorHandler(err, req, res, next) {
  console.error('🔥 Error:', err.message);

  // Códigos de error comunes de MySQL traducidos a mensajes claros.
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único (por ejemplo, código interno o email).' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Referencia inválida: la categoría, taller o usuario indicado no existe.' });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor.' });
}

module.exports = { asyncHandler, errorHandler };
