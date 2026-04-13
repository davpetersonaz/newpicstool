//src/routes/index.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import ExifReader from 'exifreader';
import express from 'express';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Home page
router.get('/', async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';

	const defaultConfig = {
		title: 'Memorial Site',
		bio: 'In loving memory'
	};

	try {
		let config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: siteSlug }
		});

		// Create default config if it doesn't exist yet
		if (!config) {
			config = await req.prisma.siteConfig.create({
				data: {
					siteSlug: siteSlug,
					title: defaultConfig.title,
					bio: defaultConfig.bio
				}
			});
			// console.log(`Created new config for site: ${siteSlug}`);
		}

		const featuredPhotos = await req.prisma.photo.findMany({
			where: { featured: true },
			orderBy: { createdAt: 'desc' }
		});

		res.render('index', {
			title: config.title,
			bio: config.bio,
			featuredPhotos
		});
	} catch (error) {
		console.error('Home route error:', error);
        
		// Fallback using defaults
		res.render('index', {
			title: defaultConfig.title,
			bio: defaultConfig.bio,
			featuredPhotos: []
		});
	}
});

// Pictures route - keeps all your EXIF + filesystem logic
router.get('/pictures', async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	try {
		const config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: siteSlug }
		});
		const title = config ? config.title : 'Memorial Gallery';

		// Read all files in the images directory
		const imagesDir = path.join(__dirname, '../../public/images');
		const files = await fs.readdir(imagesDir);

		// Filter for common image file extensions
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
		const images = await Promise.all(
			files
				.filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
				.map(async file => {
					const filePath = path.join(imagesDir, file);
					const stats = await fs.stat(filePath);
					let createdAt = stats.birthtime; // Default to file birthtime

					// Try to get EXIF date
					try {
						const exifData = await ExifReader.load(filePath);
						// Check multiple EXIF and XMP/IPTC date fields
						let exifDate = exifData.DateTimeOriginal?.value ||
                                       exifData.DateTime?.value ||
                                       exifData.CreateDate?.value ||
                                       exifData.ModifyDate?.value ||
                                       exifData['Date/Time Original']?.value ||
                                       exifData['Date/Time Created']?.value ||
                                       exifData.DateCreated?.value ||
                                       exifData['xmp:DateCreated']?.value;

						// Handle array-wrapped strings (e.g., ["2019:07:31 23:18:03"])
						if (Array.isArray(exifDate) && exifDate.length > 0 && typeof exifDate[0] === 'string') {
							exifDate = exifDate[0];
						}

						if (exifDate) {
							// Handle array or string
							let dateStr = Array.isArray(exifDate) ? String.fromCharCode(...exifDate) : exifDate;
							if (typeof dateStr === 'string') {
								dateStr = dateStr.replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
								const parsedDate = new Date(dateStr.replace(' ', 'T'));
								if (!isNaN(parsedDate)) createdAt = parsedDate;
							}
						}
					} catch (exifError) {
						// Silently fail - use file birthtime
						console.warn('exifError', exifError);
					}

					return {
						src: `/images/${file}`,
						name: path.basename(file, path.extname(file)),
						createdAt
					};
				})
		);

		// Get sort parameter (default: random)
		const sort = req.query.sort || 'random';
		let sortedImages = [...images];

		// Sort images based on query parameter
		if (sort === 'alpha') {
			sortedImages.sort((a, b) => a.name.localeCompare(b.name));
		} else if (sort === 'chrono') {
			sortedImages.sort((a, b) => a.createdAt - b.createdAt);
		} else {
			// Default: random
			sortedImages = shuffleArray(sortedImages);
		}

		// Render the EJS template with the images and current sort
		res.render('pictures', {
			title: title,
			images: sortedImages,
			sort,
			searchQuery: '' // Explicitly set to empty string for non-search context

		});
	} catch (err) {
		console.error(err);
		res.status(500).send('Error loading images');
	}
});

// Search route (kept mostly as-is, but cleaner)
router.get('/search', async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	const query = req.query.q ? req.query.q.trim().toLowerCase() : '';
	if (!query) return res.redirect('/pictures');

	try {
		const config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: siteSlug }
		});
		const title = config ? config.title : 'Memorial Gallery';

		const imagesDir = path.join(__dirname, '../../public/images');
		const files = await fs.readdir(imagesDir);

		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

		const images = await Promise.all(
			files
				.filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
				.map(async file => {
					const filePath = path.join(imagesDir, file);
					const stats = await fs.stat(filePath);
					let createdAt = stats.birthtime;

					try {
						const exifData = await ExifReader.load(filePath);
						let exifDate = exifData.DateTimeOriginal?.value || exifData.CreateDate?.value;
						if (Array.isArray(exifDate) && exifDate.length > 0) exifDate = exifDate[0];

						if (exifDate) {
							let dateStr = Array.isArray(exifDate) ? String.fromCharCode(...exifDate) : exifDate;
							dateStr = dateStr.replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
							const parsedDate = new Date(dateStr.replace(' ', 'T'));
							if (!isNaN(parsedDate)) createdAt = parsedDate;
						}
					} catch (e) {
						console.warn('exifError:', e);
					}

					return {
						src: `/images/${file}`,
						name: path.basename(file, path.extname(file)),
						createdAt
					};
				})
		);

		const filteredImages = images.filter(image => 
			image.name.toLowerCase().includes(query)
		);

		const sort = req.query.sort || 'random';
		let sortedImages = [...filteredImages];

		if (sort === 'alpha') sortedImages.sort((a, b) => a.name.localeCompare(b.name));
		else if (sort === 'chrono') sortedImages.sort((a, b) => a.createdAt - b.createdAt);
		else sortedImages = shuffleArray(sortedImages);

		res.render('pictures', {
			title: title,
			images: sortedImages,
			sort,
			searchQuery: query
		});

	} catch (err) {
		console.error('Search error:', err);
		res.status(500).send('Error processing search');
	}
});

// Best moments route
router.get('/best', async (req, res) => {
	const siteSlug = process.env.SITE_SLUG || 'slug';
	try {
		const config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: siteSlug }
		});

		const siteTitle = config ? config.title : 'Memorial Site';

		const featuredPhotos = await req.prisma.photo.findMany({
			where: { featured: true },
			orderBy: { createdAt: 'desc' }
		});

		const images = featuredPhotos.map(photo => ({
			src: `/images/${photo.image}`,
			name: photo.title || path.basename(photo.image || '', path.extname(photo.image || '')),
			createdAt: photo.createdAt
		}));

		res.render('pictures', {
			title: `${siteTitle} - Best Moments`,
			images: images,
			sort: 'chrono',
			searchQuery: ''
		});
	} catch (error) {
		console.error('Best moments error:', error);
		res.status(500).send('Error loading best moments');
	}
});

// Helper function to shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export default router;