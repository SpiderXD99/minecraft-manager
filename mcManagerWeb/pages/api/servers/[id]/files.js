const fs = require('fs').promises;
const path = require('path');
const { SERVERS_DIR } = require('../../../../lib/docker-server-manager');

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Calculate directory size recursively
 * @param {string} dirPath - Directory path
 * @param {number} maxDepth - Maximum recursion depth (to avoid slowdowns on huge directories)
 * @returns {Promise<number>} - Total size in bytes
 */
async function getDirectorySize(dirPath, maxDepth = 5) {
  if (maxDepth <= 0) return 0;

  let totalSize = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            return getDirectorySize(entryPath, maxDepth - 1);
          } else {
            const stats = await fs.stat(entryPath);
            return stats.size;
          }
        } catch {
          return 0; // Skip files we can't access
        }
      })
    );

    totalSize = sizes.reduce((acc, size) => acc + size, 0);
  } catch {
    // Directory not accessible
  }
  return totalSize;
}

export default async function handler(req, res) {
  const { id } = req.query;
  const serverDir = path.join(SERVERS_DIR, id, 'minecraft-server');

  // Verifica che la directory del server esista
  try {
    await fs.access(serverDir);
  } catch {
    return res.status(404).json({ error: 'Server non trovato' });
  }

  if (req.method === 'GET') {
    // GET: Lista file e directory
    try {
      const { path: relativePath = '' } = req.query;
      const fullPath = path.join(serverDir, relativePath);

      // Verifica security: il path deve essere dentro serverDir
      if (!fullPath.startsWith(serverDir)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }

      // Verifica se esiste
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ error: 'File o directory non trovato' });
      }

      // Verifica se è un file o directory
      const stats = await fs.stat(fullPath);

      if (stats.isFile()) {
        // Se è un file, leggi il contenuto
        const content = await fs.readFile(fullPath, 'utf8');
        return res.status(200).json({
          type: 'file',
          name: path.basename(fullPath),
          content
        });
      }

      if (stats.isDirectory()) {
        // Se è una directory, lista i contenuti
        const entries = await fs.readdir(fullPath, { withFileTypes: true });

        const files = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(fullPath, entry.name);
            const entryStats = await fs.stat(entryPath);
            const filePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            // Calculate size for directories too
            const size = entry.isDirectory()
              ? await getDirectorySize(entryPath, 3)
              : entryStats.size;

            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size,
              modified: entryStats.mtime,
              path: filePath
            };
          })
        );

        res.status(200).json({
          type: 'directory',
          path: relativePath,
          files: files.sort((a, b) => {
            // Directory prima, poi file
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
        });
      }
    } catch (error) {
      console.error('Error in GET /files:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    // POST: Crea file/directory o upload
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Upload file (gestito dall'endpoint /upload)
      return res.status(400).json({ error: 'Usa /upload per caricare file' });
    } else {
      // Crea file o directory
      try {
        // Parse JSON body manually since bodyParser is disabled
        const body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });

        const { path: relativePath, type, content } = body;
        const fullPath = path.join(serverDir, relativePath);

        // Verifica security
        if (!fullPath.startsWith(serverDir)) {
          return res.status(403).json({ error: 'Accesso negato' });
        }

        if (type === 'directory') {
          // Crea directory
          await fs.mkdir(fullPath, { recursive: true });
        } else {
          // Crea file
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, content || '', 'utf8');
        }

        res.status(200).json({ success: true });
      } catch (error) {
        console.error('Error in POST /files:', error);
        res.status(500).json({ error: error.message });
      }
    }
  } else if (req.method === 'PUT') {
    // PUT: Modifica file, rinomina o sposta
    try {
      // Parse JSON body manually
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });

      const { path: relativePath, newPath, content, action } = body;
      const fullPath = path.join(serverDir, relativePath);

      // Verifica security
      if (!fullPath.startsWith(serverDir)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }

      if (action === 'move' || action === 'rename') {
        const newFullPath = path.join(serverDir, newPath);

        // Verifica security sul nuovo path
        if (!newFullPath.startsWith(serverDir)) {
          return res.status(403).json({ error: 'Accesso negato' });
        }

        // Crea la directory di destinazione se non esiste
        const newDir = path.dirname(newFullPath);
        await fs.mkdir(newDir, { recursive: true });

        // Rinomina/sposta il file
        await fs.rename(fullPath, newFullPath);
      } else {
        // Modifica contenuto del file
        await fs.writeFile(fullPath, content || '', 'utf8');
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in PUT /files:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    // DELETE: Elimina file o directory
    try {
      // Parse JSON body manually
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });

      const { path: relativePath } = body;
      const fullPath = path.join(serverDir, relativePath);

      // Verifica security
      if (!fullPath.startsWith(serverDir)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }

      // Verifica che il file esista
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ error: 'File non trovato' });
      }

      // Elimina file o directory
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in DELETE /files:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
