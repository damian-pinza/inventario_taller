// =====================================================================
//  app.js — Estructura común (barra lateral + barra superior)
//  Uso en cada página:  Shell.init({ active: 'inventario', title: 'Inventario' })
// =====================================================================
const NAV = [
  { id: 'dashboard', label: 'Panel', icon: 'dashboard', page: 'dashboard.html', rol: 'consulta' },
  { id: 'inventario', label: 'Inventario', icon: 'box', page: 'inventario.html', rol: 'consulta' },
  { id: 'prestamos', label: 'Préstamos', icon: 'handshake', page: 'prestamos.html', rol: 'consulta' },
  { id: 'mantenimiento', label: 'Mantenimiento', icon: 'wrench', page: 'mantenimiento.html', rol: 'consulta' },
  { id: 'reportes', label: 'Reportes', icon: 'report', page: 'reportes.html', rol: 'consulta' },
  { id: 'etiquetas', label: 'Etiquetas QR', icon: 'qr', page: 'etiquetas.html', rol: 'consulta' },
  { id: 'configuracion', label: 'Configuración', icon: 'gear', page: 'configuracion.html', rol: 'administrador' }
];

const Shell = {
  config: null,

  async init({ active, title }) {
    if (!Auth.requireSession()) return;
    Auth.iniciarTemporizadorInactividad();
    this._render(active, title);
    // Carga la configuración (logo, nombres, color) en segundo plano.
    try {
      this.config = await Api.get('/config');
      this._aplicarConfig();
    } catch (e) { /* el panel sigue funcionando aunque falle */ }
  },

  _render(active, title) {
    const u = Auth.user() || {};
    const iniciales = (u.nombre || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

    const navHTML = NAV.filter((n) => Auth.can(n.rol)).map((n) => `
      <a href="${n.page}" class="${n.id === active ? 'active' : ''}">${ICON[n.icon]}<span>${n.label}</span></a>
    `).join('');

    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
      <div class="brand">
        <div class="logo" id="brandLogo"><span class="fallback" id="brandFallback">IT</span></div>
        <div class="b-text">
          <div class="b-name" id="brandName">Inventario</div>
          <div class="b-sub" id="brandSub">de Talleres</div>
        </div>
      </div>
      <nav class="nav">${navHTML}</nav>
      <div class="side-foot">
        <div class="side-user">
          <div class="av">${UI.esc(iniciales)}</div>
          <div style="min-width:0">
            <div class="u-name">${UI.esc(u.nombre || '')}</div>
            <div class="u-rol">${UI.esc(Auth.rolLabel(u.rol))}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-block btn-sm" id="btnLogout">${ICON.logout}<span>Cerrar sesión</span></button>
      </div>`;

    const topbar = document.getElementById('topbar');
    if (topbar) {
      topbar.innerHTML = `
        <button class="hamb" id="hamb">${ICON.menu}</button>
        <h1>${UI.esc(title || '')}</h1>
        <div class="spacer"></div>
        <div id="topbarExtra" class="row gap-sm"></div>`;
    }

    // Eventos
    document.getElementById('btnLogout').onclick = () => Auth.logout();
    const hamb = document.getElementById('hamb');
    if (hamb) {
      let bd = document.querySelector('.backdrop');
      if (!bd) { bd = document.createElement('div'); bd.className = 'backdrop'; document.body.appendChild(bd); }
      const toggle = () => { sidebar.classList.toggle('open'); bd.classList.toggle('show'); };
      hamb.onclick = toggle;
      bd.onclick = toggle;
    }
  },

  _aplicarConfig() {
    const c = this.config;
    if (!c) return;
    if (c.color_primario) {
      document.documentElement.style.setProperty('--color-primary', c.color_primario);
      document.documentElement.style.setProperty('--color-primary-d', sombra(c.color_primario, -14));
      document.documentElement.style.setProperty('--color-primary-soft', sombra(c.color_primario, 88, true));
    }
    const name = document.getElementById('brandName');
    const sub = document.getElementById('brandSub');
    if (name) name.textContent = c.nombre_institucion || 'Inventario';
    if (sub) sub.textContent = c.nombre_sistema || 'de Talleres';
    // Logo SVG en línea
    if (c.logo_svg && c.logo_svg.toLowerCase().includes('<svg')) {
      const box = document.getElementById('brandLogo');
      if (box) { box.innerHTML = c.logo_svg; box.style.background = 'transparent'; }
    } else {
      const fb = document.getElementById('brandFallback');
      if (fb) fb.textContent = (c.nombre_institucion || 'IT').trim().slice(0, 2).toUpperCase();
    }
  }
};

// Aclara/oscurece un color hex (mezcla con blanco o negro). pct 0..100.
function sombra(hex, pct, haciaBlanco = false) {
  try {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = haciaBlanco ? 255 : (pct < 0 ? 0 : 255);
    const p = Math.abs(pct) / 100;
    r = Math.round(r + (t - r) * (haciaBlanco ? p : (pct < 0 ? p : 0)));
    g = Math.round(g + (t - g) * (haciaBlanco ? p : (pct < 0 ? p : 0)));
    b = Math.round(b + (t - b) * (haciaBlanco ? p : (pct < 0 ? p : 0)));
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch { return hex; }
}
