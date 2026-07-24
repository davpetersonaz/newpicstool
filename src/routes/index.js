//src/routes/index.js
import { Prisma } from '@prisma/client';
import express from 'express';

import asyncHandler from '../middleware/asyncHandler.js';
import { sendError } from '../utils/errors.js';

import { deleteFromR2 } from './admin.js';

const router = express.Router();

// Global constants
const DEFAULT_PAGE_SIZE = 50;        // Desktop
const MOBILE_PAGE_SIZE = 12;         // Pictures on mobile
const MOBILE_VIDEO_LIMIT = 6;        // Videos on mobile
const DESKTOP_VIDEO_LIMIT = 20;      // Videos on desktop

// Helper to detect mobile
function isMobile(req) {
	const ua = req.headers['user-agent'] || '';
	return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/.test(ua);
}

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
router.get('/', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	const defaultConfig = {
		preTitle: 'Welcome to a celebration of the life and times of',
		title: 'Memorial Site',
		postTitle: 'R.I.P.',
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
					...defaultConfig
				}
			});
		}

		// Get all home photos
		const homePhotos = await req.prisma.photo.findMany({
			where: { home: true, siteSlug: siteSlug }
		});

		// Randomly select one home photo (if any)
		let homeImage = null;
		if (homePhotos.length > 0) {
			// Pick a random one
			const randomIndex = Math.floor(Math.random() * homePhotos.length);
			const selected = homePhotos[randomIndex];
			homeImage = {
				src: selected.image,
				alt: selected.caption || config.title
			};
		}

		res.render('index', {
			preTitle: config.preTitle,
			headerTitle: config.title || 'Memorial Site',
			title: config.title,
			postTitle: config.postTitle,
			googleAnalyticsId: config.googleAnalyticsId,
			bio: config.bio,
			homeImage
		});
	} catch (error) {
		console.error('Home route error:', error);
		res.render('index', { 
			...defaultConfig, 
			homeImage: null,
			googleAnalyticsId: null
		});
	}
}));

// ====================== PICTURES ======================
router.get('/pictures', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	const mobile = isMobile(req);
	const pageSize = mobile ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE;
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const sort = req.query.sort || 'random';
	const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
	const title = config?.title || 'Memorial Gallery';

	// Build orderBy
	let orderBy = [{ createdAt: 'desc' }];
	if (sort === 'chrono') {
		orderBy = [
			{ takenAt: { sort: 'desc', nulls: 'last' } },
			{ createdAt: 'desc' }
		];
	} else if (sort === 'alpha') {
		orderBy = [
			{ caption: 'asc' },
			{ createdAt: 'desc' }
		];
	}

	// For random we still have to fetch more and shuffle (limitation of true random)
	// We'll improve this later if needed
	const isRandom = (sort === 'random');
	let photos;
	let total = 0;

	if (isRandom) {
		total = await req.prisma.photo.count({ where: { siteSlug } });
		// let Postgres do the random ordering
		photos = await req.prisma.$queryRaw`
			SELECT * FROM "Photo"
			WHERE "siteSlug" = ${siteSlug}
			ORDER BY RANDOM()
			LIMIT ${pageSize}
			OFFSET ${(page - 1) * pageSize}
		`;
	} else {
		// Real DB pagination
		total = await req.prisma.photo.count({ where: { siteSlug } });
		photos = await req.prisma.photo.findMany({
			where: { siteSlug },
			orderBy,
			take: pageSize,
			skip: (page - 1) * pageSize
		});
	}

	const images = photos.map(photo => ({
		id: photo.id,
		src: photo.image,
		caption: photo.caption || '',
		home: photo.home || false,
		bestMoment: photo.bestMoment,
		featured: photo.featured
	}));

	const hasMore = page * pageSize < total;

	// AJAX request (Load More or sort change)
	if (req.query.page || req.query.sort || req.xhr || req.headers.accept?.includes('application/json')) {
		return res.json({
			success: true,
			images,
			page,
			pageSize,
			hasMore,
			nextPage: hasMore ? page + 1 : null,
			sort,
			title,
			isAdmin: !!req.session?.isAdmin
		});
	}

	// Normal first-page render
	res.render('pictures', {
		headerTitle: config?.title || 'Memorial Site',
		title,
		googleAnalyticsId: config?.googleAnalyticsId,
		pageSize,
		isMobile: mobile,
		images,               // only the first page
		featuredImages: [],
		bestImages: [],
		sort,
		searchQuery: '',
		isAdmin: !!req.session?.isAdmin,
		hasMore,
		nextPage: hasMore ? 2 : null
	});
}));

// ====================== SEARCH ======================
router.get('/search', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	const query = (req.query.q ? req.query.q.trim().toLowerCase() : '');
	if (!query){ return res.redirect('/pictures'); }
	if (query.length > 200) { return sendError(res, 400, 'Search query too long'); }
	const mobile = isMobile(req);
	const pageSize = (mobile ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE);
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const sort = (req.query.sort || 'random');
	const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
	const baseTitle = (config?.title || 'Memorial Gallery');
	const title = `${baseTitle} — Search: "${query}"`;

	const where = {
		siteSlug,
		caption: { contains: query, mode: 'insensitive' }
	};

	let orderBy = [{ createdAt: 'desc' }];
  	if (sort === 'chrono') {
    	orderBy = [
			{ takenAt: { sort: 'desc', nulls: 'last' } },
			{ createdAt: 'desc' }
		];
	} else if (sort === 'alpha') {
    	orderBy = [{ caption: 'asc' }, { createdAt: 'desc' }];
  	}

	const isRandom = sort === 'random';
	let photos;
	let total = 0;

	if (isRandom) {
		total = await req.prisma.photo.count({ where });
		photos = await req.prisma.$queryRaw`
			SELECT * FROM "Photo"
			WHERE "siteSlug" = ${siteSlug}
			AND "caption" ILIKE ${'%' + query + '%'}
			ORDER BY RANDOM()
			LIMIT ${pageSize}
			OFFSET ${(page - 1) * pageSize}
		`;
	} else {
		total = await req.prisma.photo.count({ where });
		photos = await req.prisma.photo.findMany({
			where,
			orderBy,
			take: pageSize,
			skip: (page - 1) * pageSize
		});
	}

	const images = photos.map(photo => ({
		id: photo.id,
		src: photo.image,
		caption: photo.caption || '',
		home: photo.home || false,
		bestMoment: photo.bestMoment,
		featured: photo.featured
	}));

	const hasMore = page * pageSize < total;

	if (req.query.page || req.query.sort || req.xhr || req.headers.accept?.includes('application/json')) {
		return res.json({
			success: true,
			images,
			page,
			pageSize,
			hasMore,
			nextPage: hasMore ? page + 1 : null,
			sort,
			title,
			isAdmin: !!req.session?.isAdmin,
			searchQuery: query
		});
	} 

	res.render('pictures', {
		headerTitle: baseTitle,
		title,
		googleAnalyticsId: config?.googleAnalyticsId,
		images,
		featuredImages: [],
		bestImages: [],
		sort,
		searchQuery: query,
		isAdmin: !!req.session?.isAdmin,
		pageSize,
		isMobile: mobile,
		hasMore,
		nextPage: hasMore ? 2 : null
	});
}));

// Best Moments route
router.get('/best', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const pageSize = DEFAULT_PAGE_SIZE;

	const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
	const baseTitle = config?.title || 'Memorial Site';
	const title = `${baseTitle} - Best Moments`;

	// Featured first, then bestMoment (non-featured)
  	const featured = await req.prisma.photo.findMany({
    	where: { featured: true, siteSlug },
		orderBy: { createdAt: 'desc' }
	});

  	const best = await req.prisma.photo.findMany({
    	where: { bestMoment: true, featured: false, siteSlug },
		orderBy: { createdAt: 'desc' }
	});

	const all = [...shuffleArray(featured), ...shuffleArray(best)];
	const total = all.length;
	const start = (page - 1) * pageSize;
	const pagePhotos = all.slice(start, start + pageSize);

	const images = pagePhotos.map(photo => ({
		id: photo.id,
		src: photo.image,
		caption: photo.caption || '',
    	home: photo.home || false,
		bestMoment: photo.bestMoment,
    	featured: photo.featured
	}));
  	const hasMore = page * pageSize < total;

  	if (req.query.page || req.xhr || req.headers.accept?.includes('application/json')) {
    	return res.json({
			success: true,
			images,
			page,
			pageSize,
			hasMore,
			nextPage: hasMore ? page + 1 : null,
			title,
			isAdmin: !!req.session?.isAdmin
		});
	}

	res.render('pictures', {
		headerTitle: baseTitle,
		title,
		googleAnalyticsId: config?.googleAnalyticsId,
		images,
		featuredImages: [],      // we flattened them
		bestImages: [],
		sort: 'random',
		searchQuery: '',
		isAdmin: !!req.session?.isAdmin,
		pageSize,
		isMobile: false,
		hasMore,
		nextPage: hasMore ? 2 : null
	});
}));

// ====================== VIDEOS ======================
router.get('/videos', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	const mobile = isMobile(req);
	const pageSize = mobile ? MOBILE_VIDEO_LIMIT : DESKTOP_VIDEO_LIMIT;
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const sort = req.query.sort || 'random';
	const showBestOnly = req.query.best === 'true';

	const config = await req.prisma.siteConfig.findFirst({ where: { siteSlug } });
	const baseTitle = config?.title || 'Memorial Site';
	const title = showBestOnly 
		? `${baseTitle} - Video Best Moments` 
		: `${baseTitle} - Videos`;

	const where = { siteSlug };
	if (showBestOnly){ where.bestMoment = true; }

	let orderBy = [{ createdAt: 'desc' }];
	if (sort === 'chrono'){ orderBy = [{ takenAt: 'desc' }]; }
	if (sort === 'alpha'){ orderBy = [{ title: 'asc' }]; }

	const isRandom = sort === 'random';
	let videos;
	let total = 0;

	if (isRandom) {
		total = await req.prisma.video.count({ where });
		videos = await req.prisma.$queryRaw`
			SELECT * FROM "Video"
			WHERE "siteSlug" = ${siteSlug}
			${showBestOnly ? Prisma.sql`AND "bestMoment" = true` : Prisma.empty}
			ORDER BY RANDOM()
			LIMIT ${pageSize}
			OFFSET ${(page - 1) * pageSize}
		`;
	} else {
		total = await req.prisma.video.count({ where });
		videos = await req.prisma.video.findMany({
			where,
			orderBy,
			take: pageSize,
			skip: (page - 1) * pageSize
		});
	}

	const mapped = videos.map(v => ({
		id: v.id,
		youtubeId: v.youtubeId,
		title: v.title,
		description: v.description,
		thumbnail: v.thumbnail,
		takenAt: v.takenAt,
		bestMoment: v.bestMoment
	}));

	const hasMore = page * pageSize < total;

	if (req.query.page || req.query.sort || req.query.best || req.xhr || req.headers.accept?.includes('application/json')) {
		return res.json({
			success: true,
			videos: mapped,
			page,
			pageSize,
			hasMore,
			nextPage: hasMore ? page + 1 : null,
			sort,
			showBestOnly,
			isMobile: mobile
		});
	}

	res.render('videos', {
		headerTitle: baseTitle,
		title,
		googleAnalyticsId: config?.googleAnalyticsId,
		videos: mapped,
		sort,
		showBestOnly: !!showBestOnly,
		isMobile: mobile,
		hasMore,
		nextPage: hasMore ? 2 : null
	});
}));

// Admin: Update caption (instant)
router.post('/api/photo/:id/caption', asyncHandler(async (req, res) => {
	if (!req.session?.isAdmin){ return sendError(res, 401, '!isAdmin'); }

	const photoId = parseInt(req.params.id);
	if (isNaN(photoId)){ return sendError(res, 400, 'Invalid photo ID'); }
	const siteSlug = req.siteSlug;
	let { caption } = req.body;
	caption = (caption || '').trim();
	if (caption.length > 500) { return sendError(res, 400, 'Caption too long (max 500 characters)'); }
	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo || photo.siteSlug !== siteSlug) {
			return sendError(res, 404, 'siteSlug error');
		}
		await req.prisma.photo.update({
			where: { id: photoId },
			data: { caption: caption || null }
		});
		res.json({ success: true });
	} catch (err) {
		console.error(err);
		return sendError(res, 500, 'failed to instant-update caption');
	}
}));

// Admin: Toggle featured or bestMoment
router.post('/api/photo/:id/toggle', asyncHandler(async (req, res) => {
	if (!req.session?.isAdmin){ return sendError(res, 401, '!isAdmin'); }

	const photoId = parseInt(req.params.id);
	if (isNaN(photoId)){ return sendError(res, 400, 'Invalid photo ID'); }
	const siteSlug = req.siteSlug;
	const { field } = req.body; // "featured", "bestMoment", or "home"
	const allowedFields = ['featured', 'bestMoment', 'home'];
	if (!allowedFields.includes(field)) { return sendError(res, 400, 'Invalid field'); }
	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo || photo.siteSlug !== siteSlug) {
			return sendError(res, 404, 'siteSlug error');
		}
		const newValue = !photo[field];
		await req.prisma.photo.update({
			where: { id: photoId },
			data: { [field]: newValue }
		});
		res.json({ success: true, newValue });
	} catch (err) {
		console.error(err);
		return sendError(res, 500, 'failed to toggle featured/bestmoment');
	}
}));

// Admin: Delete photo
router.delete('/api/photo/:id', asyncHandler(async (req, res) => {
	if (!req.session?.isAdmin){ return sendError(res, 401, 'Unauthorized'); }

	const photoId = parseInt(req.params.id);
	if (isNaN(photoId)){ return sendError(res, 400, 'Invalid photo ID'); }
	const siteSlug = req.siteSlug;
	try {
		const photo = await req.prisma.photo.findUnique({ where: { id: photoId } });
		if (!photo || photo.siteSlug !== siteSlug) { return sendError(res, 404, 'siteSlug error'); }
		// Delete from R2
		if (photo.image && photo.image.startsWith('http')) {
			try {
				await deleteFromR2(photo.image);
			} catch (r2Err) {
				console.warn('R2 delete warning:', r2Err.message);
			}
		} 
		// Delete from database
		await req.prisma.photo.delete({ where: { id: photoId } });
		res.json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		return sendError(res, 500, 'Failed to delete photo' );
	}
}));

export default router;