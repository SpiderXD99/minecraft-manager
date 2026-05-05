const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const archiver = require('archiver');
const { SERVERS_DIR, readConfig } = require('../../../../lib/docker-server-manager');
const { getIO } = require('../../../../lib/socket');

export const config = {
  api: { responseLimit: false },
};

// Conta ricorsivamente tutti i file in una directory
async function countFiles(dir) {
  let count = 0;
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch {}
  return count;
}

// Store job in-memory (jobId → { status, tmpPath, error })
const jobs = new Map();

export default async function handler(req, res) {
  const { id, jobId } = req.query;
  const serverDir = path.join(SERVERS_DIR, id, 'minecraft-server');

  // GET: scarica zip completato
  if (req.method === 'GET' && jobId) {
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job non trovato' });
    if (job.status === 'error') return res.status(500).json({ error: job.error });
    if (job.status !== 'done') return res.status(202).json({ status: job.status });

    const zipPath = job.tmpPath;
    try {
      const stat = await fsPromises.stat(zipPath);
      res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(zipPath);
      stream.pipe(res);
      stream.on('end', () => {
        // Pulisci il file temporaneo dopo l'invio
        fsPromises.unlink(zipPath).catch(() => {});
        jobs.delete(jobId);
      });
      stream.on('error', () => {
        fsPromises.unlink(zipPath).catch(() => {});
        jobs.delete(jobId);
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // POST: avvia backup in background
  if (req.method === 'POST') {
    try {
      await fsPromises.access(serverDir);
    } catch {
      return res.status(404).json({ error: 'Server non trovato' });
    }

    let serverName = id;
    try {
      const cfg = await readConfig();
      const server = cfg.find(s => s.id === id);
      if (server?.name) serverName = server.name;
    } catch {}

    const safeName = serverName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filename = `${safeName}.zip`;
    const jid = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const tmpPath = path.join('/tmp', `${jid}.zip`);

    jobs.set(jid, { status: 'counting', tmpPath, filename });
    res.status(202).json({ jobId: jid });

    // Esegue in background
    setImmediate(async () => {
      const io = getIO();
      const emit = (data) => io && io.emit(`backup-${id}`, data);

      try {
        // Fase 1: conta i file
        emit({ jobId: jid, phase: 'counting' });
        const total = await countFiles(serverDir);
        jobs.set(jid, { ...jobs.get(jid), status: 'compressing' });
        emit({ jobId: jid, phase: 'compressing', current: 0, total });

        // Fase 2: crea zip
        let current = 0;
        const output = fs.createWriteStream(tmpPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        archive.on('entry', () => {
          current++;
          // Emetti ogni 10 file per non spammare
          if (current % 10 === 0 || current === total) {
            emit({ jobId: jid, phase: 'compressing', current, total });
          }
        });

        archive.on('error', (err) => {
          jobs.set(jid, { ...jobs.get(jid), status: 'error', error: err.message });
          emit({ jobId: jid, phase: 'error', error: err.message });
          fsPromises.unlink(tmpPath).catch(() => {});
        });

        output.on('close', () => {
          jobs.set(jid, { ...jobs.get(jid), status: 'done' });
          emit({ jobId: jid, phase: 'done', total });
        });

        archive.pipe(output);
        archive.directory(serverDir, false);
        await archive.finalize();

      } catch (err) {
        jobs.set(jid, { ...jobs.get(jid), status: 'error', error: err.message });
        emit({ jobId: jid, phase: 'error', error: err.message });
        fsPromises.unlink(tmpPath).catch(() => {});
      }
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
