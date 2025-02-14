// server.js
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = { products: [], orders: [], carts: [] };
const db = new Low(adapter, defaultData);

// Product Routes
app.get('/products', async (req, res) => {
    await db.read();
    const { category, inStock } = req.query;
    let products = db.data.products;

    if (category) {
        products = products.filter(p => p.category === category);
    }
    if (inStock !== undefined) {
        const inStockBool = inStock === 'true';
        products = products.filter(p => p.inStock === inStockBool);
    }

    res.json(products);
});

app.get('/products/:id', async (req, res) => {
    await db.read();
    const product = db.data.products.find(p => p.id === req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
});

app.post('/products', async (req, res) => {
    await db.read();
    const newProduct = {
        id: Date.now().toString(),
        ...req.body
    };
    db.data.products.push(newProduct);
    await db.write();
    res.status(201).json(newProduct);
});

app.put('/products/:id', async (req, res) => {
    await db.read();
    const index = db.data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }
    db.data.products[index] = { ...db.data.products[index], ...req.body };
    await db.write();
    res.json(db.data.products[index]);
});

app.delete('/products/:id', async (req, res) => {
    await db.read();
    const index = db.data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }
    db.data.products.splice(index, 1);
    await db.write();
    res.json({ message: 'Product deleted successfully' });
});

// Order Routes
app.post('/orders', async (req, res) => {
    await db.read();
    const { userId, products } = req.body;
    
    const order = {
        id: Date.now().toString(),
        userId,
        products,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    db.data.orders.push(order);
    await db.write();
    res.status(201).json(order);
});

app.get('/orders/:userId', async (req, res) => {
    await db.read();
    const orders = db.data.orders.filter(o => o.userId === req.params.userId);
    res.json(orders);
});

// Cart Routes
app.post('/cart/:userId', async (req, res) => {
    await db.read();
    const { productId, quantity } = req.body;
    let cart = db.data.carts.find(c => c.userId === req.params.userId);
    
    if (!cart) {
        cart = {
            userId: req.params.userId,
            items: []
        };
        db.data.carts.push(cart);
    }

    const existingItem = cart.items.find(item => item.productId === productId);
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.items.push({ productId, quantity });
    }

    await db.write();
    res.json(cart);
});

app.get('/cart/:userId', async (req, res) => {
    await db.read();
    const cart = db.data.carts.find(c => c.userId === req.params.userId);
    if (!cart) {
        return res.json({ userId: req.params.userId, items: [] });
    }
    res.json(cart);
});

app.delete('/cart/:userId/item/:productId', async (req, res) => {
    await db.read();
    const cart = db.data.carts.find(c => c.userId === req.params.userId);
    if (!cart) {
        return res.status(404).json({ error: 'Cart not found' });
    }
    
    cart.items = cart.items.filter(item => item.productId !== req.params.productId);
    await db.write();
    res.json(cart);
});

// Root route for testing
app.get('/', (req, res) => {
    res.json({ message: 'E-commerce API is running' });
});

// Start server
app.listen(port, () => {
    console.log(`E-commerce server running on http://localhost:${port}`);
});