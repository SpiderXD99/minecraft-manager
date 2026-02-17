// Helper per ottenere l'istanza Socket.IO globale
function getIO() {
  if (global.io) {
    return global.io;
  }
  console.warn('Socket.IO non ancora inizializzato');
  return null;
}

module.exports = { getIO };
