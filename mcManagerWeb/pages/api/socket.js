import { Server } from 'socket.io';
import { initialize } from '../../lib/docker-server-manager';

const SocketHandler = (req, res) => {
  // Se Socket.IO è già inizializzato, rispondi con successo
  if (res.socket.server.io) {
    console.log('Socket.IO già inizializzato');
    res.status(200).json({ success: true, message: 'Socket.IO already running' });
    return;
  }

  console.log('Inizializzazione Socket.IO...');

  try {
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      transports: ['websocket', 'polling'],
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: false
      },
      allowEIO3: true
    });

    res.socket.server.io = io;

    // Rendi io disponibile globalmente
    global.io = io;

    io.on('connection', (socket) => {
      console.log('Client Socket.IO connesso:', socket.id);

      socket.on('disconnect', () => {
        console.log('Client Socket.IO disconnesso:', socket.id);
      });

      socket.on('error', (error) => {
        console.error('Socket.IO errore:', error);
      });
    });

    io.on('error', (error) => {
      console.error('Socket.IO server errore:', error);
    });

    // Inizializza i dati del server manager
    initialize();

    console.log('Socket.IO avviato');
    res.status(200).json({ success: true, message: 'Socket.IO initialized' });
  } catch (error) {
    console.error('Errore inizializzazione Socket.IO:', error);
    res.status(500).json({ error: 'Failed to initialize Socket.IO', details: error.message });
  }
};

// Disabilita body parsing per Socket.IO
export const config = {
  api: {
    bodyParser: false,
  },
};

export default SocketHandler;
