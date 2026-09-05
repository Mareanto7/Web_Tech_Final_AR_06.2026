'use strict';

// The adapter holds the Postgres connection, the client uses the adapter to run typed queries, and the URL comes from the environment so no secret is hardocded
require('dotenv').config();
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Channel } = require('@prisma/client');

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

function requireAuth(req, res, next) {
  if (req.session.userId){
    next();
  } else {
    return res.redirect('/login');
  }
}

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      // If there's an error, send them back to properties
      res.clearCookie('connect.sid');
      return res.redirect('/properties');
    }
    // Clean delete and redirect
    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
});

app.get('/', (req, res) => {
  if( req.session.userId ){
    return res.redirect('/properties');
  }
  res.redirect('/login');
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
  req.session.userId = user.id
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

app.get('/properties', requireAuth, async (req, res) => {
  const properties = await prisma.property.findMany({ where: { isActive : true} });
  res.render('properties', {properties: properties});
});

app.get('/properties/new', requireAuth, (req, res) => {
  res.render('newProperty', {error: null});
});

app.post('/properties/new', requireAuth, async (req, res) => {
  // 1. Let's pull data from the form
  const pname = req.body.propertyName;
  const street = req.body.streetAddress;
  const city = req.body.city;
  const cap = req.body.cap;
  const type = req.body.type;
  const province = req.body.province;
  const country = req.body.country;
  const maxGuests = parseInt(req.body.maxGuests);
  const price = parseFloat(req.body.price);
  // 2. Let's validate the data
  if(!pname || !street || !city || !cap || !type || !province || !maxGuests || !price){
    return res.render('newProperty', {error: 'All fields are required' });
  }
  // 3. Create the property object
  await prisma.property.create({ data: {ownerId: req.session.userId, propertyName: pname, streetAddress: street, city: city, cap: cap, type: type, province: province, country: country, maxGuests: maxGuests, price: price}});
  // 4. Redirects to properties listing
  return res.redirect('/properties');
});

app.get('/properties/mine', requireAuth, async (req, res) => {
  // Fetch it all applicable properties for the user
  const properties = await prisma.property.findMany({ where: { ownerId: req.session.userId }});

  // Return the myProperties page
  return res.render('myProperties', { properties: properties, error: null });

});

app.get('/bookings/mine', requireAuth, async (req, res) => {
  const bookings = await prisma.booking.findMany({ where: { guestId: req.session.userId }, include: { property: true }});

  // Render the booking page list
  return res.render('myBookings', { bookings: bookings, error: null });
});

app.get('/properties/:id/edit', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if (!property || property.ownerId !== req.session.userId){
    return res.redirect('/properties'); // silently refuse
  }

  res.render('editProperty', { property: property, error: null});
});


app.post('/properties/:id/edit', requireAuth, async (req, res) => {

  // We get which property from the URL - but comes as text so we need to parse it
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if (!property || property.ownerId !== req.session.userId){
    return res.redirect('/properties'); // silently refuse
  }

  const pname = req.body.propertyName;
  const street = req.body.streetAddress;
  const city = req.body.city;
  const cap = req.body.cap;
  const type = req.body.type;
  const province = req.body.province;
  const country = req.body.country;
  const maxGuests = parseInt(req.body.maxGuests);
  const price = parseFloat(req.body.price);

  // Let's validate the data
  if(!pname || !street || !city || !cap || !type || !province || !maxGuests || !price){
    return res.render('editProperty', { property: property, error: 'All fields are required' });
  }

  await prisma.property.update({ where: { id: id }, data: {propertyName: pname, streetAddress: street, city: city, cap: cap, type: type, province: province, country: country, maxGuests: maxGuests, price: price }})
  // Redirects to properties listing
  return res.redirect('/properties');
});

app.post('/properties/:id/delete', requireAuth, async (req, res) => {
  // We get which property from the URL - but comes as text so we need to parse it
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if (!property || property.ownerId !== req.session.userId){
    return res.redirect('/properties'); // silently refuse
  }
  // Delete it
  await prisma.property.delete({ where: { id: id }});

  // Back to the list / home
  return res.redirect('/properties');

});

app.post('/properties/:id/publish', requireAuth, async (req, res) => {
  // We get which property from the URL - but comes as text so we need to parse it
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if (!property || property.ownerId !== req.session.userId){
    return res.redirect('/properties'); // silently refuse
  }
  // Publish it
  await prisma.property.update({ where: { id: id }, data: { isActive: true }});

  // Back to the list / home
  return res.redirect('/properties');
});

app.post('/properties/:id/unpublish', requireAuth, async (req, res) => {
  // We get which property from the URL - but comes as text so we need to parse it
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if (!property || property.ownerId !== req.session.userId){
    return res.redirect('/properties'); // silently refuse
  }
  // Unpublish it
  await prisma.property.update({ where: { id: id }, data: { isActive: false }});

  // Back to the list / home
  return res.redirect('/properties');
});

app.get('/properties/:id/book', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if ( !property || property.ownerId === req.session.userId || !property.isActive ){
    return res.redirect('/properties');
  }

  // Render the new booking
  return res.render('newBooking', { property: property, error: null });
});


app.post('/properties/:id/book', requireAuth, async (req, res) => {
  // Property guard - only we know, from the URL, the correct property ID
  const id= parseInt(req.params.id);

  // Fetch it to check the ownership
  const property = await prisma.property.findUnique({ where: { id: id }})

  // Let's pull data from the form
  const checkInDate = new Date(req.body.checkInDate);
  const checkOutDate = new Date(req.body.checkOutDate);
  const channel = req.body.channel;
  const numberGuests = parseInt(req.body.numberGuests);
  const guestId = req.session.userId;

  // Ownership guard - must exists AND must belong to the logged-in user
  if ( !property || property.ownerId === req.session.userId || !property.isActive ){
    return res.redirect('/properties');
  }

  // Validate days
  if(isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())){
    return res.render('newBooking', { property: property, error: 'Please insert a valid time '});
  }

  // Check the nights are valid
  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);
  if(checkOutDate <= checkInDate || checkInDate < todayMidnight){
    return res.render('newBooking', { property: property, error: 'No check-in after check-out or past check-in are allowed, correct before proceeding!'});
  }

  // Calculate days and Compute stay
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const nights = (checkOutDate - checkInDate) / MS_PER_DAY;

  // Check the nights are valid
  if(numberGuests > property.maxGuests || numberGuests < 1 || isNaN(numberGuests)){
    return res.render('newBooking', { property: property, error: `Include a number of guests between 1 and ${property.maxGuests} before proceeding!`})
  }

  // Check the channel
  if (!Object.values(Channel).includes(channel)) {
    return res.render('newBooking', { property: property, error: 'Invalid booking channel' });
}

  // Compute booking price
  const bookingPrice = property.price.mul(nights);

  // Create the booking object
  await prisma.booking.create({ data: { guestId: guestId, propertyId: id, checkInDate: checkInDate, checkOutDate: checkOutDate, channel: channel, bookingPrice: bookingPrice, numberGuests: numberGuests }});
  // Redirects to properties listing
  return res.redirect('/properties');
});

app.post('/bookings/:id/cancel', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const booking = await prisma.booking.findUnique({ where: { id: id }})

  // Ownership guard - must exists AND must belong to the logged-in user
  if ( !booking || booking.guestId !== req.session.userId ){
    return res.redirect('/bookings/mine');
  }

  // Cancel it and save
  await prisma.booking.update({ where: { id: id }, data: { status: 'CANCELLED' }});

  // Redirect to the list of my bookings
  return res.redirect('/bookings/mine');
});

app.listen(PORT, () => console.log(`Express started on port ${PORT}`));