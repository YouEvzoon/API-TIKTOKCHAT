const express = require('express');

function createStreamerRoutes(manager) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      streamerCount: manager.list().length,
      streamers: manager.list()
    });
  });

  router.get('/streamers', (req, res) => {
    res.json(manager.list());
  });

  router.post('/streamers', async (req, res) => {
    const body = req.body || {};
    const autoConnect = body.autoConnect !== false;
    const result = manager.create(body);

    if (result.error) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }

    if (autoConnect) {
      await manager.connect(result.streamer, 'api-create');
    }

    res.status(201).json({ ok: true, streamer: manager.toSummary(result.streamer) });
  });

  router.delete('/streamers/:id', async (req, res) => {
    const removed = await manager.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.json({ ok: true, removed: removed.id });
  });

  router.post('/streamers/:id/connect', async (req, res) => {
    const streamer = await manager.connectById(req.params.id, 'api-connect');
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.json({ ok: true, streamer: manager.toSummary(streamer) });
  });

  router.post('/streamers/:id/disconnect', async (req, res) => {
    const streamer = await manager.disconnectById(req.params.id, 'api-disconnect');
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.json({ ok: true, streamer: manager.toSummary(streamer) });
  });

  router.get('/streamers/:id/messages', (req, res) => {
    const streamer = manager.get(req.params.id);
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.json(streamer.recentMessages);
  });

  router.get('/streamers/:id/top-taps', (req, res) => {
    const streamer = manager.get(req.params.id);
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.json(manager.getTopTaps(streamer));
  });

  router.post('/streamers/:id/speak', (req, res) => {
    const streamer = manager.get(req.params.id);
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.status(501).json({ ok: false, error: 'tts moved to frontend' });
  });

  router.get('/messages', (req, res) => {
    const streamer = manager.getDefault();
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'no streamer configured' });
      return;
    }

    res.json(streamer.recentMessages);
  });

  router.post('/speak', (req, res) => {
    const requestedId = req.body && req.body.streamerId;
    const streamer = requestedId ? manager.get(requestedId) : manager.getDefault();
    if (!streamer) {
      res.status(404).json({ ok: false, error: 'streamer not found' });
      return;
    }

    res.status(501).json({ ok: false, error: 'tts moved to frontend' });
  });

  return router;
}

module.exports = {
  createStreamerRoutes
};