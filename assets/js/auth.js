// =====================================================================
//  auth.js — Manejo de sesión, roles y expiración
// =====================================================================
const JERARQUIA = { consulta: 1, docente: 2, jefe_taller: 3, administrador: 4 };

const Auth = {
  token() { return localStorage.getItem('token'); },
  user() { try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { return null; } },

  guardar(token, usuario) {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  },

  // Decodifica el payload del JWT (sin verificar firma, solo para leer exp)
  _payload() {
    const t = this.token();
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  },

  expirado() {
    const p = this._payload();
    if (!p || !p.exp) return false;
    return Date.now() >= p.exp * 1000;
  },

  // ¿El usuario actual tiene al menos este rol?
  can(rolMinimo) {
    const u = this.user();
    if (!u) return false;
    return (JERARQUIA[u.rol] || 0) >= (JERARQUIA[rolMinimo] || 99);
  },

  rolLabel(rol) {
    return ({ administrador: 'Administrador', jefe_taller: 'Jefe de taller', docente: 'Docente', consulta: 'Consulta' })[rol] || rol;
  },

  // Protege una página: si no hay sesión válida, redirige al login.
  requireSession() {
    if (!this.token() || this.expirado()) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      location.href = ruta('login.html') + (this.expirado() ? '?expirado=1' : '');
      return false;
    }
    return true;
  },

  // Protege una página por rol mínimo.
  requireRole(rolMinimo) {
    if (!this.requireSession()) return false;
    if (!this.can(rolMinimo)) {
      location.href = ruta('dashboard.html');
      return false;
    }
    return true;
  },

  async logout() {
    try { await Api.post('/auth/logout'); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    location.href = ruta('login.html');
  },

  // Cierra sesión tras X minutos sin actividad del usuario.
  iniciarTemporizadorInactividad() {
    const min = (typeof INACTIVIDAD_MIN !== 'undefined') ? INACTIVIDAD_MIN : 60;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        location.href = ruta('login.html') + '?inactivo=1';
      }, min * 60 * 1000);
    };
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true }));
    reset();
  }
};
