const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { updateDockerComposeMappings } = require('./mc-router-config');
const { normalizeSubdomain } = require('./utils');
const {
  DOCKER_IMAGES,
  SERVER_TYPES,
  SERVICE_SUBDOMAIN_PREFIXES,
  SERVICE_PROTOCOLS,
  MC_SUBDOMAIN_PREFIX
} = require('./constants');

const execAsync = promisify(exec);

// Map per tenere traccia dei processi di log streaming attivi
const logStreams = new Map();

const SERVERS_DIR = path.join(process.cwd(), 'data', 'servers');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'servers-config.json');
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'minecraft-manager_default';

/**
 * Inizializza il Docker Server Manager
 * Crea le directory necessarie, inizializza il file di configurazione
 * e aggiorna i mapping di mc-router con i server esistenti
 */
async function initialize() {
  try {
    await fs.mkdir(SERVERS_DIR, { recursive: true });
    try {
      await fs.access(CONFIG_FILE);
    } catch {
      await fs.writeFile(CONFIG_FILE, JSON.stringify([], null, 2));
    }

    // Aggiorna mc-router mappings con i server esistenti
    const config = await readConfig();
    await updateDockerComposeMappings(config);

    console.log('Docker Server Manager inizializzato');
  } catch (error) {
    console.error('Errore inizializzazione Docker Server Manager:', error);
  }
}

/**
 * Legge la configurazione dei server dal file JSON
 * @returns {Promise<Array>} Array di configurazioni server
 */
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}


/**
 * Salva la configurazione dei server nel file JSON
 * @param {Array} config - Array di configurazioni server da salvare
 * @returns {Promise<void>}
 */
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Genera il nome del container Docker da un server ID
 * @param {string} serverId - ID univoco del server
 * @returns {string} Nome del container Docker
 */
function getContainerName(serverId) {
  return `minecraft-server-${serverId}`;
}

/**
 * Mappa la versione Java all'immagine Docker corrispondente
 * @param {string|number} javaVersion - Versione Java (8, 11, 17, 21)
 * @returns {string} Nome dell'immagine Docker itzg/minecraft-server
 */
function getDockerImage(javaVersion) {
  return DOCKER_IMAGES[javaVersion] || DOCKER_IMAGES[21];
}

/**
 * Mappa il tipo di server al valore TYPE per itzg/minecraft-server
 * @param {string} serverType - Tipo server (vanilla, paper, spigot, etc.)
 * @returns {string} Valore TYPE in uppercase per il container
 */
function getServerType(serverType) {
  return SERVER_TYPES[serverType] || SERVER_TYPES.paper;
}

/**
 * Genera il file docker-compose.yml per un server Minecraft
 * @param {string} serverId - ID univoco del server
 * @param {Object} server - Configurazione del server
 * @param {string} server.name - Nome del server
 * @param {string} server.serverType - Tipo di server (paper, vanilla, etc.)
 * @param {string} server.minecraftVersion - Versione Minecraft
 * @param {string} server.javaVersion - Versione Java
 * @param {number} server.maxRam - RAM massima in MB
 * @param {number} server.minRam - RAM iniziale in MB
 * @param {number} server.port - Porta del server
 * @param {string} [server.subdomain] - Subdomain personalizzato
 * @param {Object} [server.additionalPorts] - Porte aggiuntive da esporre (es: {voiceChat: 24454, dynmap: 8123})
 * @returns {Promise<void>}
 */
async function generateDockerCompose(serverId, server) {
  const containerName = getContainerName(serverId);
  const dockerImage = getDockerImage(server.javaVersion || '21');
  const serverType = getServerType(server.serverType || 'paper');

  // Usa il subdomain del server o genera dal nome
  const subdomain = server.subdomain || normalizeSubdomain(server.name || serverId);

  const baseDomain = process.env.BASE_DOMAIN;
  if (!baseDomain) {
    throw new Error('BASE_DOMAIN environment variable is required. Please set it in your .env file.');
  }
  const serverDomain = `${subdomain}.${MC_SUBDOMAIN_PREFIX}.${baseDomain}`;

  // Path assoluto per il volume mount
  const serverDir = path.join(SERVERS_DIR, serverId);
  const minecraftDataDir = path.join(serverDir, 'minecraft-server');

  // Se siamo in un container Docker, converti il path in path dell'host
  let hostPath = minecraftDataDir;
  if (process.cwd().startsWith('/app')) {
    // Siamo nel container minecraft-manager, converti /app -> path reale del progetto sull'host
    const hostProjectRoot = process.env.HOST_PROJECT_ROOT;
    hostPath = minecraftDataDir.replace('/app', hostProjectRoot);
  }

  // Costruisci la lista di porte da esporre e labels Traefik
  const exposePorts = ['25565']; // Porta Minecraft sempre esposta
  const traefikLabels = []; // Labels per Traefik routing
  const udpPorts = []; // Porte UDP pubblicate direttamente (Voice Chat, Geyser)

  // Aggiungi porte aggiuntive se configurate
  if (server.additionalPorts && typeof server.additionalPorts === 'object') {
    Object.entries(server.additionalPorts).forEach(([serviceName, portConfig]) => {
      // Supporta sia formato vecchio (number) che nuovo (object)
      let port, serviceSubdomainPrefix, description, enableSsl;

      if (typeof portConfig === 'number') {
        // Formato vecchio: additionalPorts: { dynmap: 8123 }
        port = portConfig;
        const serviceNameUpper = serviceName.toUpperCase();
        serviceSubdomainPrefix = SERVICE_SUBDOMAIN_PREFIXES[serviceNameUpper];
      } else if (typeof portConfig === 'object') {
        // Formato nuovo: additionalPorts: { dynmap: { port: 8123, subdomain: 'dynmap', description: '...', enableSsl: true } }
        port = portConfig.port;
        serviceSubdomainPrefix = portConfig.subdomain;
        description = portConfig.description;
        enableSsl = portConfig.enableSsl || false;
      } else {
        return;
      }

      if (!port) return;

      exposePorts.push(`${port}`);

      // Servizi HTTP con subdomain: usa Traefik per routing
      if (serviceSubdomainPrefix) {
        const serviceSubdomain = `${serviceSubdomainPrefix}-${subdomain}.${baseDomain}`;
        const routerName = `${serverId}-${serviceName}`;

        if (enableSsl) {
          // Configurazione con SSL (HTTPS + redirect HTTP->HTTPS)
          traefikLabels.push(
            `      - "traefik.enable=true"`,
            // HTTP router (redirect to HTTPS)
            `      - "traefik.http.routers.${routerName}-http.rule=Host(\`${serviceSubdomain}\`)"`,
            `      - "traefik.http.routers.${routerName}-http.entrypoints=web"`,
            `      - "traefik.http.routers.${routerName}-http.middlewares=${routerName}-redirect"`,
            `      - "traefik.http.middlewares.${routerName}-redirect.redirectscheme.scheme=https"`,
            `      - "traefik.http.middlewares.${routerName}-redirect.redirectscheme.permanent=true"`,
            // HTTPS router
            `      - "traefik.http.routers.${routerName}.rule=Host(\`${serviceSubdomain}\`)"`,
            `      - "traefik.http.routers.${routerName}.entrypoints=websecure"`,
            `      - "traefik.http.routers.${routerName}.tls=true"`,
            `      - "traefik.http.routers.${routerName}.tls.certresolver=letsencrypt"`,
            `      - "traefik.http.services.${routerName}.loadbalancer.server.port=${port}"`
          );
        } else {
          // Configurazione senza SSL (solo HTTP)
          traefikLabels.push(
            `      - "traefik.enable=true"`,
            `      - "traefik.http.routers.${routerName}.rule=Host(\`${serviceSubdomain}\`)"`,
            `      - "traefik.http.routers.${routerName}.entrypoints=web"`,
            `      - "traefik.http.services.${routerName}.loadbalancer.server.port=${port}"`
          );
        }
      }
      // Servizi UDP o senza subdomain: pubblica porta direttamente sull'host
      else {
        udpPorts.push(`${port}:${port}/udp`);
      }
    });
  }

  // Genera le righe per docker-compose
  const exposeLines = exposePorts.map(p => `      - "${p}"`).join('\n');
  const udpPortsLines = udpPorts.length > 0
    ? `    ports:\n${udpPorts.map(p => `      - "${p}"`).join('\n')}\n`
    : '';

  // Combina labels metadata con labels Traefik
  const allLabels = [
    '      # Metadata per identificazione',
    `      - "minecraft.server.id=${serverId}"`,
    `      - "minecraft.server.name=${server.name || 'unnamed'}"`,
    `      - "minecraft.server.domain=${serverDomain}"`,
    ...(traefikLabels.length > 0 ? ['      # Traefik routing per servizi aggiuntivi', ...traefikLabels] : [])
  ].join('\n');

  // Build environment variables
  const envVars = [
    'EULA=TRUE',
    `VERSION=${server.minecraftVersion || 'LATEST'}`,
    'SERVER_PORT=25565',
    `MEMORY=${server.maxRam}M`,
    `INIT_MEMORY=${server.minRam}M`,
    `MAX_MEMORY=${server.maxRam}M`,
    'ONLINE_MODE=TRUE',
    'CREATE_CONSOLE_IN_PIPE=true'
  ];

  // Modpack or normal server type
  if (server.modpack) {
    if (server.modpack.source === 'modrinth') {
      envVars.push('TYPE=MODRINTH');
      envVars.push(`MODRINTH_MODPACK=${server.modpack.slug}`);
    } else if (server.modpack.source === 'curseforge') {
      envVars.push('TYPE=AUTO_CURSEFORGE');
      envVars.push(`CF_SLUG=${server.modpack.slug}`);
      if (process.env.CURSEFORGE_API_KEY) {
        envVars.push(`CF_API_KEY=${process.env.CURSEFORGE_API_KEY}`);
      }
    }
  } else {
    envVars.push(`TYPE=${serverType}`);
  }

  const envLines = envVars.map(v => `      - ${v}`).join('\n');

  const dockerComposeContent = `services:
  minecraft-server:
    image: ${dockerImage}
    container_name: ${containerName}
    expose:
${exposeLines}
${udpPortsLines}    volumes:
      - ${hostPath}:/data
    environment:
${envLines}
    networks:
      - minecraft-manager_default
    restart: unless-stopped
    labels:
${allLabels}

networks:
  minecraft-manager_default:
    external: true
`;

  const composeFile = path.join(serverDir, 'docker-compose.yml');

  // Crea directory del server e minecraft-server
  await fs.mkdir(minecraftDataDir, { recursive: true });

  // Scrivi docker-compose.yml
  await fs.writeFile(composeFile, dockerComposeContent);
}

/**
 * Avvia un server Minecraft
 * @param {string} serverId - ID del server da avviare
 * @param {Object} server - Configurazione del server
 * @param {Function} [onLog] - Callback per ricevere log in tempo reale
 * @returns {Promise<void>}
 * @throws {Error} Se l'avvio fallisce
 */
async function startServer(serverId, server, onLog) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);
    const containerName = getContainerName(serverId);

    // Verifica se il docker-compose.yml esiste, altrimenti generalo
    const composeFile = path.join(serverDir, 'docker-compose.yml');
    try {
      await fs.access(composeFile);
    } catch {
      await generateDockerCompose(serverId, server);
    }

    // Esegui docker compose up
    const { stderr } = await execAsync('docker compose up -d', {
      cwd: serverDir,
    });

    if (stderr && !stderr.includes('Creating') && !stderr.includes('Starting') && !stderr.includes('Container')) {
      console.error(`Stderr durante avvio server ${serverId}:`, stderr);
    }

    // Connetti il container alla rete minecraft-manager_default
    try {
      await execAsync(`docker network connect ${DOCKER_NETWORK} ${containerName}`);
    } catch (error) {
      // Se il container è già connesso alla rete, ignora l'errore
      if (!error.message.includes('already exists')) {
        console.error(`Avviso: Impossibile connettere ${containerName} alla rete:`, error.message);
      }
    }

    // Avvia streaming dei log in tempo reale
    if (onLog) {
      startLogStreaming(serverId, serverDir, onLog);
    }

    return true;
  } catch (error) {
    console.error(`Errore avvio server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Avvia lo streaming dei log in tempo reale per un server
 * @param {string} serverId - ID del server
 * @param {string} serverDir - Directory del server
 * @param {Function} onLog - Callback chiamato per ogni linea di log (serverId, message)
 */
function startLogStreaming(serverId, serverDir, onLog) {
  // Se c'è già uno stream attivo, chiudilo
  stopLogStreaming(serverId);

  // Usa spawn per eseguire docker compose logs -f
  const logProcess = spawn('docker', ['compose', 'logs', '-f', '--tail', '50'], {
    cwd: serverDir,
  });

  // Gestisci stdout
  logProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      onLog(serverId, line);
    });
  });

  // Gestisci stderr
  logProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      onLog(serverId, line);
    });
  });

  // Gestisci errori
  logProcess.on('error', (error) => {
    console.error(`Errore streaming log ${serverId}:`, error);
  });

  // Gestisci chiusura
  logProcess.on('close', () => {
    logStreams.delete(serverId);
  });

  // Salva il processo nella mappa
  logStreams.set(serverId, logProcess);
}

/**
 * Ferma lo streaming dei log per un server
 * @param {string} serverId - ID del server
 */
function stopLogStreaming(serverId) {
  const logProcess = logStreams.get(serverId);
  if (logProcess) {
    logProcess.kill();
    logStreams.delete(serverId);
  }
}

/**
 * Ferma un server Minecraft in modo graceful (docker compose stop)
 * @param {string} serverId - ID del server da fermare
 * @returns {Promise<boolean>} True se l'operazione ha successo
 * @throws {Error} Se lo stop fallisce
 */
async function stopServer(serverId) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);

    // Ferma lo streaming dei log
    stopLogStreaming(serverId);

    // Esegui docker compose stop
    await execAsync('docker compose stop', {
      cwd: serverDir,
      timeout: 60000, // 60 secondi
    });
    return true;
  } catch (error) {
    console.error(`Errore stop server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Kill forzato del server (docker compose kill)
 * Ferma immediatamente il container senza salvare
 * @param {string} serverId - ID del server da killare
 * @returns {Promise<boolean>} True se l'operazione ha successo
 * @throws {Error} Se il kill fallisce
 */
async function killServer(serverId) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);

    // Ferma lo streaming dei log
    stopLogStreaming(serverId);

    try {
      // Esegui docker compose kill
      await execAsync('docker compose kill', {
        cwd: serverDir,
        timeout: 10000,
      });
    } catch (error) {
      // Se la directory non esiste o il container non è in esecuzione, ignora
      if (error.code !== 'ENOENT' && !error.message.includes('not running')) {
        console.error(`Errore durante kill server ${serverId}:`, error.message);
      }
    }

    return true;
  } catch (error) {
    console.error(`Errore kill server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Rimuove completamente il server (container, volumi e dati)
 * @param {string} serverId - ID del server da rimuovere
 * @returns {Promise<boolean>} True se l'operazione ha successo
 */
async function removeServer(serverId) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);

    // Ferma lo streaming dei log
    stopLogStreaming(serverId);

    try {
      // Esegui docker compose down per rimuovere container e network
      await execAsync('docker compose down -v', {
        cwd: serverDir,
        timeout: 30000,
      });
    } catch (error) {
      // Se la directory non esiste o il compose non è presente, procedi comunque
      if (error.code !== 'ENOENT') {
        console.error(`Errore durante docker compose down per ${serverId}:`, error.message);
      }
    }

    return true;
  } catch (error) {
    // Anche se ci sono errori, procedi con l'eliminazione dei dati
    console.error(`Errore durante rimozione server ${serverId}:`, error.message);
    return true;
  }
}

/**
 * Invia un comando al server Minecraft tramite stdin
 * Utilizza mc-send-to-console del container itzg/minecraft-server
 * @param {string} serverId - ID del server
 * @param {string} command - Comando Minecraft da eseguire
 * @returns {Promise<string>} Risultato del comando (vuoto se successo)
 * @throws {Error} Se l'invio del comando fallisce
 */
async function sendCommand(serverId, command) {
  try {
    const containerName = getContainerName(serverId);

    // Invia il comando direttamente al processo Minecraft via stdin
    // usando mc-send-to-console che è disponibile nel container itzg/minecraft-server
    // Deve essere eseguito come utente minecraft (UID 1000)
    await execAsync(
      `docker exec -u 1000 ${containerName} mc-send-to-console "${command}"`,
      { timeout: 5000 }
    );

    return '';
  } catch (error) {
    console.error(`Errore invio comando per ${serverId}:`, error);
    throw error;
  }
}

// Verifica se il server è in esecuzione
async function isServerRunning(serverId) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);
    const containerName = getContainerName(serverId);

    // Verifica se il container esiste ed è in esecuzione
    const { stdout } = await execAsync(
      `docker ps --filter "name=${containerName}" --filter "status=running" --format "{{.Names}}"`,
      { cwd: serverDir }
    );

    return stdout.trim() === containerName;
  } catch (error) {
    return false;
  }
}

// Ottieni log di un server
async function getServerLogs(serverId, lines = 500) {
  try {
    const serverDir = path.join(SERVERS_DIR, serverId);

    // Esegui docker compose logs
    const { stdout } = await execAsync(`docker compose logs --tail ${lines}`, {
      cwd: serverDir,
    });

    // Converti output in array di stringhe
    const logLines = stdout.split('\n').filter(line => line.trim());
    return logLines;
  } catch (error) {
    // Container non esiste o non è in esecuzione, ritorna array vuoto
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error(`Errore lettura log ${serverId}:`, error.message);
    return [];
  }
}

module.exports = {
  initialize,
  readConfig,
  saveConfig,
  startServer,
  stopServer,
  killServer,
  removeServer,
  sendCommand,
  isServerRunning,
  getServerLogs,
  generateDockerCompose,
  SERVERS_DIR,
};
