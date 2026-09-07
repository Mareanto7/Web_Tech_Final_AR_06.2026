'use strict';

// The adapter holds the Postgres connection, the client uses the adapter to run typed queries, and the URL comes from the environment so no secret is hardocded
require('dotenv').config();
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Channel, Type } = require('@prisma/client');

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

app.use((req, res, next) => {
  res.locals.userId = req.session.userId;
  next();
});

app.use(express.static('public'));

function requireAuth(req, res, next) {
  if (req.session.userId){
    next();
  } else {
    return res.redirect('/login');
  }
}

function getTodayMidnight() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
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
  const where = { isActive: true };

  if( req.query.type && Object.values(Type).includes(req.query.type)) {
    where.type = req.query.type;
  }

  const minGuests = parseInt(req.query.minGuests);
  if (!isNaN(minGuests) && minGuests > 0) {
    where.maxGuests = { gte: minGuests };
  }

  const maxPrice = parseFloat(req.query.maxPrice);
  if(!isNaN(maxPrice) && maxPrice > 0 ) {
    where.price = { lte: maxPrice };
  }


  if ( req.query.checkIn && req.query.checkOut ) {
    const checkIn = new Date(req.query.checkIn);
    const checkOut = new Date(req.query.checkOut);

    where.bookings = {
      none: {
        status: { not: 'CANCELLED' },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      }
    };
  }

  const properties = await prisma.property.findMany({ where: where });

  res.render('properties', { properties: properties,
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    type: req.query.type,
    minGuests: req.query.minGuests,
    maxPrice: req.query.maxPrice,
    error: null
  });
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

  // Check on price and max guests
  if (isNaN(maxGuests) || maxGuests < 1) {
    return res.render('newProperty', { error: 'Max guests must be at least 1' });
  }
  if (isNaN(price) || price <= 0) {
        return res.render('newProperty', { error: 'Price must be greater than zero' });
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

app.get('/bookings/received', requireAuth, async(req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { property: { ownerId: req.session.userId }},
    include: { property: true, guest: true },
    orderBy: { checkInDate: 'asc' }
  });

  res.render('receivedBookings', { bookings: bookings, error: null });
});

app.get('/bookings/mine', requireAuth, async (req, res) => {
  const bookings = await prisma.booking.findMany({ where: { guestId: req.session.userId }, include: { property: true }});

  // Render the booking page list
  return res.render('myBookings', { bookings: bookings, error: null });
});

app.get('/properties/:id', requireAuth, async(req,res) => {

  const id = parseInt(req.params.id);

  const property = await prisma.property.findUnique({ where: { id: id }});

  if (!property || (!property.isActive && property.ownerId !== req.session.userId)) {
    return res.redirect('/properties');
  }

  const bookings = await prisma.booking.findMany({
    where:
        {
          propertyId: id,
          status: { not: 'CANCELLED' },
          checkOutDate: { gte: getTodayMidnight() },
        },
    orderBy:
        { checkInDate: 'asc'},
  });


  return res.render('propertyDetails', { property: property, bookings: bookings, error: null} );

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

  // Populate variables from fields input
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

  // Check on price and max guests
  if (isNaN(maxGuests) || maxGuests < 1) {
    return res.render('editProperty', { property: property, error: 'Max guests must be at least 1' });
  }
  if (isNaN(price) || price <= 0) {
        return res.render('editProperty', { property: property, error: 'Price must be greater than zero' });
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
  if(checkOutDate <= checkInDate || checkInDate < getTodayMidnight()){
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

  // Conflict detection.
  // A booking occupies the half-open interval [checkIn, checkOut): the arrival day is taken,
  // The departure day is free, so same-day turnover is allowed.
  // Overlap has four shapes (candidate starts before / inside / around / within
  // an existing stay), but NON-overlap has only two: the candidate ends on or
  // before the existing start, or begins on or after the existing end. So we
  // characterise non-overlap and negate it (De Morgan):
  //   no overlap  <=>  newOut <= oldIn  OR   newIn >= oldOut
  //   overlap     <=>  newOut >  oldIn  AND  newIn <  oldOut
  // Cancelled bookings are excluded: they must not block dates.
  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      propertyId: id,
      status: { not: 'CANCELLED' },
      checkInDate: { lt: checkOutDate },
      checkOutDate: { gt: checkInDate }
    }
  });

  if (conflictingBooking) {
    return res.render('newBooking', { property: property, error: `Dates are conflicting with an existing booking at the same property with starting date: ${conflictingBooking.checkInDate.toLocaleDateString('it-IT')} and ending on: ${conflictingBooking.checkOutDate.toLocaleDateString('it-IT')}, please amend the dates!`});
  }

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

  if ( booking.checkInDate < getTodayMidnight()) {
    return res.redirect('/bookings/mine');
  }

  // Cancel it and save
  await prisma.booking.update({ where: { id: id }, data: { status: 'CANCELLED' }});

  // Redirect to the list of my bookings
  return res.redirect('/bookings/mine');
});

app.post('/bookings/:id/confirm', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const booking = await prisma.booking.findUnique({
    where: { id: id },
    include: { property: true }
  })

  // Ownership guard - must exists AND must belong to the logged-in user
  if ( !booking || booking.property.ownerId !== req.session.userId ){
    return res.redirect('/bookings/received');
  }

  // Check the status is PENDING
  if (booking.status !== 'PENDING') {
    return res.redirect('/bookings/received');
  }

  // Cancel it and save
  await prisma.booking.update({ where: { id: id }, data: { status: 'CONFIRMED' }});

  // Redirect to the list of my bookings
  return res.redirect('/bookings/received');
});

app.post('/bookings/:id/reject', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  // Fetch it to check the ownership
  const booking = await prisma.booking.findUnique({
    where: { id: id },
    include: { property: true }
  })

  // Ownership guard - must exists AND must belong to the logged-in user
  if ( !booking || booking.property.ownerId !== req.session.userId ){
    return res.redirect('/bookings/received');
  }

  // Check the status is PENDING
  if (booking.status !== 'PENDING') {
    return res.redirect('/bookings/received');
  }

  // Cancel it and save
  await prisma.booking.update({ where: { id: id }, data: { status: 'CANCELLED' }});

  // Redirect to the list of my bookings
  return res.redirect('/bookings/received');
});

app.listen(PORT, () => console.log(`Express started on port ${PORT}`));