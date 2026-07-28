# Mahadev Washing Machine, Refrigerator & RO Service and Repair

A responsive appliance-service website with a conversational lead assistant, WhatsApp-first booking form, admin login and lead board, area and income reports, customer ratings, notification campaigns, videos, Google Maps, review integration hooks, and original local appliance-repair visuals.

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI`, `ADMIN_TOKEN`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
2. Install packages with `npm install`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3000`; the admin dashboard is at `http://localhost:3000/admin.html`.

## Production integrations

- **MongoDB:** Leads, conversation transcripts, customer ratings, notification campaigns, and admin-uploaded video metadata are stored in MongoDB.
- **WhatsApp leads:** Each booking is saved to MongoDB first, then the customer’s WhatsApp opens with the complete form details ready to send to `+91 8141743871`. No lead email is sent.
- **Google reviews:** Set `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACE_ID` to show current Google Places reviews. The interface otherwise uses clearly labelled sample testimonials.
- **Map:** Change `MAP_QUERY` to the exact business name/address before launch.

The dashboard uses the configured admin username/password to issue a 12-hour signed session. If `ADMIN_PASSWORD` is omitted, the existing `ADMIN_TOKEN` works as the password for username `admin`. `VISIT_CHARGE` defaults to ₹250; monthly income is calculated as this charge multiplied by orders received in the current month.
