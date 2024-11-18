// accountService.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/bankingApp', { useNewUrlParser: true, useUnifiedTopology: true });

// Account schema
const accountSchema = new mongoose.Schema({
    userId: String,
    balance: Number,
});
const Account = mongoose.model('Account', accountSchema);

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

// Endpoint to get account balance
app.get('/balance', authenticateToken, async (req, res) => {
    const account = await Account.findOne({ userId: req.user.userId });
    if (account) {
        res.json({ balance: account.balance });
    } else {
        res.status(404).json({ message: 'Account not found' });
    }
});

// Endpoint to create an account
app.post('/create-account', authenticateToken, async (req, res) => {
    const newAccount = new Account(req.body);
    await newAccount.save();
    res.json({ message: `Account created successfully for userId ${newAccount.userId} with starting balance ${newAccount.balance}` });
});

app.listen(3002, () => console.log('Account Service running on port 3002'));
