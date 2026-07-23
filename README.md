# picstool — Personal Pet Memorial Site Builder

A beautiful, easy-to-use full-stack web app for creating personal memorial websites for deceased pets (dogs, cats, etc.). Fully generic and deployable on any domain.

## Features

### 🖼️ Photo Gallery
- Drag & drop bulk upload with duplicate prevention (SHA-256 hashing)
- EXIF date extraction + manual date editing
- Home / Best / Featured flags
- Responsive gallery with lightbox
- Search functionality

### ⭐ Best Moments Page
- Special layout with featured photos in prominent rows
- Best moments in a clean grid
- Mobile-optimized with Load More

### 🎥 Videos Page
- YouTube integration (import playlists or single videos)
- Chronological, alphabetical, or random sorting
- Best Moments filter
- Mobile-optimized with Load More

### 🔐 Admin Dashboard
- Secure session-based login
- Bulk photo management
- Video management with YouTube sync
- Site settings (title, bio, slug)
- Inline editing (captions, dates, flags)

### 📱 Responsive Design
- Excellent mobile experience
- Clean desktop layout
- Fast loading with lazy images

### 🛠️ Tech Stack
- **Backend**: Node.js + Express (ES modules)
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: Cloudflare R2 (zero egress fees)
- **Templating**: EJS
- **Image Processing**: Sharp
- **Authentication**: express-session
- **Frontend**: Pure CSS + vanilla JavaScript

---

## Quick Start (Local Development)

1. **Clone the repo**
   ```bash
   git clone <your-repo>
   cd picstool

## Install dependencies

npm install

## Set up environment variables
Create .env file:

DATABASE_URL="postgresql://..."
SESSION_SECRET="your-secret-here"
# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_DOMAIN=https://pub-...
# Optional
SITE_SLUG=dino
YOUTUBE_API_KEY=...

## Database setup

npx prisma db push
npx prisma generate

## Run locally

npm run dev

## Deployment (Vercel)

Push to GitHub
Import in Vercel
Add environment variables in Vercel Dashboard
Deploy

The project is optimized for Vercel + Cloudflare R2.

## Project Structure

picstool/
├── src/
│   ├── index.js              # Main app
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── admin.js
│   │   └── auth.js
│   └── views/
│       ├── partials/
│       ├── admin/
│       └── ...
├── public/
│   └── css/style.css
├── prisma/
│   └── schema.prisma
└── package.json

## Key Features

Zero egress cost image hosting via Cloudflare R2
Mobile-first design with Load More pagination
Admin-friendly inline editing
Multi-site ready with 'siteSlug'
Secure session-based admin

## License

ISC — Free to use for personal pet memorials.

## Made with love for remembering our furry friends.
