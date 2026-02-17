const fs = require('fs');
const path = require('path');
const { SERVERS_DIR } = require('../../../../lib/docker-server-manager');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, path: relativePath } = req.query;
  const serverDir = path.join(SERVERS_DIR, id, 'minecraft-server');
  const targetPath = path.join(serverDir, relativePath || '');

  // Verifica security
  if (!targetPath.startsWith(serverDir)) {
    return res.status(403).json({ error: 'Accesso negato' });
  }

  try {
    const stats = fs.statSync(targetPath);

    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Solo i file possono essere scaricati' });
    }

    const filename = path.basename(targetPath);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    const fileStream = fs.createReadStream(targetPath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
