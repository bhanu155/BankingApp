// userService.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/bankingApp', { useNewUrlParser: true, useUnifiedTopology: true });

// User schema
const userSchema = new mongoose.Schema({
    userId: String,
    password: String,
    name: String,
    email: String
});
const User = mongoose.model('User', userSchema);

// Endpoint to register a user
app.post('/register', async (req, res) => {
    const newUser = new User(req.body);
    await newUser.save();
    res.json({ message: 'User registered successfully' });
});

// Endpoint to login and generate JWT
app.post('/login', async (req, res) => {
    const user = await User.findOne({ userId: req.body.userId, password: req.body.password });
    if (user) {
        const token = jwt.sign({ userId: user.userId }, 'secretKey');
        res.json({ token });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.listen(3001, () => console.log('User Service running on port 3001'));
