# BnB Booking Platform - Thin Client Architecture

Full-stack web application for short-term property rentals: hosts publish properties,
guests book them for date ranges, with automatic conflict detection preventing double
bookings, availability search, filters, and a booking approval workflow.

Project developed for the course Tecnologie Informatiche per il Web (TIW) —
server-side rendered version (Express + EJS).

**Track:** Traccia 1 — Piattaforma di Prenotazione Risorse, adapted to short-term
rentals: the shared resource is a whole property, booked by date range rather than
by hourly slot. The traccia's "amministratore" role is fulfilled by the property
owner (host), who creates, edits, publishes and deletes their own listings and sees
all bookings made on them.

## Level reached

**Level 1 complete + Level 2 + a Level 3 extension (image upload).**

## Features

### Level 1 — Base bookings

**Guest:**
- Register and log in (server-side sessions, bcrypt-hashed passwords)
- Browse published properties
- View property details, including current bookings and an availability calendar
- Create a booking (property, check-in, check-out, number of guests, channel)
- View own bookings
- Cancel a own future booking

**Host:**
- Create, edit and delete properties
- Publish / unpublish a property (unpublished listings are not bookable)
- View all bookings received on own properties, with guest details

### Level 2 — Constraints, availability, conflict handling

- **Automatic conflict detection** — a booking overlapping an existing one is rejected,
  with the conflicting dates reported back to the guest
- **Availability search** — filter listings by check-in/check-out, showing only
  properties free for the whole window
- **Filters** — by property type, minimum capacity, and maximum nightly price;
  all filters compose with each other and with the date search
- **Booking statuses** (PENDING / CONFIRMED / CANCELLED) with explicit transitions:
  the host confirms or rejects a pending request; the guest cancels their own booking
- **Availability calendar** — month view on the property page, booked days shaded
- Capacity constraint: a booking cannot exceed the property's maximum guests

### Level 3 — Image upload

- Hosts upload one photo per property (JPEG, PNG or WebP, max 10 MB)
- Server-side validation of MIME type and file size; filenames are generated rather
  than taken from the client
- Photos displayed on the listing, detail, management and booking pages

## Tech stack

- **Node.js + Express 5**, EJS server-side templating
- **PostgreSQL** via **Prisma ORM**, running in Docker
- **express-session** for server-side sessions
- **bcrypt** for password hashing
- **multer** for multipart file uploads

## Requirements

- Node.js 20+
- Docker (for PostgreSQL)

## Setup

1. Clone the repository and enter the directory:
```bash
   git clone <repo-url>
   cd web_tech_bnb
```

2. Copy the environment template and fill in the values:
```bash
   cp .env.example .env
```

3. Start PostgreSQL:
```bash
   docker compose up -d
```

4. Install dependencies:
```bash
   npm install
```

5. Apply the database schema:
```bash
   npx prisma migrate dev
```

6. Seed test data (optional but recommended):
```bash
   npm run seed
```

7. Start the server:
```bash
   npm run dev
```

Open http://localhost:3000.

## Test credentials

| Role  | Email | Password |
|-------|-------|----------|
| Host  | host@test.local | password123 |
| Guest | guest@test.local | password123 |

Both accounts can act as host and guest — the roles above reflect the seeded data,
not a restriction in the system.

## Design decisions

**Bookings occupy a half-open interval `[checkIn, checkOut)`.** The arrival day is
occupied; the departure day is not. This allows same-day turnover, which is standard
for rentals, and it is the reason every date comparison in the codebase uses strict
`<` / `>` rather than `<=` / `>=`.

**Conflict detection is derived by negation.** Overlap between two intervals has four
shapes (the new booking starts before, inside, around, or within an existing one), but
*non*-overlap has only two: the candidate ends on or before the existing start, or
begins on or after the existing end. Characterising non-overlap and applying De Morgan
gives a single two-clause predicate:

```
overlap ⟺ newCheckOut > existingCheckIn AND newCheckIn < existingCheckOut
```

The same predicate serves three features: `findFirst` to detect a conflict on booking,
a `none` relation filter to find available properties in search, and range expansion to
shade the availability calendar.

**Prices are computed server-side and never accepted from the client.** The booking form
displays a live estimated total in JavaScript, but the authoritative figure is
`nights × property.price`, calculated in the route. Prices use Prisma's `Decimal` type
rather than floating point, so no cent-level drift accumulates.

**Identity always comes from the session, never from the request body.** The guest on a
booking is `req.session.userId`; the owner on a property is likewise. Accepting either
from a form field would let a client act as another user.

**Authorization takes two forms.** On detail routes the record is fetched by id and
ownership checked afterwards, because the id in the URL could refer to anyone's record.
On list routes authorization is expressed in the query filter itself (`ownerId`,
`guestId`, or a nested `property: { ownerId }`), which makes retrieving another user's
rows structurally impossible.

**Cancellation is a status change, not a deletion.** A cancelled booking remains in the
database so history is preserved, and the conflict query excludes it explicitly — which
is what allows cancelled dates to become bookable again.

**Client-side constraints are convenience; server-side checks are the boundary.** The
`Book` button is hidden on your own properties, `required` and `min`/`max` attributes
guard the forms, and the file picker filters by type — but every one of these is
enforced again server-side, because any of them can be removed in the browser.

**SVG uploads are rejected.** SVG is XML and can contain `<script>`, which would execute
from the application's own origin if served back. Only JPEG, PNG and WebP are accepted.

**Routes are kept in a single `server.js`.** Given the project's scope this keeps the
request flow readable end to end; the natural refactor is one route module per resource
with the Prisma client injected.

## Known limitations

**Booking conflict race condition.** The overlap check and the insert are two separate
operations, so two concurrent requests for overlapping dates could both pass validation
before either commits. The correct fixes are a SERIALIZABLE transaction with retry, or
a PostgreSQL `EXCLUDE` constraint on a `daterange` column, which makes overlapping rows
physically impossible at the database level.

**Photo storage is local.** Files are written to `public/uploads`. This works for local
deployment but not on platforms with ephemeral filesystems, where uploads are lost on
redeploy; the production solution is object storage (S3, Cloudinary) or a mounted
persistent volume.

**Orphaned uploads.** Multer writes the file to disk before the route's validation runs,
so a submission that fails validation leaves an unused file behind. Cleaning it up would
mean unlinking the file on every rejection path.

**MIME type is client-declared.** The upload filter reads the browser-supplied
`Content-Type`, which a crafted request can falsify. Robust validation would inspect the
file's magic bytes.

**Forms are not repopulated on validation errors.** A rejected submission returns an
error message but clears the entered values.

**No CSRF protection.** Mutating routes rely on session cookies without a
synchroniser token, so a cross-site form could trigger an action on behalf of a
logged-in user. Modern browsers default the session cookie to `SameSite=Lax`,
which blocks the cross-site POST case in practice, but the explicit fix is a
per-form CSRF token validated server-side.