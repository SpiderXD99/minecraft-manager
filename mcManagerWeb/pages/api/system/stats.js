const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { SERVERS_DIR, readConfig } = require('../../../lib/docker-server-manager');

const execAsync = promisify(exec);

async function getCpuPercent() {
  const readStat = () => {
    const stat = require('fs').readFileSync('/proc/stat', 'utf8');
    const parts = stat.split('\n')[0].split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  };
  try {
    const s1 = readStat();
    await new Promise(r => setTimeout(r, 200));
    const s2 = readStat();
    const dTotal = s2.total - s1.total;
    const dIdle = s2.idle - s1.idle;
    return dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
  } catch {
    const load = os.loadavg()[0];
    return Math.min(100, Math.round((load / os.cpus().length) * 100));
  }
}

async function getDiskStats() {
  // Prova la dir dei server, se non esiste usa '/'
  const targets = [SERVERS_DIR, '/'];
  for (const target of targets) {
    try {
      const { stdout } = await execAsync(
        `df -B1 "${target}" | awk 'NR==2{print $2, $3, $4}'`
      );
      const parts = stdout.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts[0] > 0) {
        const [total, used, avail] = parts;
        let serversSize = 0;
        try {
          const { stdout: du } = await execAsync(`du -sb "${SERVERS_DIR}" 2>/dev/null`);
          serversSize = parseInt(du.trim().split(/\s+/)[0]) || 0;
        } catch {}
        return { total, used, avail, serversSize };
      }
    } catch {}
  }
  return { total: 0, used: 0, avail: 0, serversSize: 0 };
}

// Parsa stringhe tipo "512MiB" o "1.5GiB" in bytes
function parseMemBytes(str) {
  if (!str) return 0;
  const m = str.match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const map = { b: 1, kib: 1024, mib: 1024**2, gib: 1024**3, tib: 1024**4, kb: 1000, mb: 1000**2, gb: 1000**3, tb: 1000**4 };
  return Math.round(val * (map[unit] || 1));
}

async function getDockerStats() {
  try {
    const { stdout } = await execAsync(
      `docker stats --no-stream --format "{{.Name}}\\t{{.MemUsage}}\\t{{.CPUPerc}}" 2>/dev/null`
    );
    const result = {};
    stdout.trim().split('\n').filter(Boolean).forEach(line => {
      const [name, memUsage, cpuPerc] = line.split('\t');
      if (!name || !name.startsWith('minecraft-server-')) return;
      const id = name.replace('minecraft-server-', '');
      const [used, limit] = (memUsage || '').split(' / ');
      result[id] = {
        ramUsed: parseMemBytes(used),
        ramLimit: parseMemBytes(limit),
        cpu: parseFloat(cpuPerc) || 0
      };
    });
    return result;
  } catch {
    return {};
  }
}

async function getServerDiskUsage(serverId) {
  try {
    const dir = path.join(SERVERS_DIR, serverId, 'minecraft-server');
    const { stdout } = await execAsync(`du -sb "${dir}" 2>/dev/null`);
    return parseInt(stdout.trim().split('\t')[0]) || 0;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [cpuPercent, disk, dockerStats, config] = await Promise.all([
      getCpuPercent(),
      getDiskStats(),
      getDockerStats(),
      readConfig()
    ]);

    // Disk usage per server in parallelo
    const diskUsages = await Promise.all(
      config.map(s => getServerDiskUsage(s.id))
    );

    const servers = config.map((s, i) => ({
      id: s.id,
      name: s.name,
      status: dockerStats[s.id] ? 'running' : 'stopped',
      disk: diskUsages[i],
      ram: dockerStats[s.id]?.ramUsed || 0,
      ramLimit: s.maxRam * 1024 * 1024,
      cpu: dockerStats[s.id]?.cpu || 0,
    }));

    res.status(200).json({
      cpu: { percent: cpuPercent, cores: os.cpus().length },
      ram: { total: os.totalmem(), used: os.totalmem() - os.freemem(), free: os.freemem() },
      disk,
      uptime: os.uptime(),
      servers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
