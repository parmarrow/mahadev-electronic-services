# Mahadev Smart Assistant

A responsive appliance-service website with a conversational lead assistant, 30-second booking, admin lead board, notification campaigns, videos, Google Maps, review integration hooks, and before/after gallery.

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI`, `ADMIN_TOKEN`, and email settings.
2. Install packages with `npm install`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3000`; the admin dashboard is at `http://localhost:3000/admin.html`.

## Production integrations

- **MongoDB:** Leads, conversation transcripts, notification campaigns, and admin-uploaded video metadata are stored in MongoDB.
- **Email:** Configure SMTP values and each lead is emailed to `ADMIN_EMAIL`.
- **Google reviews:** Set `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACE_ID` to show current Google Places reviews. The interface otherwise uses clearly labelled sample testimonials.
- **Map:** Change `MAP_QUERY` to the exact business name/address before launch.

The dashboard uses an `ADMIN_TOKEN` header gate as a simple starter protection. Replace it with your website's normal authenticated admin session before production.
