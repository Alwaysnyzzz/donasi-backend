const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.PAKASIR_API_KEY;
const PROJECT_SLUG = process.env.PROJECT_SLUG;
const DATA_FILE = path.join(__dirname, 'data', 'transactions.json');

// Middleware
app.use(cors());
app.use(express.json());

// Pastikan folder data dan file JSON ada
async function ensureDataFile() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        try {
            await fs.access(DATA_FILE);
        } catch {
            await fs.writeFile(DATA_FILE, '[]', 'utf8');
        }
    } catch (err) {
        console.error('Error creating data file:', err);
    }
}
ensureDataFile();

// Helper: baca transaksi
async function readTransactions() {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

// Helper: tulis transaksi
async function writeTransactions(transactions) {
    await fs.writeFile(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf8');
}

// Endpoint root untuk tes
app.get('/', (req, res) => {
    res.send('Backend donasi berjalan!');
});

// Endpoint create QRIS
app.post('/api/create-qris', async (req, res) => {
    const { amount, orderId } = req.body;
    if (!amount || !orderId) {
        return res.status(400).json({ error: 'Missing amount or orderId' });
    }

    try {
        const response = await axios.post(
            'https://app.pakasir.com/api/transactioncreate/qris',
            {
                project: PROJECT_SLUG,
                order_id: orderId,
                amount: amount,
                api_key: API_KEY
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const payment = response.data.payment;
        if (!payment || !payment.payment_number) {
            return res.status(500).json({ error: 'Invalid response from Pakasir' });
        }

        // Simpan transaksi ke file JSON
        const transactions = await readTransactions();
        const newTransaction = {
            id: orderId,
            amount: amount,
            payment_number: payment.payment_number,
            status: 'pending',
            created_at: new Date().toISOString(),
            expired_at: payment.expired_at
        };
        transactions.push(newTransaction);
        await writeTransactions(transactions);

        res.json({ success: true, payment });
    } catch (error) {
        console.error('Error creating transaction:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint check status
app.get('/api/check-status/:orderId', async (req, res) => {
    const orderId = req.params.orderId;

    try {
        const transactions = await readTransactions();
        const transaction = transactions.find(t => t.id === orderId);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const response = await axios.get(
            `https://app.pakasir.com/api/transactiondetail?project=${PROJECT_SLUG}&amount=${transaction.amount}&order_id=${orderId}&api_key=${API_KEY}`
        );

        const txData = response.data.transaction;
        if (txData) {
            transaction.status = txData.status;
            await writeTransactions(transactions);
        }

        res.json({ success: true, transaction: txData });
    } catch (error) {
        console.error('Error checking status:', error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint ambil detail transaksi (untuk halaman struk)
app.get('/api/transaction/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    const transactions = await readTransactions();
    const transaction = transactions.find(t => t.id === orderId);
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true, transaction });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});