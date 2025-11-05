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

// --------------------
// ADMIN ROUTES
// --------------------

// Admin dashboard - show current stocks
app.get('/admin-dashboard', isAdmin, async (req, res) => {
  const stocks = await Stock.find();
  res.render('admin-dashboard', { user: req.session.user, stocks });
});

// Add stock
app.get('/add-stocks', isAdmin, (req, res) => {
  res.render('add-stocks', { user: req.session.user, error: null });
});

app.post('/add-stocks', isAdmin, async (req, res) => {
  const { name, price, quantity } = req.body;
  try {
    await Stock.create({ name, price, quantity });
    res.redirect('/admin-dashboard');
  } catch (err) {
    res.render('add-stocks', { user: req.session.user, error: 'Error adding stock' });
  }
});

// --------------------
// USER ROUTES
// --------------------

// User dashboard - show all stocks
app.get('/dashboard', isUser, async (req, res) => {
  const stocks = await Stock.find();
  res.render('dashboard', { user: req.session.user, stocks });
});

// Buy stock
app.post('/buy/:id', isUser, async (req, res) => {
  const selectedStock = await Stock.findById(req.params.id);
  if (!selectedStock || selectedStock.quantity <= 0) return res.send("Out of stock");

  selectedStock.quantity -= 1;
  await selectedStock.save();

  res.redirect('/dashboard');
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

    // Save full name + info in session
    req.session.user = { 
      name: `${user.firstName} ${user.lastName}`,
      username: user.username,
      email: user.email,
      role: user.role
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
// START SERVER
// --------------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
