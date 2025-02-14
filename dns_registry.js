const express = require('express');
const app = express();
const port = 3000;

// Add CORS and JSON middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Store registered servers
const servers = new Set();

// Root route
app.get('/', (req, res) => {
    res.json({
        code: 200,
        message: 'DNS Registry Server',
        endpoints: {
            'GET /': 'This info',
            'GET /getServer': 'Get a server URL',
            'GET /servers': 'List all registered servers',
            'POST /register': 'Register a new server'
        }
    });
});

// Register a server
app.post('/register', (req, res) => {
    const { serverUrl } = req.body;
    if (!serverUrl) {
        return res.status(400).json({
            code: 400,
            error: 'Server URL is required'
        });
    }
    
    servers.add(serverUrl);
    console.log(`Registered server: ${serverUrl}`);
    res.json({
        code: 200,
        message: 'Server registered successfully'
    });
});

// Get a server
app.get('/getServer', (req, res) => {
    const server = Array.from(servers)[0] || 'localhost:3001';
    
    res.json({
        code: 200,
        server: server
    });
});

// List all registered servers
app.get('/servers', (req, res) => {
    res.json({
        code: 200,
        servers: Array.from(servers)
    });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`DNS Registry running on http://localhost:${port}`);
    console.log('Available routes:');
    console.log('  GET  /');
    console.log('  GET  /getServer');
    console.log('  GET  /servers');
    console.log('  POST /register');
});