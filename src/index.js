//src/index.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import indexRoutes from './routes/index.js';
import adminRoutes from './routes/admin.js';

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

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Attach prisma to every request
app.use((req, res, next) => {
	req.prisma = prisma;
	next();
});

// Routes
app.use('/', indexRoutes);
app.use('/pictures', indexRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
	res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).send('Something went wrong!');
});

app.listen(port, () => {
	// console.log(`Server running on http://localhost:${port}`);
});