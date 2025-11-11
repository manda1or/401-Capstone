const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    type: String,       // 'Deposit', 'Buy', 'Sell'
    amount: Number,
    date: Date
});

module.exports = mongoose.model('Transaction', transactionSchema);
