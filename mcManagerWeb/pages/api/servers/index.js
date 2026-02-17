const { v4: uuidv4 } = require('uuid');
const { readConfig, saveConfig, isServerRunning, generateDockerCompose } = require('../../../lib/docker-server-manager');
const { updateDockerComposeMappings } = require('../../../lib/mc-router-config');
const { normalizeSubdomain } = require('../../../lib/utils');

// Tutti i server usano la porta 25565 internamente
// mc-router gestisce il routing SNI basato sul subdomain
const MINECRAFT_PORT = 25565;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // GET: Lista server
    try {
      const config = await readConfig();

      // Controlla lo status di ogni server (anche processi orfani)
      const serversWithStatus = await Promise.all(
        config.map(async (server) => ({
          ...server,
          status: (await isServerRunning(server.id)) ? 'running' : 'stopped'
        }))
      );

      res.status(200).json(serversWithStatus);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    // POST: Crea nuovo server
    try {
      const { name, subdomain, javaVersion, serverType, minecraftVersion, maxRam, minRam, additionalPorts } = req.body;
      const serverId = uuidv4();

      // Genera subdomain: usa quello fornito o genera dal nome
      const serverSubdomain = subdomain || normalizeSubdomain(name);

      const newServer = {
        id: serverId,
        name,
        subdomain: serverSubdomain,
        javaVersion: javaVersion || '21',
        serverType: serverType || 'paper',
        minecraftVersion: minecraftVersion || 'latest',
        maxRam: maxRam || 2048,
        minRam: minRam || 1024,
        port: MINECRAFT_PORT,
        additionalPorts: additionalPorts || {},
        createdAt: new Date().toISOString()
      };

      // Genera docker-compose.yml per il server
      await generateDockerCompose(serverId, newServer);

      const config = await readConfig();
      config.push(newServer);
      await saveConfig(config);

      // Aggiorna configurazione mc-router
      await updateDockerComposeMappings(config);

      res.status(201).json(newServer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
