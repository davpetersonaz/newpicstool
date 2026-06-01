//src/index.js
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import express from 'express';

// Import middleware and routes
import sessionMiddleware from './middleware/auth.js';   // session + isAuthenticated
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import indexRoutes from './routes/index.js';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

// Get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// View engine
app.set('trust proxy', 1);
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
	console.error(err.stack || err);

	// Send detailed error to browser
	res.status(500).send(`
        <h1 style="color:red">Server Error</h1>
        <pre>${err.stack || err.message}</pre>
        <p><a href="/">Go Home</a></p>
    `);
});

// ==================== LOCAL DEVELOPMENT + VERCEL ====================
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
	// Only run the server locally (when doing npm run dev)
	app.listen(port, () => {
		console.warn(`🚀 Server running locally at http://localhost:${port}`);
	});
}

export default app;