'use strict';

require('dotenv').config();
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'password123';

// Helper: a date N days from today at UTC midnight, matching how the app stores dates
function daysFromNow(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function main() {
  // Wipe in dependency order: bookings reference properties, properties reference users
  await prisma.booking.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const host = await prisma.user.create({
    data: { email: 'host@test.local', passwordHash, name: 'Marco', surname: 'Rossi' }
  });

  const guest = await prisma.user.create({
    data: { email: 'guest@test.local', passwordHash, name: 'Giulia', surname: 'Bianchi' }
  });

  const bari = await prisma.property.create({
    data: {
      ownerId: host.id, propertyName: 'Med Soul Bari',
      streetAddress: 'Via Andrea Angiulli, 42', city: 'Bari', cap: '70126',
      province: 'BA', country: 'Italy', type: 'HOME_RENTAL',
      maxGuests: 5, price: 200, isActive: true, photoPath: 'seed-bari.jpg'
    }
  });

  const milano = await prisma.property.create({
    data: {
      ownerId: host.id, propertyName: 'Navigli Loft',
      streetAddress: 'Ripa di Porta Ticinese, 15', city: 'Milano', cap: '20143',
      province: 'MI', country: 'Italy', type: 'BNB',
      maxGuests: 2, price: 120, isActive: true, photoPath: 'seed-milano.jpg'
    }
  });

  // Unpublished on purpose: demonstrates that drafts are invisible in Browse
  await prisma.property.create({
    data: {
      ownerId: host.id, propertyName: 'Trullo Alberobello',
      streetAddress: 'Via Monte Nero, 8', city: 'Alberobello', cap: '70011',
      province: 'BA', country: 'Italy', type: 'HOME_RENTAL',
      maxGuests: 4, price: 150, isActive: false
    }
  });

  // Guest-owned property: lets you demo "you cannot book your own listing"
  await prisma.property.create({
    data: {
      ownerId: guest.id, propertyName: 'Taranto Sea View',
      streetAddress: 'Lungomare Vittorio Emanuele III, 20', city: 'Taranto', cap: '74121',
      province: 'TA', country: 'Italy', type: 'BNB',
      maxGuests: 3, price: 90, isActive: true,
    }
  });

  // A confirmed stay: blocks its dates, and shows in the calendar
  await prisma.booking.create({
    data: {
      guestId: guest.id, propertyId: bari.id,
      checkInDate: daysFromNow(10), checkOutDate: daysFromNow(15),
      numberGuests: 2, bookingPrice: 1000, channel: 'GOOGLE', status: 'CONFIRMED'
    }
  });

  // A pending request: gives the host something to confirm or reject live
  await prisma.booking.create({
    data: {
      guestId: guest.id, propertyId: milano.id,
      checkInDate: daysFromNow(20), checkOutDate: daysFromNow(23),
      numberGuests: 2, bookingPrice: 360, channel: 'INSTAGRAM', status: 'PENDING'
    }
  });

  // A cancelled booking on dates that overlap the confirmed one:
  // proves cancelled bookings do NOT block availability
  await prisma.booking.create({
    data: {
      guestId: guest.id, propertyId: bari.id,
      checkInDate: daysFromNow(30), checkOutDate: daysFromNow(33),
      numberGuests: 4, bookingPrice: 600, channel: 'AIRBNB', status: 'CANCELLED'
    }
  });

  console.log('Seed complete.');
  console.log('  host@test.local  /', PASSWORD);
  console.log('  guest@test.local /', PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());