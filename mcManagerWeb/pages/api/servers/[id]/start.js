const { readConfig, startServer } = require('../../../../lib/docker-server-manager');
const { getIO } = require('../../../../lib/socket');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    const config = await readConfig();
    const server = config.find(s => s.id === id);

    if (!server) {
      return res.status(404).json({ error: 'Server non trovato' });
    }

    // Callback per i log (opzionale, per ora non implementato completamente)
    const onLog = (serverId, message) => {
      const io = getIO();
      if (io) {
        console.log(`[Socket.IO] Emitting log for ${serverId}:`, message.substring(0, 50));
        io.emit('log', { serverId, message });
      }
    };

    await startServer(id, server, onLog);

    // Notifica status
    const io = getIO();
    if (io) {
      console.log(`[Socket.IO] Emitting status for ${id}: running`);
      io.emit('status', { serverId: id, status: 'running' });
    } else {
      console.warn('[Socket.IO] Not initialized, cannot emit status');
    }

    res.status(200).json({ success: true, message: 'Server avviato' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
