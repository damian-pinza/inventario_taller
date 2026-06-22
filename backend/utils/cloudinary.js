// utils/cloudinary.js — Subida y borrado seguro de imágenes en Cloudinary
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ¿Está configurado Cloudinary? (permite arrancar el server aunque falte)
function cloudinaryConfigurado() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);
}

// Sube un buffer (recibido por multer en memoria) a Cloudinary.
// Devuelve { url, public_id }
function subirImagen(buffer, carpeta = 'inventario') {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfigurado()) {
      return reject(new Error('Cloudinary no está configurado. Revisa las variables CLOUDINARY_* en el .env'));
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: carpeta,
        resource_type: 'image',
        // Optimización automática de calidad y formato.
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// Borra una imagen por su public_id.
async function borrarImagen(publicId) {
  if (!publicId || !cloudinaryConfigurado()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    console.warn('No se pudo borrar imagen de Cloudinary:', e.message);
  }
}

module.exports = { subirImagen, borrarImagen, cloudinaryConfigurado };
