-- =============================================================
--  SISTEMA DE INVENTARIO DE HERRAMIENTAS Y EQUIPOS PARA TALLERES
--  Esquema de base de datos · MySQL 8
-- =============================================================
--  Ejecuta este archivo completo en tu base de datos MySQL.
--  En Railway:  Database > Connect > Query  (pega y ejecuta)
--  En local:    mysql -u root -p < schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS inventario_talleres
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE inventario_talleres;

-- ---------- Configuración global del sistema ----------
CREATE TABLE IF NOT EXISTS configuracion (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre_institucion VARCHAR(200),
  nombre_administrador VARCHAR(150),
  logo_svg MEDIUMTEXT,                       -- el SVG se guarda como texto plano
  nombre_sistema VARCHAR(100),
  color_primario VARCHAR(20) DEFAULT '#1f6feb',
  dias_alerta_mantenimiento INT DEFAULT 15,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Usuarios del sistema ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('administrador','jefe_taller','docente','consulta') NOT NULL DEFAULT 'consulta',
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Categorías de activos ----------
CREATE TABLE IF NOT EXISTS categorias (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT
);

-- ---------- Talleres / Ubicaciones ----------
CREATE TABLE IF NOT EXISTS talleres (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  responsable_id INT,
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ---------- Activos (inventario principal) ----------
CREATE TABLE IF NOT EXISTS activos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo_interno VARCHAR(50) UNIQUE NOT NULL,
  codigo_patrimonial VARCHAR(50),
  nombre VARCHAR(200) NOT NULL,
  categoria_id INT,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  numero_serie VARCHAR(100),
  estado ENUM('operativo','mantenimiento','baja') NOT NULL DEFAULT 'operativo',
  cantidad INT NOT NULL DEFAULT 1,
  taller_id INT,
  responsable VARCHAR(150),
  fecha_adquisicion DATE,
  valor_referencial DECIMAL(12,2),
  observaciones TEXT,
  cuidado_mantenimiento TEXT,
  qr_token VARCHAR(40) UNIQUE,               -- token público permanente para el QR
  foto_principal_url TEXT,
  creado_por INT,
  modificado_por INT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modificado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  FOREIGN KEY (taller_id) REFERENCES talleres(id) ON DELETE SET NULL,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (modificado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Índices para soportar 10.000+ registros con búsquedas y filtros rápidos
CREATE INDEX idx_activos_nombre        ON activos(nombre);
CREATE INDEX idx_activos_marca         ON activos(marca);
CREATE INDEX idx_activos_serie         ON activos(numero_serie);
CREATE INDEX idx_activos_estado        ON activos(estado);
CREATE INDEX idx_activos_categoria     ON activos(categoria_id);
CREATE INDEX idx_activos_taller        ON activos(taller_id);
CREATE INDEX idx_activos_responsable   ON activos(responsable);
CREATE INDEX idx_activos_fecha_adq     ON activos(fecha_adquisicion);

-- ---------- Fotografías adicionales del activo ----------
CREATE TABLE IF NOT EXISTS fotos_activo (
  id INT PRIMARY KEY AUTO_INCREMENT,
  activo_id INT NOT NULL,
  url TEXT NOT NULL,
  public_id VARCHAR(255),                     -- id en Cloudinary, para poder borrarla
  es_principal BOOLEAN DEFAULT FALSE,
  orden INT DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE
);
CREATE INDEX idx_fotos_activo ON fotos_activo(activo_id);

-- ---------- Préstamos ----------
CREATE TABLE IF NOT EXISTS prestamos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  activo_id INT NOT NULL,
  receptor_nombre VARCHAR(150) NOT NULL,
  receptor_cargo VARCHAR(100),
  fecha_entrega DATETIME NOT NULL,
  fecha_devolucion_esperada DATETIME,
  fecha_devolucion_real DATETIME,
  estado ENUM('activo','devuelto','vencido') DEFAULT 'activo',
  observaciones TEXT,
  registrado_por INT,
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_prestamos_activo ON prestamos(activo_id);
CREATE INDEX idx_prestamos_estado ON prestamos(estado);

-- ---------- Mantenimientos ----------
CREATE TABLE IF NOT EXISTS mantenimientos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  activo_id INT NOT NULL,
  tipo ENUM('preventivo','correctivo') NOT NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin DATETIME,
  descripcion TEXT,
  tecnico_responsable VARCHAR(150),
  costo DECIMAL(12,2),
  proxima_fecha DATE,
  estado ENUM('programado','en_proceso','completado') DEFAULT 'programado',
  registrado_por INT,
  FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mant_activo ON mantenimientos(activo_id);
CREATE INDEX idx_mant_proxima ON mantenimientos(proxima_fecha);

-- ---------- Fotos de mantenimiento ----------
CREATE TABLE IF NOT EXISTS fotos_mantenimiento (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mantenimiento_id INT NOT NULL,
  url TEXT NOT NULL,
  public_id VARCHAR(255),
  FOREIGN KEY (mantenimiento_id) REFERENCES mantenimientos(id) ON DELETE CASCADE
);

-- ---------- Auditoría ----------
CREATE TABLE IF NOT EXISTS auditoria (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT,
  accion VARCHAR(50) NOT NULL,
  tabla_afectada VARCHAR(50),
  registro_id INT,
  detalle TEXT,
  ip_address VARCHAR(45),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
