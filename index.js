const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Agent tokens - each agent gets a unique token
const AGENT_TOKENS = {
  'rhodes': process.env.RHODES_TOKEN || 'rhodes-dev-token',
  'chadly': process.env.CHADLY_TOKEN || 'chadly-dev-token'
};

// Message store (in production, use Redis or a DB)
const messageQueue = {
  chadly: [],
  rhodes: []
};

// Verify agent token
function verifyToken(token) {
  for (const [agent, agentToken] of Object.entries(AGENT_TOKENS)) {
    if (agentToken === token) return agent;
  }
  return null;
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    service: 'agent-relay',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      'POST /send': 'Send a message to another agent',
      'GET /messages': 'Retrieve messages for your agent',
      'GET /health': 'Health check'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Send a message to another agent
app.post('/send', (req, res) => {
  const token = req.headers['x-agent-token'];
  const { to, message } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Missing x-agent-token header' });
  }

  const fromAgent = verifyToken(token);
  if (!fromAgent) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!to || !message) {
    return res.status(400).json({ error: 'Missing "to" or "message" in request body' });
  }

  const targetAgent = to.toLowerCase();
  if (!messageQueue[targetAgent]) {
    return res.status(404).json({ error: `Unknown agent: ${to}` });
  }

  const msg = {
    id: crypto.randomUUID(),
    from: fromAgent,
    to: targetAgent,
    message: message,
    timestamp: new Date().toISOString()
  };

  messageQueue[targetAgent].push(msg);
  
  console.log(`[${msg.timestamp}] ${fromAgent} -> ${targetAgent}: ${message.substring(0, 100)}...`);
  
  res.json({ 
    success: true, 
    messageId: msg.id,
    queued: messageQueue[targetAgent].length
  });
});

// Retrieve messages for an agent
app.get('/messages', (req, res) => {
  const token = req.headers['x-agent-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing x-agent-token header' });
  }

  const agent = verifyToken(token);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const messages = messageQueue[agent] || [];
  // Clear after retrieval (acknowledge)
  const clear = req.query.clear !== 'false';
  
  if (clear) {
    messageQueue[agent] = [];
  }

  res.json({ 
    agent,
    count: messages.length,
    messages 
  });
});

// Peek at messages without clearing
app.get('/messages/peek', (req, res) => {
  const token = req.headers['x-agent-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing x-agent-token header' });
  }

  const agent = verifyToken(token);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const messages = messageQueue[agent] || [];
  res.json({ 
    agent,
    count: messages.length,
    messages 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent Relay service running on port ${PORT}`);
  console.log(`Registered agents: ${Object.keys(AGENT_TOKENS).join(', ')}`);
});
