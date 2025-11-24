
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Support large payloads for images

// Initialize Database
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        users: [{ username: 'admin', password: 'admin', golfCourse: '관리자' }],
        fertilizers: {},
        logs: {},
        settings: {},
        notificationSettings: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Helper to read/write DB
const readDB = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], fertilizers: {}, logs: {}, settings: {}, notificationSettings: {} };
    }
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- Routes ---

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Users
app.post('/api/users', (req, res) => {
    const { username, password, golfCourse } = req.body;
    if (!username || !password || !golfCourse) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    const db = readDB();
    if (db.users.some(u => u.username === username)) {
        return res.status(409).json({ error: 'User exists' });
    }
    const newUser = { username, password, golfCourse };
    db.users.push(newUser);
    writeDB(db);
    const { password: _, ...userWithoutPassword } = newUser;
    res.json(userWithoutPassword);
});

app.get('/api/users/:username', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.username === req.params.username);
    if (user) {
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.delete('/api/users/:username', (req, res) => {
    const db = readDB();
    const username = req.params.username;
    db.users = db.users.filter(u => u.username !== username);
    delete db.fertilizers[username];
    delete db.logs[username];
    delete db.settings[username];
    delete db.notificationSettings[username];
    writeDB(db);
    res.json({ success: true });
});

// Fertilizers
app.get('/api/fertilizers', (req, res) => {
    const { username } = req.query;
    const db = readDB();
    res.json(db.fertilizers[username] || []);
});

app.post('/api/fertilizers', (req, res) => {
    const { username, fertilizers } = req.body;
    const db = readDB();
    db.fertilizers[username] = fertilizers;
    writeDB(db);
    res.json({ success: true });
});

// Logs
app.get('/api/logs', (req, res) => {
    const { username } = req.query;
    const db = readDB();
    res.json(db.logs[username] || []);
});

app.post('/api/logs', (req, res) => {
    const { username, logs } = req.body;
    const db = readDB();
    db.logs[username] = logs;
    writeDB(db);
    res.json({ success: true });
});

// Settings
app.get('/api/settings', (req, res) => {
    const { username } = req.query;
    const db = readDB();
    res.json(db.settings[username] || {});
});

app.post('/api/settings', (req, res) => {
    const { username, settings } = req.body;
    const db = readDB();
    db.settings[username] = settings;
    writeDB(db);
    res.json({ success: true });
});

// Notifications
app.get('/api/notifications', (req, res) => {
    const { username } = req.query;
    const db = readDB();
    res.json(db.notificationSettings[username] || { enabled: false, email: '', threshold: 10 });
});

app.post('/api/notifications', (req, res) => {
    const { username, settings } = req.body;
    const db = readDB();
    db.notificationSettings[username] = settings;
    writeDB(db);
    res.json({ success: true });
});

// Admin: Get All User Data
app.get('/api/admin/users-data', (req, res) => {
    const db = readDB();
    const allData = [];
    
    for (const user of db.users) {
        if (user.username === 'admin') continue;
        const logs = db.logs[user.username] || [];
        const fertilizers = db.fertilizers[user.username] || [];
        const totalCost = logs.reduce((sum, entry) => sum + (entry.totalCost || 0), 0);
        let lastActivity = null;
        if (logs.length > 0) {
            lastActivity = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date;
        }

        allData.push({
            username: user.username,
            golfCourse: user.golfCourse || '미지정',
            logCount: logs.length,
            totalCost,
            lastActivity,
            logs: logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            fertilizers,
        });
    }
    res.json(allData);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Server running on port ${PORT}`);
    console.log(`Data saved to ${DB_FILE}`);
});
