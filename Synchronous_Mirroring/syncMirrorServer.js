// syncMirrorServer.js
import express from 'express';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SyncMirroredDB {
    constructor() {
        this.primaryAdapter = new JSONFile(join(__dirname, 'primary_db.json'));
        this.mirrorAdapter = new JSONFile(join(__dirname, 'mirror_db.json'));
        
        const defaultData = { 
            products: [], 
            orders: [], 
            carts: [] 
        };
        
        this.primaryDb = new Low(this.primaryAdapter, defaultData);
        this.mirrorDb = new Low(this.mirrorAdapter, defaultData);
        
        // Initialize both databases
        this.initializeDatabases();
    }

    async initializeDatabases() {
        try {
            // Ensure both databases exist with default data
            await this.primaryDb.write();
            await this.mirrorDb.write();
            console.log('Databases initialized successfully');
        } catch (error) {
            console.error('Error initializing databases:', error);
        }
    }

    async read() {
        try {
            await this.primaryDb.read();
            return this.primaryDb.data;
        } catch (error) {
            console.error('Error reading database:', error);
            throw error;
        }
    }

    async write(data) {
        try {
            // Update primary first
            this.primaryDb.data = data;
            await this.primaryDb.write();

            // Then immediately update mirror
            this.mirrorDb.data = JSON.parse(JSON.stringify(data));
            await this.mirrorDb.write();

            return true;
        } catch (error) {
            console.error('Error writing to databases:', error);
            throw error;
        }
    }

    async validateMirror() {
        try {
            await this.primaryDb.read();
            await this.mirrorDb.read();
            
            const primaryString = JSON.stringify(this.primaryDb.data);
            const mirrorString = JSON.stringify(this.mirrorDb.data);
            
            return primaryString === mirrorString;
        } catch (error) {
            console.error('Error validating mirror:', error);
            return false;
        }
    }

    async repair() {
        try {
            await this.primaryDb.read();
            this.mirrorDb.data = JSON.parse(JSON.stringify(this.primaryDb.data));
            await this.mirrorDb.write();
            console.log('Mirror database repaired successfully');
            return true;
        } catch (error) {
            console.error('Error repairing mirror:', error);
            return false;
        }
    }
}

const app = express();
const port = process.env.PORT || 3003;
const db = new SyncMirroredDB();

app.use(cors());
app.use(express.json());

// Database status endpoint
app.get('/db/status', async (req, res) => {
    const isValid = await db.validateMirror();
    res.json({
        status: isValid ? 'healthy' : 'inconsistent',
        primaryDb: 'connected',
        mirrorDb: 'connected',
        lastValidation: new Date().toISOString()
    });
});

// Repair endpoint
app.post('/db/repair', async (req, res) => {
    const success = await db.repair();
    res.json({
        success,
        message: success ? 'Database repaired successfully' : 'Repair failed',
        timestamp: new Date().toISOString()
    });
});

// Products endpoints
app.get('/products', async (req, res) => {
    try {
        const data = await db.read();
        res.json(data.products);
    } catch (error) {
        res.status(500).json({ error: 'Error reading products' });
    }
});

app.post('/products', async (req, res) => {
    try {
        const data = await db.read();
        const newProduct = {
            id: Date.now().toString(),
            ...req.body
        };
        data.products.push(newProduct);
        await db.write(data);
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(500).json({ error: 'Error creating product' });
    }
});

// Orders endpoints
app.post('/orders', async (req, res) => {
    try {
        const data = await db.read();
        const order = {
            id: Date.now().toString(),
            ...req.body,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        data.orders.push(order);
        await db.write(data);
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ error: 'Error creating order' });
    }
});

app.get('/orders/:userId', async (req, res) => {
    try {
        const data = await db.read();
        const orders = data.orders.filter(o => o.userId === req.params.userId);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error reading orders' });
    }
});

app.listen(port, () => {
    console.log(`Synchronous Mirroring Server running on http://localhost:${port}`);
});