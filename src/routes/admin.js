//src/routes/admin.js
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import ExifReader from 'exifreader';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';

const router = express.Router();

// Multer for bulk upload (max 20 files)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
}).array('photos', 20);// 'photos' = max 20 files (must match the "name=" in the form)

// Admin middleware
const isAdmin = (req, res, next) => {
	const providedSecret = req.query.secret || req.body.secret;
	if (providedSecret === process.env.ADMIN_SECRET) {
		req.isAdmin = true;
		return next();
	}
	res.status(401).send(`
        <h1>Unauthorized</h1>
        <p>Access denied. Incorrect or missing admin secret.</p>
        <p>Make sure you are using ?secret=your-secret-here</p>
        <a href="/">Go Home</a>
    `);
};

// GET /admin - Dashboard with photo list
router.get('/', isAdmin, async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	try {
		let config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
		if (!config) {
			// Create default config if none exists
			config = await req.prisma.siteConfig.create({
				data: {
					siteSlug,
					title: 'Memorial Site',
					bio: 'In loving memory'
				}
			});
		}

		// Get all photos for this site, newest first
		const photos = await req.prisma.photo.findMany({
			where: { siteSlug },
			orderBy: { createdAt: 'desc' }
		});

		//success/failure message
		const message = req.query.message || null;

		res.render('admin/dashboard', {
			title: 'Admin Dashboard',
			config,
			adminSecret: process.env.ADMIN_SECRET,
			siteSlug,
			photos,
			message
		});
	} catch (error) {
		console.error('Admin dashboard error:', error);
		res.status(500).send('Error loading admin dashboard');
	}
});

// POST /admin/update - site settings
router.post('/update', isAdmin, async (req, res) => {
	const { title, bio } = req.body;
	if (!title || !bio) {
		return res.status(400).send('Title and bio are required');
	}
	const siteSlug = process.env.SITE_SLUG || 'slug';
	await req.prisma.siteConfig.upsert({
		where: { siteSlug },
		update: { title, bio },
		create: { siteSlug, title, bio }
	});
	res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
});

// POST /admin/upload - bulk upload of photos
router.post('/upload', isAdmin, (req, res, next) => {
	upload(req, res, (err) => {
		if (err) {
			if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				return res.status(400).send('Too many files. Maximum is 20 at a time.');
			}
			return res.status(400).send('Upload error: ' + err.message);
		}
		next();
	});
}, async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	const files = req.files || [];
	if (files.length === 0) {
		return res.status(400).send('No files uploaded');
	}
	let success = 0;
	let duplicates = 0;

	for (const file of files) {
		try {
			const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

			// Check for duplicate
			const existing = await req.prisma.photo.findUnique({ where: { hash } });
			if (existing) {
				duplicates++;
				continue;
			}

			// Get image dimensions
			const metadata = await sharp(file.buffer).metadata();

			// Create safe filename
			const ext = path.extname(file.originalname).toLowerCase();
			const safeFilename = `${hash.slice(0, 12)}${ext}`;

			// Save the actual image file
			await fs.writeFile(path.join('public', 'images', safeFilename), file.buffer);
			const baseName = path.basename(file.originalname, ext);

			// Extract date from EXIF first, then fallback to filename
			let takenAt = null;
			try {
				const exif = await ExifReader.load(file.buffer);
				let exifDate = exif.DateTimeOriginal?.value ||
								exif.CreateDate?.value ||
								exif.DateTime?.value;
				if (exifDate) {
					if (Array.isArray(exifDate)) { exifDate = exifDate[0]; }
					const dateStr = String(exifDate).replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
					takenAt = new Date(dateStr);
					if (isNaN(takenAt.getTime())) { takenAt = null; }
				}
			} catch (e) { 
				console.warn('exifError:', e);
			}

			// Fallback: look for YYYYMMDD in filename
			if (!takenAt) {
				const match = file.originalname.match(/(\d{4})(\d{2})(\d{2})/);
				if (match) {
					takenAt = new Date(`${match[1]}-${match[2]}-${match[3]}`);
				}
			}

			await req.prisma.photo.create({
				data: {
					siteSlug,
					image: safeFilename,
					originalFilename: file.originalname,
					hash,
					width: metadata.width,
					height: metadata.height,
					caption: baseName,
					featured: false,
					bestMoment: false,
					takenAt
				}
			});
			success++;
		} catch (err) {
			console.error(`Failed to process ${file.originalname}:`, err);
		}
	}
	let message = `Upload complete: ${success} photos added.`;
	if (duplicates) {
		message += ` ${duplicates} duplicate(s) were skipped (already exists).`;
	}
	res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}&message=${encodeURIComponent(message)}`);
});

// POST /admin/upload - delete photo
router.post('/delete/:id', isAdmin, async (req, res) => {
	const photoId = parseInt(req.params.id);
	const siteSlug = process.env.SITE_SLUG || 'slug';

	try {
		const photo = await req.prisma.photo.findUnique({
			where: { id: photoId }
		});
		if (!photo || photo.siteSlug !== siteSlug) {
			return res.status(404).send('Photo not found');
		}

		// Delete file from disk
		const filePath = path.join('public', 'images', photo.image);
		await fs.unlink(filePath).catch(() => { }); // ignore if file doesn't exist

		// Delete from database
		await req.prisma.photo.delete({ where: { id: photoId } });

		res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}&message=Photo deleted successfully.`);
	} catch (error) {
		console.error(error);
		res.status(500).send('Failed to delete photo');
	}
});

export default router;