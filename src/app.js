const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { StreamerManager } = require('./services/streamerManager');
const { createStreamerRoutes } = require('./routes/streamers');
const { apiKey, autoBootstrapUsers, chatPollIntervalMs, initialUsernames, initialUsername, port, normalizeText } = require('./config');

const manager = new StreamerManager();

function authMiddleware(req, res, next) {
  if (!apiKey) {
    next();
    return;
  }

  const provided = normalizeText(req.get('x-api-key') || req.query.apiKey);
  if (!provided || provided !== apiKey) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  next();
}

function parseInitialUsernames() {
  if (initialUsernames) {
    return initialUsernames.split(',').map(value => value.trim()).filter(Boolean);
  }

  return initialUsername ? [initialUsername] : [];
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/config', (req, res) => {
    res.json({
      chatPollIntervalMs
    });
  });
  app.use(authMiddleware);
  app.use(createStreamerRoutes(manager));
  return app;
}

function start() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*'
    }
  });

  io.use((socket, next) => {
    if (!apiKey) {
      next();
      return;
    }

    const provided = normalizeText(
      (socket.handshake.auth && socket.handshake.auth.apiKey)
      || (socket.handshake.headers && socket.handshake.headers['x-api-key'])
      || (socket.handshake.query && socket.handshake.query.apiKey)
    );

    if (!provided || provided !== apiKey) {
      next(new Error('unauthorized'));
      return;
    }

    next();
  });

  io.on('connection', socket => {
    socket.on('streamer:subscribe', streamerId => {
      const safeId = normalizeText(streamerId);
      if (!safeId) {
        return;
      }
      socket.join(`streamer:${safeId}`);
    });

    socket.on('streamer:unsubscribe', streamerId => {
      const safeId = normalizeText(streamerId);
      if (!safeId) {
        return;
      }
      socket.leave(`streamer:${safeId}`);
    });
  });

  manager.onChat(message => {
    io.emit('chat:new', message);
    io.to(`streamer:${message.streamerId}`).emit('streamer:chat', message);
  });

  manager.onLike(message => {
    io.emit('like:new', message);
    io.to(`streamer:${message.streamerId}`).emit('streamer:like', message);
  });

  server.listen(port, () => {
    console.log(`API local lista en http://localhost:${port}`);
    if (apiKey) {
      console.log('API key activa. Usa header x-api-key para autenticar.');
    }

    const usernames = parseInitialUsernames();
    if (!autoBootstrapUsers || usernames.length === 0) {
      if (!autoBootstrapUsers) {
        console.log('Auto-arranque desactivado. Usa POST /streamers o la UI web para conectar usuarios manualmente.');
      }
      console.warn('No hay streamers iniciales. Usa POST /streamers para agregarlos.');
      return;
    }

    manager.bootstrap(usernames);
  });
}

module.exports = {
  createApp,
  start,
  manager
};