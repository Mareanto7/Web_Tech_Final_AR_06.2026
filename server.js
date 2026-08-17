'use strict';

// The adapter holds the Postgres connection, the client uses the adapter to run typed queries, and the URL comes from the environment so no secret is hardocded
require('dotenv').config();
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });


/**
 * Module dependencies
 */

const express = require('express');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;
const bcrypt = require('bcrypt');
const saltRounds = 10;


// config
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.get('/login', (req, res) => {
  res.render('login', {error: null});
});

app.post('/login', async (req, res) => {
    // 1. Let's pull fields from the login form
  const email = req.body.email;
  const password = req.body.password;
  // 2. Let's check both are present, otherwise return error
  if (!email || !password){
    return res.render('login', { error: 'All fields are required to continue'});
  }
  // 3. Let's find a user by email and store it in user
  const user = await prisma.user.findUnique({where: {email: email}});
  if (!user) {
    return res.render('login', { error: 'Invalid credentials! Please insert correct credentials or register first'});
  }
  // 4. Let's compare the password and check it matches the one stored
  if (! await bcrypt.compare(password, user.passwordHash)){
    return res.render('login', { error: 'Invalid credentials! Please insert correct credentials or register first'});
  }
  // 5. Let's save session ID
  req.session.userId= user.id
  // 6. Return them to properties
  return res.redirect('/properties');
});

app.post('/register', async (req, res) => {
  // 1. Let's pull fields from the registration form
  const email = req.body.email;
  const password = req.body.password;
  const name = req.body.name;
  const surname = req.body.surname;
  // 2. Let's validate them (password long enough, email-shaped). Fail leads to re-render the registration form w/ error
  if (!email || !password || !name || !surname){
    return res.render('register', { error: 'All fields are required to continue'});
  }
  if (password.length < 8){
    return res.render('register', {error: 'Password too short'});
  }
  // 3. We check if an email already exists -> exists we re-render the registration form w/ error message "email taken"
  const existingUser = await prisma.user.findUnique({where: {email: email}});
  if (existingUser) {
    return res.render('register', {error: 'This user is already registered, please proceed to login'});
  }
  // 4. We hash the psw
  const passwordHash = await bcrypt.hash(password, saltRounds);
  // 5. We create the user with the hashed psw
  await prisma.user.create({ data: {email: email, passwordHash: passwordHash, name: name, surname: surname}});
  // 6. We redirect them to login
  return res.redirect('/login');
});

app.listen(PORT, () => console.log(`Express started on port ${PORT}`));