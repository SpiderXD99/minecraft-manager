const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { SERVERS_DIR, readConfig } = require('../../../../lib/docker-server-manager');

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const serverDir = path.join(SERVERS_DIR, id, 'minecraft-server');

  try {
    await fs.promises.access(serverDir);
  } catch {
    return res.status(404).json({ error: 'Server non trovato' });
  }

  // Legge il nome del server dalla config per il filename
  let serverName = id;
  try {
    const config = await readConfig();
    const server = config.find(s => s.id === id);
    if (server?.name) serverName = server.name;
  } catch {}

  const safeName = serverName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const zipName = `${safeName}.zip`;

  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    console.error(`[Backup] Errore archivio ${id}:`, err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(serverDir, false);
  await archive.finalize();
}
