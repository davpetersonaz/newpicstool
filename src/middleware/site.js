//src/middleware/site.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Middleware that attaches siteSlug and siteConfig to req
 * Also creates default SiteConfig if it doesn't exist yet
 */
export const siteMiddleware = async (req, res, next) => {
	try {
		// Get slug from environment (your current approach)
		let siteSlug = process.env.SITE_SLUG || 'slug';

		// Optional: Allow overriding via query param (useful during development or multi-site testing)
		if (req.query.siteSlug) {
			siteSlug = req.query.siteSlug;
		}

		// Attach to request
		req.siteSlug = siteSlug;

		// Fetch or create site config
		let config = await prisma.siteConfig.findUnique({
			where: { siteSlug }
		});

		if (!config) {
			config = await prisma.siteConfig.create({
				data: {
					siteSlug,
					title: 'Memorial Site',
					bio: 'In loving memory'
				}
			});
			// console.log(`Created new SiteConfig for: ${siteSlug}`);
		}

		req.siteConfig = config;

	} catch (error) {
		console.error('Site middleware error:', error);
		// Fallback values so the app doesn't crash
		req.siteSlug = process.env.SITE_SLUG || 'slug';
		req.siteConfig = {
			title: 'Memorial Site',
			bio: 'In loving memory'
		};
	}

	next();
};

export default siteMiddleware;