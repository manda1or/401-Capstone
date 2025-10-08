const express = require('express')
const path = require('path')
const app = express()
const PORT = 3000

// View engine
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname,'views'))

// Parse form data
app.use(express.urlencoded({ extended: true }))

// Serve static files from public folder
app.use(express.static('public'))

// Routes that takes u to thr ejs
app.get('/login', (req,res) => res.render('login'))
app.get('/signup', (req,res) => res.render('signup'))
app.get('/forgot-password', (req,res) => res.render('forgot-password'))
app.get('/login', (req, res) => res.render('login'))


// POST handlers
app.post('/login', (req,res) => {
  console.log(req.body)
  res.redirect('/login')  // redirect after submission
})

app.post('/signup', (req,res) => {
  console.log(req.body)
  res.redirect('/login')  // after signup, redirect to login
})

app.post('/forgot-password', (req,res) => {
  console.log(req.body)
  res.redirect('/login')  // after password reset, redirect to login
})

// Redirect root to login
app.get('/', (req,res) => res.redirect('/login'))

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`))
