const { readConfig, stopServer, startServer } = require('../../../../lib/docker-server-manager');
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

    // Stop the server first
    await stopServer(id);

    // Wait for the server to stop (poll for stopped status)
    const maxWait = 30000; // 30 seconds max
    const pollInterval = 1000; // Check every second
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;

      // Check if container is stopped
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        const containerName = `mc-${id}`;
        const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null || echo "false"`);
        if (stdout.trim() === 'false') {
          break;
        }
      } catch {
        // Container might not exist or already stopped
        break;
      }
    }

    // Small delay to ensure clean stop
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Callback for logs
    const onLog = (serverId, message) => {
      const io = getIO();
      if (io) {
        io.emit('log', { serverId, message });
      }
    };

    // Start the server again
    await startServer(id, server, onLog);

    // Notify status
    const io = getIO();
    if (io) {
      io.emit('status', { serverId: id, status: 'running' });
    }

    res.status(200).json({ success: true, message: 'Server riavviato' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
