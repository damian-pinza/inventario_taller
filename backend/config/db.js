// config/db.js — Pool de conexiones MySQL (mysql2/promise)
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Railway requiere a veces SSL; se ignora en local sin problema.
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// Comprueba la conexión al arrancar (mensaje informativo, no detiene el server).
pool.getConnection()
  .then((conn) => {
    console.log('✅ Conectado a MySQL:', process.env.DB_NAME);
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Error conectando a MySQL:', err.message);
  });

module.exports = pool;
