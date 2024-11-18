const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const nodemailer = require('nodemailer');
const app = express();
app.use(express.json());

const fromMailId = "ssassignmentmailer@gmail.com"
const fromMailPassword = "breq spoq cxbv nbnn"

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/bankingApp', { useNewUrlParser: true, useUnifiedTopology: true });

// User schema
const userSchema = new mongoose.Schema({
    userId: String,
    password: String,
    name: String,
    email: String
});
const User = mongoose.model('User', userSchema);

// Redis connection
const redisConnection = new IORedis({
    maxRetriesPerRequest: null,
});

// Email configuration using nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: fromMailId,
        pass: fromMailPassword
    }
});

// Worker to listen for transaction completion
const notificationWorker = new Worker('transactionQueue', async job => {
    const { fromUserId, toUserId, amount } = job.data;

    try {
        // Retrieve user information from MongoDB
        const fromUser = await User.findOne({ userId: fromUserId });
        const toUser = await User.findOne({ userId: toUserId });

        if (!fromUser || !toUser) {
            console.error('User not found');
            return;
        }

        // Define email message
        const mailOptions = {
            from: fromMailId,
            to: fromUser.email,
            subject: 'Transaction Notification On your account',
            text: `You have successfully transferred ${amount} to ${toUser.name}.`
        };

        // Send email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(`Error sending email: ${error}`);
            } else {
                console.log(`Email sent: ${info.response}`);
            }
        });
        
        console.log(`Notification sent for transaction from ${fromUserId} (${fromMailId}) to ${toUserId} (${toUser.email}) for amount ${amount}.`);
    } catch (error) {
        console.error(`Error processing job: ${error.message}`);
    }
}, { connection: redisConnection });

// Log errors from the worker
notificationWorker.on('failed', (job, err) => {
    console.error(`Failed to send notification for transaction from ${job.data.fromUserId} to ${job.data.toUserId}:`, err.message);
});

app.listen(3004, () => console.log('Notification Service running on port 3004'));
