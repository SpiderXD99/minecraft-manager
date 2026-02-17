const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { SERVERS_DIR } = require('../../../../lib/docker-server-manager');
const { getIO } = require('../../../../lib/socket');

// Store for background jobs
const jobs = new Map();

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function emitJobUpdate(serverId, jobId, status, data = {}) {
  const io = getIO();
  if (io) {
    io.emit(`archive-job-${serverId}`, { jobId, status, ...data });
  }
}

export default async function handler(req, res) {
  const { id } = req.query;
  const serverDir = path.join(SERVERS_DIR, id, 'minecraft-server');

  if (req.method === 'POST') {
    // POST: Crea archivio ZIP (in background)
    try {
      const { path: relativePath, name } = req.body;
      const targetPath = path.join(serverDir, relativePath);

      // Verifica security
      if (!targetPath.startsWith(serverDir)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }

      const zipName = name || `${path.basename(targetPath)}.zip`;
      const zipPath = path.join(path.dirname(targetPath), zipName);

      const jobId = generateJobId();
      jobs.set(jobId, { status: 'running', type: 'compress', filename: zipName });

      // Respond immediately
      res.status(202).json({
        success: true,
        jobId,
        message: 'Compressione avviata in background',
        filename: zipName
      });

      // Run compression in background
      setImmediate(async () => {
        try {
          emitJobUpdate(id, jobId, 'running', { message: 'Compressione in corso...', filename: zipName });

          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 6 } }); // level 6 is faster than 9

          output.on('close', () => {
            jobs.set(jobId, { status: 'completed', type: 'compress', filename: zipName, size: archive.pointer() });
            emitJobUpdate(id, jobId, 'completed', {
              message: 'Compressione completata',
              filename: zipName,
              size: archive.pointer()
            });
          });

          archive.on('error', (err) => {
            jobs.set(jobId, { status: 'error', type: 'compress', error: err.message });
            emitJobUpdate(id, jobId, 'error', { message: `Errore: ${err.message}` });
          });

          archive.pipe(output);

          const stats = await fsPromises.stat(targetPath);
          if (stats.isDirectory()) {
            archive.directory(targetPath, false);
          } else {
            archive.file(targetPath, { name: path.basename(targetPath) });
          }

          await archive.finalize();
        } catch (error) {
          jobs.set(jobId, { status: 'error', type: 'compress', error: error.message });
          emitJobUpdate(id, jobId, 'error', { message: `Errore: ${error.message}` });
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PUT') {
    // PUT: Estrai archivio ZIP (in background)
    try {
      const { path: relativePath, destination } = req.body;
      const zipPath = path.join(serverDir, relativePath);
      const destPath = path.join(serverDir, destination || path.dirname(relativePath));

      // Verifica security
      if (!zipPath.startsWith(serverDir) || !destPath.startsWith(serverDir)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }

      const filename = path.basename(relativePath);
      const jobId = generateJobId();
      jobs.set(jobId, { status: 'running', type: 'extract', filename });

      // Respond immediately
      res.status(202).json({
        success: true,
        jobId,
        message: 'Estrazione avviata in background',
        filename
      });

      // Run extraction in background
      setImmediate(async () => {
        try {
          await fsPromises.mkdir(destPath, { recursive: true });

          emitJobUpdate(id, jobId, 'running', { message: 'Estrazione in corso...', filename });

          // Use native unzip command for better reliability
          const ext = path.extname(zipPath).toLowerCase();
          let cmd;

          if (ext === '.zip') {
            // -o = overwrite, -q = quiet
            cmd = `unzip -o -q "${zipPath}" -d "${destPath}"`;
          } else if (ext === '.gz' || ext === '.tgz' || zipPath.endsWith('.tar.gz')) {
            cmd = `tar -xzf "${zipPath}" -C "${destPath}"`;
          } else if (ext === '.tar') {
            cmd = `tar -xf "${zipPath}" -C "${destPath}"`;
          } else {
            throw new Error(`Formato archivio non supportato: ${ext}`);
          }

          await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer for output

          jobs.set(jobId, { status: 'completed', type: 'extract', filename });
          emitJobUpdate(id, jobId, 'completed', { message: 'Estrazione completata', filename });

        } catch (error) {
          jobs.set(jobId, { status: 'error', type: 'extract', error: error.message });
          emitJobUpdate(id, jobId, 'error', { message: `Errore: ${error.message}` });
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'GET') {
    // GET: Check job status
    const { jobId } = req.query;
    if (jobId && jobs.has(jobId)) {
      res.status(200).json(jobs.get(jobId));
    } else {
      res.status(404).json({ error: 'Job non trovato' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
