/**
 * Application-wide constants
 * Centralizes all magic numbers and hardcoded values
 */

// ==============================================================================
// NETWORK & PORTS
// ==============================================================================

/** Minecraft server default port */
export const MINECRAFT_DEFAULT_PORT = 25565;

/** Porte aggiuntive comuni per mod e plugin */
export const ADDITIONAL_PORTS = {
  VOICE_CHAT: 24454,      // Simple Voice Chat mod
  BLUEMAP: 8100,          // BlueMap web interface
  DYNMAP: 8123,           // Dynmap web interface
  SQUAREMAP: 8080,        // SquareMap web interface
  PLAN: 8804,             // Plan analytics
  GEYSER: 19132,          // Geyser (Bedrock support)
};

/** Prefissi subdomain per servizi aggiuntivi */
export const SERVICE_SUBDOMAIN_PREFIXES = {
  VOICE_CHAT: null,       // UDP, nessun routing HTTP
  BLUEMAP: 'bluemap',     // bluemap-{servername}.domain
  DYNMAP: 'dynmap',       // dynmap-{servername}.domain
  SQUAREMAP: 'map',       // map-{servername}.domain
  PLAN: 'plan',           // plan-{servername}.domain
  GEYSER: null,           // UDP/TCP Bedrock, nessun routing HTTP
};

/** Protocollo per servizi aggiuntivi (http/tcp/udp) */
export const SERVICE_PROTOCOLS = {
  VOICE_CHAT: 'udp',
  BLUEMAP: 'http',
  DYNMAP: 'http',
  SQUAREMAP: 'http',
  PLAN: 'http',
  GEYSER: 'udp',
};

/** Docker network name */
export const DOCKER_NETWORK = 'minecraft-manager_default';

/** Minecraft subdomain prefix (servers accessible at <name>.<prefix>.<domain>) */
export const MC_SUBDOMAIN_PREFIX = process.env.MC_SUBDOMAIN_PREFIX || 'mc';

// ==============================================================================
// TIMING & DELAYS
// ==============================================================================

/** Polling interval for server logs when stopped (ms) */
export const LOG_POLL_INTERVAL = 2000;

/** Delay before updating UI after server start (ms) */
export const SERVER_START_DELAY = 500;

/** Timeout for server stop operation (ms) */
export const SERVER_STOP_TIMEOUT = 30000;

/** Duration to show clipboard success notification (ms) */
export const CLIPBOARD_NOTIFICATION_DURATION = 1500;

/** Polling interval for checking server status (ms) */
export const STATUS_POLL_INTERVAL = 2000;

// ==============================================================================
// FILE UPLOAD
// ==============================================================================

/** Maximum file size for uploads (bytes) */
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/** Upload timeout duration (ms) */
export const UPLOAD_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/** Form parse timeout (ms) */
export const FORM_PARSE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/** Temporary upload directory */
export const UPLOAD_TEMP_DIR = '/tmp';

// ==============================================================================
// DOCKER IMAGES
// ==============================================================================

/** Docker images for different Java versions */
export const DOCKER_IMAGES = {
  8: 'itzg/minecraft-server:java8',
  11: 'itzg/minecraft-server:java11',
  17: 'itzg/minecraft-server:java17',
  21: 'itzg/minecraft-server:java21',
};

/** Minecraft server types */
export const SERVER_TYPES = {
  vanilla: 'VANILLA',
  paper: 'PAPER',
  spigot: 'SPIGOT',
  fabric: 'FABRIC',
  forge: 'FORGE',
  purpur: 'PURPUR',
  velocity: 'VELOCITY',
  waterfall: 'WATERFALL',
};

// ==============================================================================
// UI CONSTANTS
// ==============================================================================

/** Common Minecraft server commands for autocomplete */
export const COMMON_COMMANDS = [
  'help',
  'stop',
  'reload',
  'save-all',
  'list',
  'whitelist',
  'op',
  'deop',
  'kick',
  'ban',
  'gamemode',
  'difficulty',
  'time',
  'weather',
  'tp',
  'give',
];

/** Log type classifications for styling */
export const LOG_TYPES = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
};

// ==============================================================================
// PATH CONSTANTS
// ==============================================================================

/** Data directory relative to project root */
export const DATA_DIR = 'data';

/** Servers directory name */
export const SERVERS_DIR_NAME = 'servers';

/** Config file name */
export const CONFIG_FILE_NAME = 'servers-config.json';

// ==============================================================================
// VALIDATION
// ==============================================================================

/** Subdomain validation regex */
export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Maximum subdomain length */
export const MAX_SUBDOMAIN_LENGTH = 63;

/** Minimum server name length */
export const MIN_SERVER_NAME_LENGTH = 1;

/** Maximum server name length */
export const MAX_SERVER_NAME_LENGTH = 50;

// Export per CommonJS (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MINECRAFT_DEFAULT_PORT,
    ADDITIONAL_PORTS,
    SERVICE_SUBDOMAIN_PREFIXES,
    SERVICE_PROTOCOLS,
    DOCKER_NETWORK,
    MC_SUBDOMAIN_PREFIX,
    LOG_POLL_INTERVAL,
    SERVER_START_DELAY,
    SERVER_STOP_TIMEOUT,
    CLIPBOARD_NOTIFICATION_DURATION,
    STATUS_POLL_INTERVAL,
    MAX_FILE_SIZE,
    UPLOAD_TIMEOUT,
    FORM_PARSE_TIMEOUT,
    UPLOAD_TEMP_DIR,
    DOCKER_IMAGES,
    SERVER_TYPES,
    COMMON_COMMANDS,
    LOG_TYPES,
    DATA_DIR,
    SERVERS_DIR_NAME,
    CONFIG_FILE_NAME,
    SUBDOMAIN_REGEX,
    MAX_SUBDOMAIN_LENGTH,
    MIN_SERVER_NAME_LENGTH,
    MAX_SERVER_NAME_LENGTH,
  };
}
