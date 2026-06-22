// middlewares/auth.js — Verificación de JWT y control de roles
const jwt = require('jsonwebtoken');

// Jerarquía de permisos (mayor número = más permisos)
const JERARQUIA = {
  consulta: 1,
  docente: 2,
  jefe_taller: 3,
  administrador: 4
};

// Verifica que exista un token válido y lo adjunta como req.user
function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Falta el token de sesión.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, nombre, email, rol }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
  }
}

// Exige un rol mínimo. Uso: requireRole('jefe_taller')
function requireRole(rolMinimo) {
  return (req, res, next) => {
    const nivelUsuario = JERARQUIA[req.user?.rol] || 0;
    const nivelRequerido = JERARQUIA[rolMinimo] || 99;
    if (nivelUsuario < nivelRequerido) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole, JERARQUIA };
