// =====================================================================
//  api.js — Cliente HTTP para hablar con el backend
// =====================================================================
const Api = {
  base: API_BASE_URL,

  token() { return localStorage.getItem('token'); },

  _headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const t = this.token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  },

  async _handle(res) {
    if (res.status === 401) {
      // Token inválido o expirado
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (!location.pathname.endsWith('login.html')) {
        location.href = ruta('login.html') + '?expirado=1';
      }
      throw new Error('Sesión expirada.');
    }
    let data = null;
    const txt = await res.text();
    if (txt) { try { data = JSON.parse(txt); } catch { data = txt; } }
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  },

  async get(path) {
    const res = await fetch(this.base + path, { headers: this._headers(false) });
    return this._handle(res);
  },

  async post(path, body) {
    const res = await fetch(this.base + path, { method: 'POST', headers: this._headers(), body: JSON.stringify(body || {}) });
    return this._handle(res);
  },

  async put(path, body) {
    const res = await fetch(this.base + path, { method: 'PUT', headers: this._headers(), body: JSON.stringify(body || {}) });
    return this._handle(res);
  },

  async del(path) {
    const res = await fetch(this.base + path, { method: 'DELETE', headers: this._headers(false) });
    return this._handle(res);
  },

  // Subida de archivos (FormData: imágenes o Excel)
  async upload(path, formData) {
    const res = await fetch(this.base + path, { method: 'POST', headers: this._headers(false), body: formData });
    return this._handle(res);
  },

  // Descarga de binarios (PDF / Excel) con cabecera de autenticación.
  async download(path, filenameSugerido) {
    const res = await fetch(this.base + path, { headers: this._headers(false) });
    if (!res.ok) {
      if (res.status === 401) { location.href = ruta('login.html') + '?expirado=1'; }
      let msg = 'No se pudo generar el archivo.';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    // Intenta tomar el nombre del header Content-Disposition
    let filename = filenameSugerido || 'descarga';
    const cd = res.headers.get('Content-Disposition');
    if (cd) {
      const m = /filename="?([^"]+)"?/.exec(cd);
      if (m) filename = m[1];
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
};

// Devuelve la ruta correcta a una página esté donde esté el archivo actual.
function ruta(pagina) {
  const enPages = location.pathname.includes('/pages/');
  return (enPages ? '' : 'pages/') + pagina;
}
