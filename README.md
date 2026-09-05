# Web_Tech_Final_AR_06.2026
Final project for Web Technologies course at POLIMI

**Booking conflict race condition.** The overlap check and the insert are two separate operations, so two concurrent requests for overlapping dates could both pass validation before either commits. Correct fixes: a SERIALIZABLE transaction with retry, or a Postgres EXCLUDE constraint on a daterange column, which makes overlapping rows physically impossible at the database level.

Full-stack web application for short-term property rentals: hosts publish
properties, guests book them for date ranges, with automatic conflict
detection preventing double bookings.

Project developed for the course Tecnologie Informatiche per il Web (TIW) —
server-side rendered version (Express + EJS).

Track: **Traccia 1 — Piattaforma di Prenotazione Risorse**, adapted to
short-term rentals (the shared resource is a property, booked by date range
rather than hourly slot).

## Level reached
**Level 1 complete + Level 2** 

## Features

### Level 1 — Base bookings
**Guest:**
- Register and log in (server-side sessions)
- Browse published properties
- View property details, including current bookings
- Create a booking (property, check-in, check-out, guests)
- View own bookings
- Cancel a future booking

**Host:**
- Create, edit and delete properties
- Publish / unpublish a property
- View all bookings on own properties

### Level 2 — Constraints, availability, conflict handling
- **Automatic conflict detection** — overlapping bookings rejected
- Booking statuses (PENDING / CONFIRMED / CANCELLED) with transitions

### Level 3
- Photos upload and view

## Tech stack
- Node.js + Express 5, EJS templating
- PostgreSQL via Prisma ORM (Docker)
- express-session, bcrypt

## Requirements
- Node.js 20+
- Docker (for PostgreSQL)

## Setup

## Test credentials

## Design decisions

## Known limitations
