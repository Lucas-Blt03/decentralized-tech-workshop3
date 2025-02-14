// dns-registry-redundant.js
import express from 'express';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Store for registered servers with health check status
const servers = new Map();

// Health check function
async function checkServerHealth(url) {
    try {
        const response = await fetch(`${url}/`);
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Periodic health checks
setInterval(async () => {
    for (const [url, server] of servers.entries()) {
        const isHealthy = await checkServerHealth(url);
        server.healthy = isHealthy;
        server.lastCheck = new Date();
        console.log(`Health check for ${url}: ${isHealthy ? 'Healthy' : 'Unhealthy'}`);
    }
}, 10000); // Check every 10 seconds

// Register a server
app.post('/register', async (req, res) => {
    const { serverUrl } = req.body;
    if (!serverUrl) {
        return res.status(400).json({
            code: 400,
            error: 'Server URL is required'
        });
    }

    const isHealthy = await checkServerHealth(serverUrl);
    servers.set(serverUrl, {
        url: serverUrl,
        healthy: isHealthy,
        lastCheck: new Date(),
        registeredAt: new Date()
    });

    console.log(`Registered server: ${serverUrl}, Health: ${isHealthy}`);
    res.json({
        code: 200,
        message: 'Server registered successfully',
        health: isHealthy
    });
});

// Get an available server (with load balancing)
app.get('/getServer', (req, res) => {
    const availableServers = Array.from(servers.entries())
        .filter(([_, server]) => server.healthy)
        .map(([url]) => url);

    if (availableServers.length === 0) {
        return res.status(503).json({
            code: 503,
            error: 'No healthy servers available'
        });
    }

    // Simple round-robin load balancing
    const server = availableServers[Math.floor(Math.random() * availableServers.length)];
    
    res.json({
        code: 200,
        server: server
    });
});

// List all servers with their health status
app.get('/servers', (req, res) => {
    const serverList = Array.from(servers.entries()).map(([url, server]) => ({
        url,
        healthy: server.healthy,
        lastCheck: server.lastCheck,
        registeredAt: server.registeredAt
    }));

    res.json({
        code: 200,
        servers: serverList
    });
});

app.listen(port, () => {
    console.log(`DNS Registry with health checks running on http://localhost:${port}`);
});