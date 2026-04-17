//src/index.js
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import express from 'express';

// Import middleware and routes
import sessionMiddleware from './middleware/auth.js';   // session + isAuthenticated
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';               // ← NEW: login/logout routes
import indexRoutes from './routes/index.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);
app.set('etag', false);
// This helps surface EJS errors
process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err);
});

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.use((req, res, next) => {
	res.locals.isAdmin = !!req.session?.isAdmin;
	next();
});

// Attach prisma to every request
app.use((req, res, next) => {
	req.prisma = prisma;
	next();
});

// Routes
app.use('/', indexRoutes);      // home, /pictures, /search, /best
app.use('/', authRoutes);       // /admin/login and /admin/logout
app.use('/admin', adminRoutes); // protected admin dashboard

// 404
app.use((req, res) => {
	res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler - improved to catch EJS rendering errors
app.use((err, req, res, next) => {
	console.error('=== UNCAUGHT ERROR ===');
	console.error('URL:', req.url);
	console.error('Method:', req.method);
	console.error('isAdmin:', !!req.session?.isAdmin);
	console.error('Session ID:', req.sessionID);
	console.error(err.stack || err);

	// Send detailed error to browser
	res.status(500).send(`
        <h1 style="color:red">Server Error - EJS Rendering Failed</h1>
        <pre style="background:#f8f8f8; padding:15px; border:1px solid #ccc; overflow:auto;">
${err.stack || err.message || JSON.stringify(err, null, 2)}
        </pre>
        <p><strong>URL:</strong> ${req.url}</p>
        <p><strong>isAdmin:</strong> ${!!req.session?.isAdmin}</p>
        <p><a href="/pictures">Back to Gallery</a></p>
    `);
});

app.listen(port, () => {
	// console.log(`Server running on http://localhost:${port}`);
});