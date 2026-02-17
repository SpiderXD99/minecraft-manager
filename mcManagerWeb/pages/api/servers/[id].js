const fs = require('fs').promises;
const path = require('path');
const { readConfig, saveConfig, removeServer, generateDockerCompose, SERVERS_DIR } = require('../../../lib/docker-server-manager');
const { getIO } = require('../../../lib/socket');
const { updateDockerComposeMappings } = require('../../../lib/mc-router-config');

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    // PUT: Aggiorna server
    try {
      const updates = req.body;

      const config = await readConfig();
      const index = config.findIndex(s => s.id === id);

      if (index === -1) {
        return res.status(404).json({ error: 'Server non trovato' });
      }

      const oldServer = config[index];
      config[index] = { ...oldServer, ...updates };
      await saveConfig(config);

      // Se il subdomain o il nome sono cambiati, rigenera il docker-compose e aggiorna mc-router
      if (updates.subdomain !== undefined || updates.name !== undefined) {
        await generateDockerCompose(id, config[index]);
        await updateDockerComposeMappings(config);
      }

      res.status(200).json(config[index]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    // DELETE: Elimina server completamente (container + dati)
    try {
      // Notifica stato deleting
      const io = getIO();
      if (io) {
        io.emit('status', { serverId: id, status: 'deleting' });
      }

      // Rimuove il container (se esiste) - procede anche se non esiste
      await removeServer(id);

      // Rimuovi dalla configurazione
      const config = await readConfig();
      const newConfig = config.filter(s => s.id !== id);
      await saveConfig(newConfig);

      // Aggiorna configurazione mc-router
      await updateDockerComposeMappings(newConfig);

      // Elimina directory dei dati
      const serverDir = path.join(SERVERS_DIR, id);
      await fs.rm(serverDir, { recursive: true, force: true });

      console.log(`✓ Server ${id} eliminato completamente`);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
