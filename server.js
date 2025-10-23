const express = require('express')
const path = require('path')
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
require('dotenv').config({ path: './data.env' }); // if your file is named data.env
;

const app = express()
const PORT = 3000

//Connect the database 
mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.mkecynt.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`,
)
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("MongoDB connection error:", err));

//User model
 const User = require('./model/user'); // Creates models/user with schema

// View engine
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname,'views'))

//middleware
// Parse form data
app.use(express.urlencoded({ extended: true }))
//middleware 
// Serve static files from public folder
app.use(express.static('public'))


// Session middleware(This saves the session of the user)
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false
}));

// Middleware to protect routes
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}


// Routes that takes u to the ejs
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req,res) => res.render('login', { error: null, success: null }));
app.get('/signup', (req,res) => res.render('signup', { error: null }));
app.get('/forgot-password', (req,res) => res.render('forgot-password', { error: null }));
app.get('/dashboard', isAuthenticated, (req,res) => res.render('dashboard', { user: req.session.user }));

// POST handlers

// Signup
app.post('/signup', async (req,res) => {
  const { username, password } = req.body;

  //check if the user exist in the database and prings a message it it does 
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) { //if it exit it prints a message
      return res.render('signup', { error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10); // hash the password in the database
    const newUser = new User({ username, password: hashedPassword });  //creates a new user and hashed password
    await newUser.save(); //saves the new user in the database

    res.render('login', { success: 'Account created! Please log in.', error: null });
  } catch (err) {
    console.error(err);
    res.render('signup', { error: 'Error creating account.' });
  }
});



// Login
app.post('/login', async (req,res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'User not found', success: null });
    }

    const passwordMatch = await bcrypt.compare(password, user.password); // waits and compare the plain password with the hashed password in the database
    if (!passwordMatch) {
      return res.render('login', { error: 'Incorrect password', success: null }); // if they do not match its rerendered with error message 
    }

    // Store user in session
    req.session.user = user.username;  // stores the username in session so the server knows the user is logged in

    res.redirect('/dashboard'); //user is directed to dashboard after successfull login
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Something went wrong', success: null });
  }
});

// This works only for thr admin
  // if (username === "admin" && password === "1234") {
  //   res.render("/dashboard", { user: username }); // load dashboard.ejs
  // } else {
  //   res.render("login", { error: "Invalid username or password" });
  // }

// Logout
app.get('/logout', (req,res) => {
  req.session.destroy();
  res.redirect('/login');
});


app.post('/forgot-password', (req,res) => {
  console.log(req.body)
  res.redirect('/login')  // after password reset, redirect to login
})



// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`))
