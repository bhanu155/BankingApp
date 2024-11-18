const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const app = express();
app.use(express.json());

// Redis connection
const redisConnection = new IORedis({
    maxRetriesPerRequest: null, // Required by BullMQ to prevent automatic retries
}); // Connects to Redis running on default localhost:6379


// bull board at http://localhost:3003/admin/queues
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// BullMQ queue for transactions
const transactionQueue = new Queue('transactionQueue', { connection: redisConnection });

// Initialize the server adapter for the Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Create Bull Board
createBullBoard({
    queues: [new BullMQAdapter(transactionQueue)],
    serverAdapter: serverAdapter,
});

// Use Bull Board in the Express app
app.use('/admin/queues', serverAdapter.getRouter());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/bankingApp', { useNewUrlParser: true, useUnifiedTopology: true });

// Account schema
const accountSchema = new mongoose.Schema({
    userId: String,
    balance: Number,
});
const Account = mongoose.model('Account', accountSchema);

// Transaction schema
const transactionSchema = new mongoose.Schema({
    fromUserId: String,
    toUserId: String,
    amount: Number,
    date: { type: Date, default: Date.now },
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'].split(" ")[1];
    if (!token) return res.status(403).json({ message: 'Access denied - No JWT token' });

    jwt.verify(token, 'secretKey', (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Endpoint to perform a transaction (adds transaction job to the queue)
app.post('/transfer', authenticateToken, async (req, res) => {
    const { fromUserId, toUserId, amount } = req.body;

    // Only allow transactions initiated by the authenticated user
    if (req.user.userId !== fromUserId) {
        return res.status(403).json({ message: 'Unauthorized transaction' });
    }

    // Add transaction details as a job to the queue
    await transactionQueue.add('processTransaction', { fromUserId, toUserId, amount });

    res.json({ status: 'Queued', message: 'Transaction has been added to the queue for processing' });
});

// Worker to process queued transactions
const transactionWorker = new Worker('transactionQueue', async job => {
    const { fromUserId, toUserId, amount } = job.data;

    const fromAccount = await Account.findOne({ userId: fromUserId });
    const toAccount = await Account.findOne({ userId: toUserId });

    if (fromAccount && toAccount && fromAccount.balance >= amount) {
        // Update balances
        fromAccount.balance -= amount;
        toAccount.balance += amount;
        
        await fromAccount.save();
        await toAccount.save();

        // Record transaction
        const transaction = new Transaction({ fromUserId, toUserId, amount });
        await transaction.save();

        await transactionQueue.add('sendNotification', { fromUserId, toUserId, amount });
        
        console.log(`Transaction from ${fromUserId} to ${toUserId} for amount ${amount} processed successfully.`);
    } else {
        console.log(`Failed transaction from ${fromUserId} to ${toUserId}: Insufficient funds or invalid accounts.`);
        throw new Error('Insufficient funds or invalid accounts');
    }
}, { connection: redisConnection });

// Log errors from the worker
transactionWorker.on('failed', (job, err) => {
    console.error(`Job failed for transaction from ${job.data.fromUserId} to ${job.data.toUserId}:`, err.message);
});

app.listen(3003, () => console.log('Transaction Service running on port 3003'));
