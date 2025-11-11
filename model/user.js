const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  username: String,
  email: String,
  password: String,
  role: { type: String, default: 'user' },

  portfolio: [
    {
      stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
      shares: { type: Number, default: 0 }
    }
  ],

  cashBalance: { type: Number, default: 10000 }, // start users with $10,000

  history: [
    {
      type: { type: String, required: true }, // e.g., "Deposit", "Buy"
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now }
    }
  ]

});

module.exports = mongoose.model('User', userSchema);


