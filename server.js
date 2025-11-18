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
// ROUTES
// --------------------

// Home
app.get('/', (req, res) => res.redirect('/login'));

// Login / Signup / Forgot Password pages
app.get('/login', (req, res) => res.render('login', { error: null, success: null }));
app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.get('/forgot-password', (req, res) => res.render('forgot-password', { error: null }));
app.get('/add-stocks', isAdmin, (req, res) => { res.render('add-stocks', { user: req.session.user, error: null });});

// --------------------
// ADMIN ROUTES
// --------------------
app.get('/admin-dashboard', isAdmin, async (req, res) => {
  const stocks = await Stock.find();
  res.render('admin-dashboard', { user: req.session.user, stocks });
});

app.post('/add-stocks', isAdmin, async (req, res) => {
  const { name, price, quantity } = req.body;
  try {
    await Stock.create({ name, price, quantity, createdBy: req.session.user.portfolioValue });
    res.redirect('/admin-dashboard');
  } catch (err) {
    res.render('add-stocks', { user: req.session.user, error: 'Error adding stock' });
  }
});

// --------------------
// USER ROUTES
// --------------------
app.get('/dashboard', isUser, async (req, res) => {
  const userSession = req.session.user;
  const user = await User.findOne({ username: userSession.username }).populate('portfolio.stockId');

  const stocks = await Stock.find();

  let portfolioValue = 0;
  let portfolio = [];

  if (user.portfolio && user.portfolio.length > 0) {
    portfolio = user.portfolio.map(item => {
      const stockValue = item.shares * item.stockId.price;
      portfolioValue += stockValue;

      return {
        symbol: item.stockId.name,
        shares: item.shares,
        price: item.stockId.price,
        value: stockValue
      };
    });
  }

  const cashBalance = user.cashBalance || 10000;
  const totalValue = cashBalance + portfolioValue;

  res.render('dashboard', {
    user: userSession,
    stocks,
    portfolio,
    cashBalance,
    portfolioValue,
    totalValue
  });
});

// --------------------
// WALLET ROUTES (Deposit + Withdraw)
// --------------------
app.get('/wallet', isUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.user.username });
    if (!user) return res.redirect('/login');
    res.render('wallet', { user, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/deposit', isUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.user.username });
    if (!user) return res.redirect('/login');

    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.render('wallet', { user, error: "Invalid deposit amount" });
    }

    user.cashBalance = (user.cashBalance || 0) + amount;

    if (!user.history) user.history = [];
    user.history.push({ type: "Deposit", amount, date: new Date() });

    await user.save();

    req.session.user.cashBalance = user.cashBalance;
    res.redirect('/wallet');
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/withdraw', isUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.user.username });
    if (!user) return res.redirect('/login');

    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.render('wallet', { user, error: "Invalid withdraw amount" });
    }

    if ((user.cashBalance || 0) < amount) {
      return res.render('wallet', { user, error: "Insufficient balance" });
    }

    user.cashBalance -= amount;

    if (!user.history) user.history = [];
    user.history.push({ type: "Withdraw", amount, date: new Date() });

    await user.save();

    req.session.user.cashBalance = user.cashBalance;
    res.redirect('/wallet');
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// --------------------
// AUTHENTICATION ROUTES
// --------------------

// Signup
app.post('/signup', async (req, res) => {
  const { firstName, lastName, username, email, password, confirmPassword } = req.body;

  if (!firstName || !lastName || !username || !email || !password) {
    return res.render('signup', { error: "All fields are required" });
  }

  if (password !== confirmPassword) {
    return res.render('signup', { error: "Passwords do not match" });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.render('signup', { error: "Username or Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.render('login', { success: "Account created! Please log in.", error: null });
  } catch (err) {
    console.error(err);
    res.render('signup', { error: "Error creating account." });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.render('login', { error: 'User not found', success: null });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.render('login', { error: 'Incorrect password', success: null });

    req.session.user = { 
      name: `${user.firstName} ${user.lastName}`,
      username: user.username,
      email: user.email,
      role: user.role,
      cashBalance: user.cashBalance || 10000
    };

    if (user.role === "admin") return res.redirect('/admin-dashboard');
    return res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Something went wrong', success: null });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Forgot password (placeholder)
app.post('/forgot-password', (req, res) => {
  console.log(req.body);
  res.redirect('/login');
});

// --------------------
// PORTFOLIO & HISTORY
// --------------------
app.get('/portfolio', isUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.user.username }).populate('portfolio.stockId');
    if (!user) return res.status(404).send("User not found");

    const portfolio = user.portfolio.map(item => ({
      symbol: item.stockId.name,
      shares: item.shares,
      price: item.stockId.price,
      value: item.shares * item.stockId.price
    }));

    const totalValue = portfolio.reduce((sum, item) => sum + item.value, 0) + (user.cashBalance || 10000);

    res.render('portfolio', {
      user: req.session.user,
      portfolio,
      cashBalance: user.cashBalance || 10000,
      totalValue
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

app.get('/history', isUser, async (req, res) => {
  const user = await User.findOne({ username: req.session.user.username });
  if (!user) return res.status(404).send("User not found");

  const history = user.history || [];
  res.render("history", { user, history });
});

app.get('/admin-history', isAdmin, async (req, res) => {
  try {
    const stocks = await Stock.find().sort({ createdAt: -1 });
    res.render('admin-history', { user: req.session.user, stocks });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Buying stocks
app.post('/buy/:id', isUser, async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = await User.findOne({ username: req.session.user.username });
  if (!user) return res.status(404).send("User not found");

  const stock = await Stock.findById(req.params.id);
  if (!stock || stock.quantity <= 0) return res.send("Out of stock");
  if (user.cashBalance < stock.price) return res.send("Not enough balance");

  stock.quantity -= 1;
  await stock.save();

  user.cashBalance -= stock.price;

  const owned = user.portfolio.find(p => String(p.stockId) === String(stock._id));
  if (owned) {
    owned.shares += 1;
  } else {
    user.portfolio.push({ stockId: stock._id, shares: 1 });
  }

  if (!user.history) user.history = [];
  user.history.push({
    type: "Buy",
    amount: stock.price,
    date: new Date(),
    stockName: stock.name,
    shares: 1
  });

  await user.save();
  req.session.user.cashBalance = user.cashBalance;

  res.redirect('/dashboard');
});



//
// Add cash from sold stock to wallet
//
// User will put in an amount of stock they own to sell
app.post("/sell/:id", isUser, async, async (req, res) => {
    try{
    if(!req.session.user) {
      return res.redirect("/login")
    }

    const stockID = req.params.id;
    //user will input amount of shares to sell
    const sellShares = Number(req.body.shares);

    //this will check to see if share amount is able to be sold
    if(isNaN(sellShares) || sellShares <= 0) {
      return res.send("Invalid amount of shares!")
    }

     const user = await User.findOne({username: req.session.user.username});
  if(!user) {
    return res.status(404).send("User not found.");
  }
  const stock = await Stock.findById(stockID);
  if(!stock) {
    return res.status(404).send("Stock not found.");
  }

  //find user stock
  let portfolioItem = user.portfolio.find(p => String(p.stockID) === String(stockID));

  if(!portfolioItem || portfolioItem.shares < sellShares) {
    return res.send("Not enough shares to sell.");
  }

  //update user portfolio
  portfolioItem.shares -= sellShares;
  if(portfolioItem.shares === 0) {
    user.portfolio = user.portfolio.filter(p => String(p.stockID) !== String(p.stockID));
  }

  //add cash earned to balance
  const newCash = stock.price * sellShares;
  user.cashBalance = (user.cashBalance || 0) + newCash

  //sold shares will enter back into market
  stock.quantity += sellShares;

  //history
  if(!user.history) user.history = [];
  user.history.push({
    type: "Sell",
    shares: sellShares,
    amount: newCash,
    stockName: stock.name,
    date: new Date()
  });

  await user.save()
  await stock.save()

  res.redirect("/portfolio");
  } catch {
    console.error(err);
    res.status(500).send("Error")
  }
});

//
//stock fluctuation
//
function stockFluctuation() {
  // stock price will fluctuate every 2 minutes
  setInterval(updateStockPrices, 2 * 60 * 1000)
}

async function updateStockPrices() {
  try {
    const stocks = await Stock.find();

    for(let stock of stocks) {
      let currentPrice = Number(stock.price);
      if(isNaN(currentPrice) || currentPrice <= 0) {
        continue;
      }

      //random percentage from range 1-20
      const percentChange = (Math.random() * (0.20 - 0.01)) + 0.01;

      //random choice to be positive or negative percentage
      const increasePercentage = Math.random() < 0.05;

      let priceChange = currentPrice * percentChange;

      if(!increasePercentage) {
        priceChange = -priceChange;
      }

      //price after fluctuation
      let newPrice = currentPrice + priceChange;

      //check if fluctuation makes price go less than one dollar
      if(newPrice < 1) {
        newPrice = 1;
      }

      //two decimal places for stock after fluctuation
      newPrice = Number(newPrice.toFixed(2));

      //save price in stock market
      stock.price = newPrice;
      await stock.save();

      //this code is to see if stock price is changing in console log
      // console.log("Updated ${stock.name}: ${currentPrice} -> ${newPrice}");
    }

  } catch (err) {
    console.error("Error updating prices", err);
  }
}

stockFluctuation();


// --------------------
// START SERVER
// --------------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
