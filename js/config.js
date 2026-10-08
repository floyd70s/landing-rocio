// Configuración de la landing. Es el ÚNICO punto de unión con SGA (el sistema de administración):
// la landing solo llama a la API pública de reservas de SGA para ver horas libres y reservar.
// En producción: API_URL: 'https://sga.rociozacconi.cl/api'
window.LANDING_CONFIG = {
  API_URL: 'http://localhost:3100/api',
  INSTAGRAM: 'soyrociozacconi',
};
