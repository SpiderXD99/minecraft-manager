const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { SERVERS_DIR } = require('../../../../lib/docker-server-manager');

const execAsync = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const serverDir = path.join(SERVERS_DIR, id);

  try {
    // Trova tutti i processi che hanno file aperti nella directory del server
    const { stdout } = await execAsync(`lsof -t +D "${serverDir}" 2>/dev/null || true`);

    if (!stdout.trim()) {
      return res.status(200).json({ processes: [] });
    }

    const pids = stdout.trim().split('\n')
      .map(pid => parseInt(pid))
      .filter(pid => !isNaN(pid) && pid !== process.pid);

    // Rimuovi duplicati
    const uniquePids = [...new Set(pids)];

    // Ottieni informazioni dettagliate su ogni processo
    const processes = [];
    for (const pid of uniquePids) {
      try {
        // Ottieni comando completo del processo
        const { stdout: cmdline } = await execAsync(`ps -p ${pid} -o args= 2>/dev/null || true`);
        const { stdout: comm } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null || true`);

        const processName = comm.trim();
        const commandLine = cmdline.trim();

        if (processName && commandLine) {
          // Estrai il percorso del JAR se presente
          let jarPath = null;
          const jarMatch = commandLine.match(/([^\s]+\.jar)/);
          if (jarMatch) {
            jarPath = jarMatch[1];
          }

          processes.push({
            pid,
            name: processName,
            command: commandLine,
            jarPath,
            isJava: processName.includes('java')
          });
        }
      } catch (e) {
        // Processo terminato nel frattempo, ignora
      }
    }

    res.status(200).json({ processes });
  } catch (error) {
    console.error('Errore recupero processi:', error);
    res.status(500).json({ error: error.message });
  }
}
