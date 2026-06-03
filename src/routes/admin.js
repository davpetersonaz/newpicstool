//src/routes/admin.js
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import ExifReader from 'exifreader';
import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import sharp from 'sharp';

import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// ====================== MULTER SETUP ======================

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
}).array('photos', 30);// 'photos' = max 30 files (must match the "name=" in the form)

// Protect ALL admin routes
router.use(isAuthenticated);

// ====================== HELPERS ======================

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

// ====================== DASHBOARD ======================

router.get('/', async (req, res) => {
	try {
		const siteSlug = process.env.SITE_SLUG || 'slug';
		let config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
		const isFirstSetup = !config;
		if (isFirstSetup) {
			config = { siteSlug: '', title: '', bio: '' };
		}

		res.render('admin/dashboard', {
			headerTitle: config?.title || 'Memorial Site',
			title: 'Admin Dashboard',
			config,
			siteSlug,
			isFirstSetup,
			isAdmin: true
		});
	} catch (error) {
		console.error('Admin dashboard error:', error);
		res.status(500).send('Error loading admin dashboard');
	}
});

// ====================== PHOTOS MANAGEMENT ======================

router.get('/photos', async (req, res) => {
	try {
		const siteSlug = process.env.SITE_SLUG || 'slug';
		const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
		const photos = await req.prisma.photo.findMany({
			where: { siteSlug },
			orderBy: { createdAt: 'desc' }
		});

		res.render('admin/photos', {
			headerTitle: config?.title || 'Memorial Site',
			title: 'Manage Photos',
			siteSlug,
			photos,
			isAdmin: true
		});
	} catch (error) {
		console.error('Photos page error:', error);
		res.status(500).send('Error loading photos');
	}
});

// Upload photos
router.post('/photos/upload', (req, res, next) => {
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

	res.redirect(`/admin/photos?message=${encodeURIComponent(message)}`);
});

// Delete photo
router.post('/photos/delete/:id', async (req, res) => {
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

		res.redirect('/admin/photos?message=Photo deleted successfully.');
	} catch (error) {
		console.error(error);
		res.status(500).send('Failed to delete photo');
	}
});

// Update taken date
router.post('/photos/update-taken/:id', async (req, res) => {
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

// ====================== VIDEOS MANAGEMENT ======================

// GET /admin/videos
router.get('/videos', async (req, res) => {
	try {
		const siteSlug = process.env.SITE_SLUG || 'slug';
		const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
		const videos = await req.prisma.video.findMany({
			where: { siteSlug },
			orderBy: { createdAt: 'desc' }
		});

		res.render('admin/videos', {
			headerTitle: config?.title || 'Memorial Site',
			title: 'Manage Videos',
			siteSlug,
			videos,
			isAdmin: true
		});
	} catch (error) {
		console.error('Videos page error:', error);
		res.status(500).send('Error loading videos');
	}
});

// Toggle Best Moment for Video
router.post('/videos/toggle-best/:id', async (req, res) => {
	const videoId = parseInt(req.params.id);
	const siteSlug = process.env.SITE_SLUG || 'slug';

	try {
		const video = await req.prisma.video.findUnique({ where: { id: videoId } });
		if (!video || video.siteSlug !== siteSlug) {
			return res.status(404).json({ success: false, message: 'Video not found' });
		}
		const newValue = !video.bestMoment;

		await req.prisma.video.update({
			where: { id: videoId },
			data: { bestMoment: newValue }
		});

		res.json({ success: true, newValue });
	} catch (error) {
		console.error('Toggle bestMoment error:', error);
		res.status(500).json({ success: false });
	}
});

// POST /admin/videos/import-playlist
router.post('/videos/import-playlist', async (req, res) => {
	const { playlistId } = req.body;
	const siteSlug = process.env.SITE_SLUG || 'slug';
	const apiKey = process.env.YOUTUBE_API_KEY;
	if (!playlistId){ return res.status(400).send('Playlist ID is required'); }
	if (!apiKey){ return res.status(500).send('YouTube API key is not configured'); }

	try {
		// Clean playlist ID if full URL was pasted
		let cleanId = playlistId.trim();
		const match = playlistId.match(/list=([a-zA-Z0-9_-]+)/);
		if (match){ cleanId = match[1]; }
		let imported = 0;   // new videos
		let updated = 0;    // metadata changed
		let skipped = 0;    // no change
		let nextPageToken = '';

		do {
			const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${cleanId}&maxResults=50&key=${apiKey}${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;

			const playlistRes = await fetch(playlistUrl);
			const playlistData = await playlistRes.json();
			if (!playlistData.items) break;

			for (const item of playlistData.items) {
				const youtubeId = item.snippet.resourceId.videoId;

				// === SECOND CALL: Get detailed video info including recordingDate ===
				const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,recordingDetails&id=${youtubeId}&key=${apiKey}`;
				const videoRes = await fetch(videoUrl);
				const videoData = await videoRes.json();
				const snippet = videoData.items?.[0]?.snippet || item.snippet;
				const recordingDetails = videoData.items?.[0]?.recordingDetails || {};

				const title = snippet.title;
				const description = snippet.description || null;
				// Prefer recordingDate if available, otherwise fall back to takenAt
				let takenAt = null;
				if (recordingDetails.recordingDate) {
					takenAt = new Date(recordingDetails.recordingDate);
				} else if (snippet.takenAt) {
					takenAt = new Date(snippet.takenAt);
				}

				const thumbnail = snippet.thumbnails?.maxres?.url || 
					snippet.thumbnails?.high?.url ||
					snippet.thumbnails?.medium?.url ||
					`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

				// Check if already exists
				const existing = await req.prisma.video.findUnique({ where: { youtubeId } });
				if (existing) {
					// Check if anything changed
					const titleChanged = existing.title !== title;
					const descChanged = existing.description !== description;
					const dateChanged = existing.takenAt?.getTime() !== takenAt?.getTime();
					if (titleChanged || descChanged || dateChanged) {
						await req.prisma.video.update({
							where: { youtubeId },
							data: { title, description, thumbnail, takenAt }
						});
						updated++;
					} else {
						skipped++;
					}
					continue;
				}

				// New video
				await req.prisma.video.create({
					data: {
						siteSlug,
						youtubeId,
						title,
						description,
						thumbnail,
						takenAt
					}
				});
				imported++;
			}

			nextPageToken = playlistData.nextPageToken;
		} while (nextPageToken);

		const message = `Import complete: ${imported} new, ${updated} updated, ${skipped} skipped.`;
		res.redirect(`/admin/videos?message=${encodeURIComponent(message)}`);
	} catch (error) {
		console.error('Playlist import error:', error);
		res.status(500).send('Failed to import playlist. Check console.');
	}
});

// POST /admin/videos/add
router.post('/videos/add', async (req, res) => {
	const { youtubeUrl } = req.body;
	const siteSlug = process.env.SITE_SLUG || 'slug';
	if (!youtubeUrl){ return res.status(400).send('YouTube URL is required'); }

	try {
		// Extract YouTube ID
		let youtubeId = youtubeUrl.trim();
		const match = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]+)/);
		if (match){ youtubeId = match[1]; }

		// Auto-fetch metadata from YouTube (optional but very nice)
		const title = youtubeId;
		const description = null;
		const takenAt = null;
		const thumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

		await req.prisma.video.create({
			data: {
				siteSlug,
				youtubeId,
				title,
				description,
				thumbnail,
				takenAt
			}
		});

		res.redirect('/admin/videos?message=Video added successfully');
	} catch (error) {
		console.error(error);
		res.status(500).send('Failed to add video');
	}
});

// DELETE ALL VIDEOS
router.delete('/videos/delete-all', async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	try {
		const deleted = await req.prisma.video.deleteMany({ where: { siteSlug } });
		console.warn(`Deleted ${deleted.count} videos for ${siteSlug}`);
		res.json({ success: true, count: deleted.count });
	} catch (error) {
		console.error('Delete all videos error:', error);
		res.status(500).json({ success: false });
	}
});

// DELETE /admin/videos/delete/:id
router.delete('/videos/delete/:id', async (req, res) => {
	const videoId = parseInt(req.params.id);
	const siteSlug = process.env.SITE_SLUG || 'slug';

	try {
		const video = await req.prisma.video.findUnique({
			where: { id: videoId }
		});
		if (!video || video.siteSlug !== siteSlug) {
			return res.status(404).json({ success: false, message: 'Video not found' });
		}
		await req.prisma.video.delete({ where: { id: videoId } });
		res.json({ success: true });
	} catch (error) {
		console.error('Video delete error:', error);
		res.status(500).json({ success: false, message: 'Failed to delete video' });
	}
});

// ====================== SITE SETTINGS ======================

router.post('/update', async (req, res) => {
	const { preTitle, title, postTitle, bio, siteSlug: submittedSlug } = req.body;
	if (!title || !bio) {
		return res.status(400).send('Title and bio are required');
	}
	const finalSlug = submittedSlug.trim() || process.env.SITE_SLUG || 'slug';
	try {
		await req.prisma.siteConfig.upsert({
			where: { siteSlug: finalSlug },
			update: { 
				preTitle: (preTitle || '').trim(),
				title, 
				postTitle: (postTitle || '').trim(),
				bio 
			},
			create: { 
				siteSlug: finalSlug, 
				preTitle: (preTitle || '').trim(),
				title, 
				postTitle: (postTitle || '').trim(),
				bio 
			}
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

export default router;