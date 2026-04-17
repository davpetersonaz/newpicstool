//src/routes/admin.js
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import ExifReader from 'exifreader';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Multer for bulk upload (max 20 files)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
}).array('photos', 30);// 'photos' = max 30 files (must match the "name=" in the form)

// Protect ALL admin routes
router.use(isAuthenticated);

// ====================== HELPER FUNCTIONS ======================

async function updateEnvSlug(newSlug) {
	try {
		const envPath = path.join(process.cwd(), '.env');
		let envContent = await fs.readFile(envPath, 'utf8');

		if (envContent.includes('SITE_SLUG=')) {
			envContent = envContent.replace(/SITE_SLUG=.*/g, `SITE_SLUG=${newSlug}`);
		} else {
			envContent += `\nSITE_SLUG=${newSlug}\n`;
		}

		await fs.writeFile(envPath, envContent);
	} catch (err) {
		console.error('Failed to update .env file:', err);
	}
}

// ====================== ROUTES ======================

// GET /admin - Dashboard
router.get('/', async (req, res) => {
	try {
		const siteSlug = process.env.SITE_SLUG || 'slug';
		let config = await req.prisma.siteConfig.findFirst({ 
			where: { siteSlug }
		});
		const isFirstSetup = !config;
		if (isFirstSetup) {
			config = { siteSlug: '', title: '', bio: '' };
		}

		// Get all photos for this site, newest first
		const photos = await req.prisma.photo.findMany({
			where: { siteSlug },
			orderBy: { createdAt: 'desc' }
		});

		//success/failure message
		res.render('admin/dashboard', {
			title: 'Admin Dashboard',
			config,
			siteSlug,
			photos,
			message: req.query.message || null,
			isFirstSetup,
			isAdmin: true
		});
	} catch (error) {
		console.error('Admin dashboard error:', error);
		res.status(500).send('Error loading admin dashboard');
	}
});

// POST /admin/update - site settings
router.post('/update', async (req, res) => {
	const { title, bio, siteSlug: submittedSlug } = req.body;
	if (!title || !bio) {
		return res.status(400).send('Title and bio are required');
	}
	const finalSlug = submittedSlug.trim() || process.env.SITE_SLUG || 'slug';
	try {
		await req.prisma.siteConfig.upsert({
			where: { siteSlug: finalSlug },
			update: { title, bio },
			create: { siteSlug: finalSlug, title, bio }
		});

		// If this was first setup, update .env file
		if (!process.env.SITE_SLUG || process.env.SITE_SLUG === 'slug') {
			await updateEnvSlug(finalSlug);
		}

		res.redirect('/admin?message=Site settings saved successfully.');
	} catch(error) {
		console.error(error);
		res.status(500).send('Error saving site settings');
	}
});

// POST /admin/upload - bulk upload of photos
router.post('/upload', (req, res, next) => {
	upload(req, res, (err) => {
		if (err) {
			if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				return res.status(400).send('Too many files. Maximum is 30 at a time.');
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
			const baseName = path.basename(file.originalname, path.extname(file.originalname));

			// Extract date from EXIF first, then fallback to filename
			let takenAt = null;
			let takenAtSource = null;
			try {
				const exif = await ExifReader.load(file.buffer);
				let exifDate = exif.DateTimeOriginal?.value ||
								exif.CreateDate?.value ||
								exif.DateTime?.value;
				if (exifDate) {
					if (Array.isArray(exifDate)) { exifDate = exifDate[0]; }
					const dateStr = String(exifDate).replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
					takenAt = new Date(dateStr);
					if (!isNaN(takenAt.getTime())) {
						takenAtSource = 'exif';        // ← (e)
					} else {
						takenAt = null;
					}
				}
			} catch (e) { 
				console.warn('exifError:', e);
			}

			if (!takenAt) {
				const filename = file.originalname.toLowerCase();

				// Pattern 1: YYYYMMDD (e.g. 20210524)
				let match = filename.match(/(\d{4})(\d{2})(\d{2})/);
				if (match) {
					takenAt = new Date(`${match[1]}-${match[2]}-${match[3]}`);
					if (!isNaN(takenAt.getTime())){ takenAtSource = 'filename'; }
				}

				// Pattern 2: DDmmmYYYY or DDMMMMYYYY (e.g. 24may2021, 24June2021, 15April2023)
				if (!takenAt) {
					// This regex matches day + month name (3 or more letters) + year
					match = filename.match(/(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|march|april|june|july)(\d{2,4})/);
					if (match) {
						const day = match[1].padStart(2, '0');
						const monthStr = match[2];
						let year = match[3];
						if (year.length === 2){ year = '20' + year; }
						const monthMap = {
							'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 
							'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
							'march': '03', 'april': '04', 'june': '06', 'july': '07' 
						};
						const month = monthMap[monthStr];
						if (month) {
							takenAt = new Date(`${year}-${month}-${day}`);
							if (!isNaN(takenAt.getTime())) {
								takenAtSource = 'filename';
							}
						}
					}
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
					takenAt,
					takenAtSource
				}
			});
			success++;
		} catch (err) {
			console.error(`Failed to process ${file.originalname}:`, err);
		}
	}
	const message = `Upload complete: ${success} photos added.` + 
                   (duplicates ? ` ${duplicates} duplicate(s) skipped.` : '');

	res.redirect(`/admin?message=${encodeURIComponent(message)}`);
});

// POST /admin/upload - delete photo
router.post('/delete/:id', async (req, res) => {
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

		res.redirect('/admin?message=Photo deleted successfully.');
	} catch (error) {
		console.error(error);
		res.status(500).send('Failed to delete photo');
	}
});

// POST /admin/update-taken/:id
router.post('/update-taken/:id', async (req, res) => {
	const photoId = parseInt(req.params.id);
	const { takenAt } = req.body;
	const siteSlug = process.env.SITE_SLUG || 'slug';

	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo || photo.siteSlug !== siteSlug) {
			return res.status(404).send('Photo not found');
		}

		await req.prisma.photo.update({
			where: { id: photoId },
			data: { 
				takenAt: takenAt ? new Date(takenAt) : null,
				takenAtSource: takenAt ? 'manual' : null
			}
		});

		res.json({ success: true });
	} catch (error) {
		console.error(error);
		res.status(500).json({ success: false });
	}
});

export default router;