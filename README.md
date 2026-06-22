# Sistema de Inventario de Herramientas y Equipos para Talleres

Sistema web completo para registrar, controlar y consultar el inventario de herramientas y equipos de talleres institucionales. Incluye **API REST** (Node.js + Express + MySQL), **frontend estático** (HTML/CSS/JS, sin frameworks), **fotos en la nube** (Cloudinary), **códigos QR** con ficha pública, **reportes en PDF y Excel**, **préstamos**, **mantenimientos** y **carga masiva** desde Excel.

---

## 1. Módulos incluidos

| Módulo | Estado | Descripción |
|---|---|---|
| Autenticación y roles | ✅ | Inicio de sesión con JWT y 4 niveles de permiso. |
| Configuración global | ✅ | Nombre de institución, logo SVG, color, días de alerta. |
| Inventario (CRUD) | ✅ | Alta, edición, baja, búsqueda y filtros de activos. |
| Carga masiva por Excel | ✅ | Plantilla + validación previa + importación. |
| Gestión de fotos | ✅ | Hasta 5 fotos por activo (Cloudinary), foto principal. |
| Reportes y exportación | ✅ | PDF A4 (tabla), PDF A3 (cartelería con foto y QR), Excel. |
| Etiquetas QR | ✅ | Hojas de etiquetas imprimibles en 3 tamaños. |
| Ficha pública por QR | ✅ | Consulta sin iniciar sesión (solo datos no sensibles). |
| Dashboard | ✅ | Totales por estado, taller y categoría, alertas. |
| Préstamos | ✅ | Entrega, devolución y control de vencidos. |
| Mantenimientos | ✅ | Preventivos/correctivos, próximos a vencer. |
| Auditoría | ✅ | Registro de acciones de los usuarios. |

---

## 2. Estructura del proyecto

```
inventario-talleres/
├── database/
│   └── schema.sql              # Estructura completa de la base de datos
├── backend/                    # API REST (Node.js + Express)
│   ├── config/db.js            # Conexión a MySQL
│   ├── middlewares/            # Autenticación y manejo de errores
│   ├── utils/                  # QR, PDF, Excel, Cloudinary, auditoría
│   ├── controllers/            # Lógica de cada módulo
│   ├── routes/index.js         # Definición de endpoints
│   ├── scripts/seed.js         # Carga de datos iniciales (admin + demo)
│   ├── server.js               # Punto de entrada
│   ├── package.json
│   └── .env.example            # Plantilla de variables de entorno
└── frontend/                   # Sitio estático (sin build)
    ├── config.js               # URL del backend (EDITAR en producción)
    ├── index.html
    ├── assets/{css,js,img}/
    └── pages/                  # Páginas de la aplicación + ficha pública
```

---

## 3. Requisitos previos

- **Node.js 20 o superior** y **npm**.
- **MySQL 8** (local para pruebas; en producción puede ser Railway).
- Una cuenta gratuita de **Cloudinary** (para las fotos).
- Una cuenta de **GitHub** (para publicar el frontend y conectar el backend).

> Las fotos requieren Cloudinary, pero el resto del sistema funciona sin él. Las credenciales de Cloudinary viven **solo en el backend**, nunca en el frontend.

---

## 4. Prueba local rápida (recomendado antes de desplegar)

### 4.1. Crear la base de datos
1. Inicia MySQL y crea la base de datos ejecutando el archivo `database/schema.sql`. Por ejemplo, desde la terminal:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
   Esto crea la base `inventario_talleres` con todas sus tablas.

### 4.2. Configurar y levantar el backend
1. Entra a la carpeta y copia el archivo de entorno:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Abre `.env` y completa al menos los datos de la base de datos (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`) y un `JWT_SECRET` largo. Para probar sin fotos, puedes dejar las variables de Cloudinary como están.
3. Instala dependencias, carga los datos iniciales y arranca:
   ```bash
   npm install
   npm run seed     # crea el administrador y datos de demostración
   npm run dev      # arranca con recarga automática (o "npm start")
   ```
4. Verifica que responde abriendo `http://localhost:3000/` en el navegador: debe mostrar un mensaje de estado del API.

### 4.3. Levantar el frontend
1. El frontend es estático: necesitas servirlo con un servidor local (no abrir el archivo directamente). La forma más simple es la extensión **Live Server** de VS Code, o el paquete `live-server`:
   ```bash
   npx live-server frontend --port=5500
   ```
2. Asegúrate de que en `frontend/config.js` la constante apunte al backend local:
   ```js
   const API_BASE_URL = 'http://localhost:3000/api';
   ```
3. Abre `http://localhost:5500` e inicia sesión con las credenciales de abajo.

> **Importante (CORS):** la variable `FRONTEND_URL` del backend debe coincidir con la URL donde corre el frontend (por defecto `http://localhost:5500`). Si usas otro puerto, actualízala en `.env` y reinicia el backend.

---

## 5. Credenciales por defecto

Tras ejecutar `npm run seed`, el administrador inicial es:

```
Correo:      admin@taller.local
Contraseña:  Admin1234
```

Puedes cambiar estos valores antes del seed con las variables `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el `.env`. **Cambia la contraseña después del primer ingreso** desde *Configuración → Usuarios*.

---

## 6. Roles y permisos

El sistema tiene 4 roles jerárquicos. Cada nivel incluye los permisos de los anteriores:

| Rol | Puede hacer |
|---|---|
| **Consulta** | Ver el inventario, dashboard, reportes y descargar etiquetas. |
| **Docente** | Lo anterior + registrar préstamos y devoluciones. |
| **Jefe de taller** | Lo anterior + crear/editar/dar de baja activos, gestionar fotos, **carga masiva por Excel** y mantenimientos. |
| **Administrador** | Todo + configuración global, categorías, talleres y usuarios. |

La **ficha pública por QR** no requiere iniciar sesión y muestra únicamente datos no sensibles (nombre, categoría, marca/modelo, ubicación, estado y cuidados). Nunca muestra el valor ni el responsable.

---

## 7. Despliegue en producción (gratuito)

El esquema recomendado: **base de datos y backend en Railway**, **frontend en GitHub Pages** y **fotos en Cloudinary**. (Render funciona igual que Railway para el backend.)

### Paso 1 — Base de datos en Railway
1. Crea una cuenta en [railway.app](https://railway.app) y un proyecto nuevo.
2. Dentro del proyecto: **New → Database → MySQL**.
3. Abre la base creada, pestaña **Variables/Connect**, y copia los datos de conexión (host, puerto, usuario, contraseña y nombre de la base).
4. Ejecuta el contenido de `database/schema.sql` sobre esa base. Puedes hacerlo con un cliente como **MySQL Workbench**, **DBeaver** o la consola de Railway, conectándote con los datos del paso anterior.

### Paso 2 — Cloudinary (fotos)
1. Crea una cuenta gratuita en [cloudinary.com](https://cloudinary.com).
2. En el **Dashboard** copia: *Cloud name*, *API Key* y *API Secret*.
3. Guarda esos tres valores; los usarás como variables de entorno del backend.

### Paso 3 — Backend en Railway
1. Sube **solo la carpeta `backend/`** a un repositorio de GitHub (o el proyecto completo, indicando a Railway que el directorio raíz es `backend`).
2. En Railway: **New → Deploy from GitHub repo** y selecciona ese repositorio.
3. En **Variables**, define las del archivo `.env.example` con los valores reales:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` → los de tu base MySQL de Railway.
   - `DB_SSL=true` si tu proveedor de base de datos requiere SSL.
   - `JWT_SECRET` → una cadena larga y aleatoria (ej. `openssl rand -hex 32`).
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` → los de Cloudinary.
   - `FRONTEND_URL` → la URL pública de tu frontend (la obtendrás en el Paso 4; puedes ajustarla luego).
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` → credenciales del administrador inicial.
4. Railway ejecutará `npm install` y `npm start` automáticamente. Cuando despliegue, copia la **URL pública del backend** (algo como `https://tu-backend.up.railway.app`).
5. Carga los datos iniciales **una sola vez**. Si tu plan lo permite, ejecuta en la consola del servicio:
   ```bash
   npm run seed
   ```
   (Como alternativa, puedes correr el seed localmente apuntando el `.env` a la base de Railway.)

### Paso 4 — Frontend en GitHub Pages
1. Edita `frontend/config.js` y reemplaza la URL local por la del backend desplegado, **terminando en `/api`**:
   ```js
   const API_BASE_URL = 'https://tu-backend.up.railway.app/api';
   ```
2. Sube la carpeta `frontend/` a un repositorio de GitHub.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, elige la rama `main` y la carpeta raíz (`/root`) o `/frontend` según cómo lo hayas subido. Guarda.
4. GitHub te dará una URL pública (algo como `https://tu-usuario.github.io/tu-repo`).

### Paso 5 — Conectar los QR con el frontend
1. Vuelve a Railway y ajusta la variable `FRONTEND_URL` del backend para que sea **exactamente** la URL pública de GitHub Pages del Paso 4. Esto:
   - permite el acceso del frontend al API (CORS), y
   - hace que los **códigos QR** apunten a la ficha pública correcta (`/pages/publico.html`).
2. Reinicia el backend para aplicar el cambio.
3. Listo: entra a la URL del frontend, inicia sesión y prueba generar un QR; al escanearlo debe abrir la ficha pública del activo.

---

## 8. Carga masiva desde Excel

Disponible para **jefe de taller** y **administrador**:

1. Ve a **Inventario → botón “Importar”**.
2. Descarga la **plantilla** (incluye listas desplegables y una hoja de instrucciones).
3. Completa los datos. Las **categorías** y **talleres** deben existir previamente con el mismo nombre (créalos en *Configuración*).
4. Sube el archivo: el sistema **valida cada fila** y muestra una vista previa (válidas, advertencias y errores) **sin guardar nada**.
5. Confirma la importación. Las filas con error se omiten; las de advertencia se importan con los ajustes indicados.

---

## 9. Respaldo de la base de datos

Realiza copias periódicas con `mysqldump`:

```bash
mysqldump -u USUARIO -p NOMBRE_BASE > respaldo_inventario_$(date +%F).sql
```

Para restaurar:

```bash
mysql -u USUARIO -p NOMBRE_BASE < respaldo_inventario_2025-01-01.sql
```

En Railway puedes usar los mismos comandos apuntando a los datos de conexión del panel, o las herramientas de respaldo que ofrezca tu proveedor.

---

## 10. Solución de problemas

- **El frontend no carga datos / errores de CORS:** verifica que `FRONTEND_URL` (backend) coincida exactamente con la URL del frontend y que `API_BASE_URL` (frontend) termine en `/api` y apunte al backend correcto.
- **“No autorizado” o sesión que se cierra sola:** la sesión expira por seguridad (`JWT_EXPIRES_IN`, 8 h por defecto) y tras inactividad. Vuelve a iniciar sesión.
- **Las fotos no suben:** revisa las tres variables de Cloudinary en el backend. Sin ellas, el resto del sistema sigue funcionando.
- **El QR abre una página en blanco o de error:** casi siempre es `FRONTEND_URL` mal configurada en el backend. Debe ser la URL pública del frontend.
- **No puedo crear activos/usuarios:** confirma que tu usuario tiene el rol necesario (ver tabla de roles).

---

## 11. Notas técnicas

- **Backend:** Node.js + Express, MySQL con `mysql2`, autenticación con `jsonwebtoken`, contraseñas con `bcryptjs`, PDF con `PDFKit`, Excel con `ExcelJS`, QR con `qrcode`, imágenes con `cloudinary` (subida vía `multer` en memoria).
- **Frontend:** HTML/CSS/JavaScript puro (sin framework ni proceso de build), diseño responsive optimizado para móvil. Las imágenes se comprimen en el navegador antes de subirse.
- **Seguridad:** las credenciales sensibles viven solo en variables de entorno del backend. El frontend nunca contiene claves.
```
