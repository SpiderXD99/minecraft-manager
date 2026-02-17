const { readConfig, saveConfig, generateDockerCompose } = require('../../../../lib/docker-server-manager');
const { updateDockerComposeMappings } = require('../../../../lib/mc-router-config');

export default async function handler(req, res) {
  const { id } = req.query;

  const config = await readConfig();
  const index = config.findIndex(s => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Server non trovato' });
  }

  if (req.method === 'GET') {
    // GET: Ritorna info modpack corrente
    return res.status(200).json({ modpack: config[index].modpack || null });

  } else if (req.method === 'POST') {
    // POST: Imposta modpack sul server
    try {
      const { source, slug, name, projectId } = req.body;

      if (!source || !slug) {
        return res.status(400).json({ error: 'source e slug sono obbligatori' });
      }

      config[index].modpack = { source, slug, name, projectId };
      await saveConfig(config);

      // Rigenera docker-compose con env vars modpack
      await generateDockerCompose(id, config[index]);
      await updateDockerComposeMappings(config);

      res.status(200).json({
        server: config[index],
        message: 'Modpack configurato. Riavvia il server per applicare le modifiche.'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }

  } else if (req.method === 'DELETE') {
    // DELETE: Rimuove modpack dal server
    try {
      delete config[index].modpack;
      await saveConfig(config);

      // Rigenera docker-compose senza modpack
      await generateDockerCompose(id, config[index]);
      await updateDockerComposeMappings(config);

      res.status(200).json({
        server: config[index],
        message: 'Modpack rimosso. Riavvia il server per applicare le modifiche.'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }

  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
