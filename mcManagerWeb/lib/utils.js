/**
 * Utility functions
 * Questo file supporta sia ES6 modules che CommonJS
 */

/**
 * Normalizza una stringa per essere usata come subdomain
 * Rimuove caratteri speciali, spazi, e converte in lowercase
 *
 * @param {string} name - Nome del server o stringa da normalizzare
 * @returns {string} Subdomain normalizzato
 *
 * @example
 * normalizeSubdomain("My Server!") // "my-server"
 * normalizeSubdomain("Test_123") // "test-123"
 */
function normalizeSubdomain(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Sostituisce caratteri non alfanumerici con trattino
    .replace(/^-|-$/g, '');       // Rimuove trattini all'inizio e alla fine
}

/**
 * Genera il subdomain da un server object
 * Usa il subdomain se presente, altrimenti normalizza il nome o usa l'ID
 *
 * @param {Object} server - Server object con id, name, subdomain
 * @returns {string} Subdomain del server
 */
function getServerSubdomain(server) {
  if (!server) return '';

  return server.subdomain || normalizeSubdomain(server.name || server.id);
}

/**
 * Valida che una stringa sia un subdomain valido
 *
 * @param {string} subdomain - Subdomain da validare
 * @returns {boolean} True se valido
 */
function isValidSubdomain(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') return false;

  // Deve contenere solo lettere minuscole, numeri e trattini
  // Non può iniziare o finire con un trattino
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain);
}

// Export per ES6 modules (frontend)
export { normalizeSubdomain, getServerSubdomain, isValidSubdomain };

// Export per CommonJS (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeSubdomain, getServerSubdomain, isValidSubdomain };
}
