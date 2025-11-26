const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
require('dotenv').config({ path: './data.env' });

const app = express();
const PORT = 3000;

// --------------------
// DATABASE CONNECTION
// --------------------
mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.mkecynt.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`
)
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("MongoDB connection error:", err));

// --------------------
// MODELS
// --------------------
const User = require('./model/user');
const Stock = require('./model/stock');
const Transaction = require('./model/transaction');

// --------------------
// VIEW ENGINE
// --------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --------------------
// MIDDLEWARE
// --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false
}));

// --------------------
// AUTH MIDDLEWARES
// --------------------
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  res.send("Access Denied: Admins Only");
}

function isUser(req, res, next) {
  if (req.session.user && req.session.user.role === "user") return next();
  res.send("Access Denied: Users Only");
}

// --------------------
// HELPER FUNCTION
// --------------------
async function getSessionUser(req) {
  if (!req.session.user) return null;
  const user = await User.findOne({ username: req.session.user.username });
  if (!user) return null;

  // Update session to ensure correct name and cash balance
  req.session.user.name = `${user.firstName} ${user.lastName}`;
  req.session.user.cashBalance = user.cashBalance || 100;

  return req.session.user;
}

// --------------------
// ROUTES
// --------------------

// Home
app.get('/', (req, res) => res.redirect('/login'));

// Login / Signup / Forgot Password pages
app.get('/login', async (req, res) => {
  const user = await getSessionUser(req);
  res.render('login', { user, error: null, success: null });
});
app.get('/signup', async (req, res) => {
  const user = await getSessionUser(req);
  res.render('signup', { user, error: null });
});
app.get('/forgot-password', async (req, res) => {
  const user = await getSessionUser(req);
  res.render('forgot-password', { user, error: null });
});

// --------------------
// ADMIN ROUTES
// --------------------

// Admin dashboard
app.get('/admin-dashboard', isAdmin, async (req, res) => {
  const user = await getSessionUser(req);
  const stocks = await Stock.find();
  const marketInfo = getMarketStatus();

  res.render('admin-dashboard', { 
    user,
    stocks,
    marketStatus: marketInfo.status,
    nextOpen: marketInfo.nextOpen
  });
});

// Add stock page
app.get('/add-stocks', isAdmin, async (req, res) => { 
  const user = await getSessionUser(req);
  res.render('add-stocks', { user, error: null });
});

// Add stock POST
app.post('/add-stocks', isAdmin, async (req, res) => {
  const user = await getSessionUser(req);
  try {
    const { name, price, quantity } = req.body;
    if (!name || !price || !quantity) {
      return res.render('add-stocks', { user, error: "All fields are required" });
    }
    const newStock = new Stock({ name, price, quantity, createdAt: new Date() });
    await newStock.save();
    res.redirect('/admin-dashboard');
  } catch (err) {
    console.error("Error creating stock:", err);
    return res.render('add-stocks', { user, error: "Error creating stock" });
  }
});

// Admin history
app.get('/admin-history', isAdmin, async (req, res) => {
  const user = await getSessionUser(req);
  try {
    const stocks = await Stock.find().sort({ createdAt: -1 });
    res.render('admin-history', { user, stocks });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Delete stock
app.post('/admin/delete-stock/:id', isAdmin, async (req, res) => {
  try {
    const stockId = req.params.id;
    await Stock.findByIdAndDelete(stockId);
    await User.updateMany({}, { $pull: { portfolio: { stockId: stockId } } });
    res.redirect('/admin-dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting stock");
  }
});

// --------------------
// USER ROUTES
// --------------------

// User dashboard
app.get('/dashboard', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  const dbUser = await User.findOne({ username: user.username }).populate('portfolio.stockId');
  const stocks = await Stock.find();

  let portfolioValue = 0;
  let portfolio = [];

  if (dbUser.portfolio && dbUser.portfolio.length > 0) {
    portfolio = dbUser.portfolio.map(item => {
      const stockValue = item.shares * item.stockId.price;
      portfolioValue += stockValue;
      return { symbol: item.stockId.name, shares: item.shares, price: item.stockId.price, value: stockValue };
    });
  }

  const cashBalance = dbUser.cashBalance || 100;
  const totalValue = cashBalance + portfolioValue;

  res.render('dashboard', { user, stocks, portfolio, cashBalance, portfolioValue, totalValue });
});

// Wallet
app.get('/wallet', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  res.render('wallet', { user, error: null });
});

// --------------------
// DEPOSIT AND WITHDRAW
// --------------------

// Deposit
app.post('/deposit', isUser, async (req, res) => {
  try {
    const dbUser = await User.findOne({ username: req.session.user.username });
    if (!dbUser) return res.redirect('/login');

    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      const user = await getSessionUser(req);
      return res.render('wallet', { user, error: "Invalid deposit amount" });
    }

    dbUser.cashBalance = (dbUser.cashBalance || 100) + amount;

    if (!dbUser.history) dbUser.history = [];
    dbUser.history.push({ type: "Deposit", amount, date: new Date() });

    await dbUser.save();

    req.session.user.cashBalance = dbUser.cashBalance;

    res.redirect('/wallet');
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Withdraw
app.post('/withdraw', isUser, async (req, res) => {
  try {
    const dbUser = await User.findOne({ username: req.session.user.username });
    if (!dbUser) return res.redirect('/login');

    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      const user = await getSessionUser(req);
      return res.render('wallet', { user, error: "Invalid withdraw amount" });
    }

    if ((dbUser.cashBalance || 100) < amount) {
      const user = await getSessionUser(req);
      return res.render('wallet', { user, error: "Insufficient balance" });
    }

    dbUser.cashBalance -= amount;

    if (!dbUser.history) dbUser.history = [];
    dbUser.history.push({ type: "Withdraw", amount, date: new Date() });

    await dbUser.save();

    req.session.user.cashBalance = dbUser.cashBalance;

    res.redirect('/wallet');
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Portfolio
app.get('/portfolio', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  const dbUser = await User.findOne({ username: user.username }).populate('portfolio.stockId');

  const portfolio = dbUser.portfolio.map(item => ({
    symbol: item.stockId.name,
    shares: item.shares,
    price: item.stockId.price,
    value: item.shares * item.stockId.price
  }));

  const totalValue = portfolio.reduce((sum, item) => sum + item.value, 0) + (dbUser.cashBalance || 100);
  res.render('portfolio', { user, portfolio, cashBalance: dbUser.cashBalance || 100, totalValue });
});

// History
app.get('/history', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  const dbUser = await User.findOne({ username: user.username });
  const history = dbUser.history || [];
  res.render("history", { user, history });
});

// --------------------
// BUY STOCK
// --------------------
app.post('/buy/:id', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  const dbUser = await User.findOne({ username: user.username });
  const stock = await Stock.findById(req.params.id);

  if (!stock || stock.quantity <= 0) return res.send("Out of stock");
  if ((dbUser.cashBalance || 100) < stock.price) return res.send("Not enough balance");

  stock.quantity -= 1;
  await stock.save();

  dbUser.cashBalance -= stock.price;

  const owned = dbUser.portfolio.find(p => String(p.stockId) === String(stock._id));
  if (owned) {
    owned.shares += 1;
  } else {
    dbUser.portfolio.push({ stockId: stock._id, shares: 1 });
  }

  if (!dbUser.history) dbUser.history = [];
  dbUser.history.push({ type: "Buy", amount: stock.price, date: new Date(), stockName: stock.name, shares: 1 });

  await dbUser.save();
  req.session.user.cashBalance = dbUser.cashBalance;

  res.redirect('/dashboard');
});

// --------------------
// SELL STOCK
// --------------------
app.post('/sell/:symbol', isUser, async (req, res) => {
  const user = await getSessionUser(req);
  const dbUser = await User.findOne({ username: user.username }).populate('portfolio.stockId');
  const stock = await Stock.findOne({ name: req.params.symbol });

  if (!stock) return res.send("Stock not found");

  const owned = dbUser.portfolio.find(p => String(p.stockId._id) === String(stock._id));
  if (!owned) return res.send("You do not own this stock");

  owned.shares -= 1;
  if (owned.shares <= 0) {
    dbUser.portfolio = dbUser.portfolio.filter(p => String(p.stockId._id) !== String(stock._id));
  }

  dbUser.cashBalance += stock.price;

  if (!dbUser.history) dbUser.history = [];
  dbUser.history.push({ type: "Sell", amount: stock.price, date: new Date(), stockName: stock.name, shares: 1 });

  await dbUser.save();
  req.session.user.cashBalance = dbUser.cashBalance;

  res.redirect('/portfolio');
});

// --------------------
// AUTH ROUTES
// --------------------

// Signup
app.post('/signup', async (req, res) => {
  const { firstName, lastName, username, email, password, confirmPassword } = req.body;
  if (!firstName || !lastName || !username || !email || !password)
    return res.render('signup', { user: req.session.user, error: "All fields are required" });
  if (password !== confirmPassword)
    return res.render('signup', { user: req.session.user, error: "Passwords do not match" });

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser)
      return res.render('signup', { user: req.session.user, error: "Username or Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword,
      cashBalance: 100 // Start cash balance
    });
    await newUser.save();

    res.render('login', { user: req.session.user, success: "Account created! Please log in.", error: null });
  } catch (err) {
    console.error(err);
    res.render('signup', { user: req.session.user, error: "Error creating account." });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const dbUser = await User.findOne({ username });
    if (!dbUser) return res.render('login', { user: req.session.user, error: 'User not found', success: null });

    const passwordMatch = await bcrypt.compare(password, dbUser.password);
    if (!passwordMatch) return res.render('login', { user: req.session.user, error: 'Incorrect password', success: null });

    req.session.user = {
      name: `${dbUser.firstName} ${dbUser.lastName}`,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role,
      cashBalance: dbUser.cashBalance || 100
    };

    if (dbUser.role === "admin") return res.redirect('/admin-dashboard');
    return res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { user: req.session.user, error: 'Something went wrong', success: null });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// --------------------
// MARKET STATUS
// --------------------
function getMarketStatus() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const holidays = ["2025-01-01","2025-07-04","2025-12-25"];
  const todayStr = now.toISOString().split('T')[0];

  if (holidays.includes(todayStr)) return { status: "Closed (Holiday)", nextOpen: "Tomorrow 9 AM" };
  if (day === 0 || day === 6) return { status: "Closed (Weekend)", nextOpen: "Monday 9 AM" };
  if (hour < 9) return { status: "Closed", nextOpen: "Today 9 AM" };
  if (hour >= 17) return { status: "Closed", nextOpen: "Tomorrow 9 AM" };

  return { status: "Open", nextOpen: null };
}

// --------------------
// START SERVER
// --------------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
