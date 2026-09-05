# Web_Tech_Final_AR_06.2026
Final project for Web Technologies course at POLIMI
## Known limitations

**Booking conflict race condition.** The overlap check and the insert are two separate operations, so two concurrent requests for overlapping dates could both pass validation before either commits. Correct fixes: a SERIALIZABLE transaction with retry, or a Postgres EXCLUDE constraint on a daterange column, which makes overlapping rows physically impossible at the database level.
