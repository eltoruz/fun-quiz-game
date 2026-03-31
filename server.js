const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Auto-create scores table on startup
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scores (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                score INTEGER NOT NULL,
                category VARCHAR(255) DEFAULT 'umum',
                correct INTEGER DEFAULT 0,
                total INTEGER DEFAULT 0,
                stars INTEGER DEFAULT 0,
                date TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Database ready!');
    } catch (err) {
        console.error('❌ Database init error:', err.message);
    }
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// GET all scores
app.get('/api/scores', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scores ORDER BY score DESC LIMIT 50');
        res.json(result.rows);
    } catch (e) {
        console.error('GET /api/scores error:', e.message);
        res.json([]);
    }
});

// POST new score
app.post('/api/scores', async (req, res) => {
    try {
        const { name, score, category, correct, total, stars, date } = req.body;
        if (!name || score === undefined) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        await pool.query(
            'INSERT INTO scores (name, score, category, correct, total, stars, date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [name, score, category || 'umum', correct || 0, total || 0, stars || 0, date || new Date().toISOString()]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/scores error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE all scores
app.delete('/api/scores', async (req, res) => {
    try {
        await pool.query('DELETE FROM scores');
        res.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/scores error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🌟 Kuis Pintar server running at http://localhost:${PORT}`);
    });
});
