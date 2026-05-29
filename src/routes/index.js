//src/routes/index.js
import express from 'express';

const router = express.Router();

// Global constants
const SITE_SLUG = process.env.SITE_SLUG || 'slug';
const PAGE_SIZE = 32;   // Adjust as needed

// Helper function to shuffle array (Fisher-Yates)
function shuffleArray(array) {
	const newArray = [...array]; // don't mutate original
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
}

// ====================== HOME ======================
router.get('/', async (req, res) => {
	const defaultConfig = {
		preTitle: 'Welcome to a celebration of the life and times of',
		title: 'Memorial Site',
		postTitle: 'R.I.P.',
		bio: 'In loving memory'
	};

	try {
		let config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: SITE_SLUG }
		});

		// Create default config if it doesn't exist yet
		if (!config) {
			config = await req.prisma.siteConfig.create({
				data: {
					siteSlug: SITE_SLUG,
					...defaultConfig
				}
			});
		}

		// Get all featured photos
		const featuredPhotos = await req.prisma.photo.findMany({
			where: { featured: true, siteSlug: SITE_SLUG }
		});

		// Randomly select one featured photo (if any)
		let featuredImage = null;
		if (featuredPhotos.length > 0) {
			// Pick a random one
			const randomIndex = Math.floor(Math.random() * featuredPhotos.length);
			const selected = featuredPhotos[randomIndex];
			featuredImage = {
				src: selected.image,
				alt: selected.caption || config.title
			};
		}

		res.render('index', {
			preTitle: config.preTitle,
			headerTitle: config?.title || 'Memorial Site',
			title: config.title,
			postTitle: config.postTitle,
			bio: config.bio,
			featuredImage
		});
	} catch (error) {
		console.error('Home route error:', error);
        
		res.render('index', { ...defaultConfig, featuredImage: null });
	}
});

// ====================== PICTURES ======================
router.get('/pictures', async (req, res) => {
	try {
		const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug: SITE_SLUG } });
		const title = config?.title || 'Memorial Gallery';
		const sort = req.query.sort || 'random';
		let dbPhotos = [];

		if (sort === 'chrono') {
			// Chronological sort: newest takenAt first, missing dates at the very end
			dbPhotos = await req.prisma.photo.findMany({
				where: { siteSlug: SITE_SLUG },
				orderBy: [
					{ takenAt: { sort: 'desc', nulls: 'last' } },   // newest date first
					{ createdAt: 'desc' }                           // tie-breaker / fallback
				]
			});
		} else if (sort === 'alpha') {
			// Let Prisma handle alpha sort by caption
			dbPhotos = await req.prisma.photo.findMany({
				where: { siteSlug: SITE_SLUG },
				orderBy: [
					{ caption: 'asc' },           // alphabetical by caption
					{ createdAt: 'desc' }         // stable tie-breaker
				]
			});
		} else {
			// Random sort - ALWAYS fetch fresh and shuffle on the server
			dbPhotos = await req.prisma.photo.findMany({
				where: { siteSlug: SITE_SLUG },
				orderBy: { createdAt: 'desc' }
			});
			dbPhotos = shuffleArray(dbPhotos);
		}

		// Map to the format your EJS template expects
		const allImages = dbPhotos.map(photo => ({
			id: photo.id,
			src: photo.image,
			caption: photo.caption || '',
			home: photo.home || false,
		    bestMoment: photo.bestMoment,
			featured: photo.featured
		}));
		const initialImages = allImages.slice(0, PAGE_SIZE);

		// If this is a sort request (has ?sort=...), return JSON for client-side rendering
		if (req.query.sort) {
			return res.json({
				success: true,
				sort,
				images: initialImages,     // first page only
				allImages: allImages || [],      // full list for load more
				title,
				isAdmin: !!req.session?.isAdmin,
				pageSize: PAGE_SIZE
			});
		}

		// Initial page load - use EJS
		res.render('pictures', {
			headerTitle: config?.title || 'Memorial Site',
			title,
			allImages,
			images: initialImages,
			sort,
			searchQuery: '',
			isAdmin: !!req.session?.isAdmin,
			pageSize: PAGE_SIZE
		});
	} catch (err) {
		console.error('Pictures route error:', err);
		res.status(500).send('Error loading images');
	}
});

// ====================== SEARCH ======================
router.get('/search', async (req, res) => {
	const query = req.query.q ? req.query.q.trim().toLowerCase() : '';
	if (!query){ return res.redirect('/pictures'); }

	try {
		const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug: SITE_SLUG } });
		const baseTitle = config?.title || 'Memorial Gallery';
		const sort = req.query.sort || 'random';
		let dbPhotos = [];

		if (sort === 'chrono') {
			// Chronological search: newest takenAt first
			dbPhotos = await req.prisma.photo.findMany({
				where: {
					siteSlug: SITE_SLUG,
					caption: { contains: query, mode: 'insensitive' }
				},
				orderBy: [
					{ takenAt: { sort: 'desc', nulls: 'last' } },
					{ createdAt: 'desc' }
				]
			});
		} else if (sort === 'alpha') {
			dbPhotos = await req.prisma.photo.findMany({
				where: {
					siteSlug: SITE_SLUG,
					caption: { contains: query, mode: 'insensitive' }
				},
				orderBy: [
					{ caption: 'asc' },
					{ createdAt: 'desc' }
				]
			});
		} else {
			// Alpha or random: fetch matching captions
			dbPhotos = await req.prisma.photo.findMany({
				where: {
					siteSlug: SITE_SLUG,
					caption: { contains: query, mode: 'insensitive' }
				},
				orderBy: { createdAt: 'desc' }
			});
		}

		// Map to the format expected by your 'pictures' EJS template
		const allImages = dbPhotos.map(photo => ({
			id: photo.id,
			src: photo.image,
			caption: photo.caption || '',
			home: photo.home || false,
		    bestMoment: photo.bestMoment,
			featured: photo.featured
		}));
		const initialImages = allImages.slice(0, PAGE_SIZE);

		// JSON response for sorting
		if (req.query.sort) {
			return res.json({
				success: true,
				sort,
				images: initialImages,
				allImages,
				title: `${baseTitle} — Search: "${query}"`,
				isAdmin: !!req.session?.isAdmin,
				pageSize: PAGE_SIZE
			});
		} 

		// Initial page render
		res.render('pictures', {
			headerTitle: baseTitle,
			title: `${baseTitle} — Search: "${query}"`,
			allImages,
			images: initialImages,
			sort,
			searchQuery: query,
			isAdmin: !!req.session?.isAdmin,
			pageSize: PAGE_SIZE
		});

	} catch (err) {
		console.error('Search error:', err);
		res.status(500).send('Error processing search');
	}
});

// Best moments route
router.get('/best', async (req, res) => {
	try {
		const config = await req.prisma.siteConfig.findFirst({
			where: { siteSlug: SITE_SLUG }
		});
		const siteTitle = config ? config.title : 'Memorial Site';

		const featuredPhotos = await req.prisma.photo.findMany({
			where: { 
				featured: true, 
				siteSlug: SITE_SLUG 
			},
			orderBy: [
				{ takenAt: { sort: 'desc', nulls: 'last' } },   // primary sort: takenAt
				{ createdAt: 'desc' }                           // fallback / tie-breaker
			]
		});

		// Map to the format expected by your 'pictures' EJS template
		const images = featuredPhotos.map(photo => ({
			src: photo.image,
			caption: photo.caption || ''
		}));

		res.render('pictures', {
			headerTitle: config?.title || 'Memorial Site',
			title: `${siteTitle} - Best Moments`,
			images,
			sort: 'chrono',      // tells the template which sort is active
			searchQuery: '',
			isAdmin: !!req.session?.isAdmin
		});
	} catch (error) {
		console.error('Best moments error:', error);
		res.status(500).send('Error loading best moments');
	}
});

// Admin: Update caption (instant)
router.post('/api/photo/:id/caption', async (req, res) => {
	if (!req.session?.isAdmin) return res.status(401).json({ success: false });

	const photoId = parseInt(req.params.id);
	const { caption } = req.body;
	try {
		await req.prisma.photo.update({
			where: { id: photoId },
			data: { caption: caption || null }
		});
		res.json({ success: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false });
	}
});

// Admin: Toggle featured or bestMoment
router.post('/api/photo/:id/toggle', async (req, res) => {
	if (!req.session?.isAdmin) return res.status(401).json({ success: false });

	const photoId = parseInt(req.params.id);
	const { field } = req.body; // "featured", "bestMoment", or "home"
	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo) return res.status(404).json({ success: false });

		const newValue = !photo[field];

		await req.prisma.photo.update({
			where: { id: photoId },
			data: { [field]: newValue }
		});

		res.json({ success: true, newValue });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false });
	}
});

// Admin: Delete photo
router.delete('/api/photo/:id', async (req, res) => {
	if (!req.session?.isAdmin){ return res.status(401).json({ success: false, message: 'Unauthorized' }); }

	const photoId = parseInt(req.params.id);
	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo){ return res.status(404).json({ success: false, message: 'Photo not found' }); }

		// Delete file from disk
		const fs = await import('fs/promises');
		const pathModule = await import('path');
		const filePath = pathModule.join('public', 'images', photo.image);
		await fs.unlink(filePath).catch(err => {
			console.warn('File delete warning:', err.message);
		});

		// Delete from database
		await req.prisma.photo.delete({ where: { id: photoId } });
		res.json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		res.status(500).json({ success: false, message: 'Failed to delete photo' });
	}
});

export default router;