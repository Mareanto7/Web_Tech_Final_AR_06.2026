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
const app = express();
const PORT = process.env.PORT || 3000;
const bcrypt = require('bcrypt');
const saltRounds = 10;


// config
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.urlencoded({ extended: false }));

app.get('/register', (req, res) => {
  res.render('register', { error: null });
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