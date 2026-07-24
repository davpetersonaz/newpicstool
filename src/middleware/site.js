//src/middleware/site.js
import { PrismaClient } from '@prisma/client';

import DOMAIN_TO_SLUG from '../config/domains.js';
import { getCachedConfig, setCachedConfig } from '../utils/configCache.js';

const prisma = new PrismaClient();

/**
 * Middleware that attaches siteSlug and siteConfig to req
 * Also creates default SiteConfig if it doesn't exist yet
 */
const siteMiddleware = async (req, res, next) => {
	try {
		const host = (req.headers.host || '').split(':')[0].toLowerCase(); // strip port
		let siteSlug = DOMAIN_TO_SLUG[host] || process.env.SITE_SLUG || 'slug';

		// Optional safety: allow ?siteSlug= override only in non-production
		if (process.env.NODE_ENV !== 'production' && req.query.siteSlug) {
			siteSlug = req.query.siteSlug;
		}

		// Attach to request
		req.siteSlug = siteSlug;

		// ===== CACHED CONFIG =====
		let config = getCachedConfig(siteSlug);

		if (!config) {
			config = await prisma.siteConfig.findUnique({ where: { siteSlug } });
			if (!config) {
				config = await prisma.siteConfig.create({
					data: {
						siteSlug,
						preTitle: 'Welcome to a celebration of the life and times of',
						title: 'Memorial Site',
						postTitle: 'R.I.P.',
						bio: 'In loving memory',
					},
				});
			}

			setCachedConfig(siteSlug, config);
		}

		req.siteConfig = config;
		res.locals.siteConfig = config;   // handy for EJS
		res.locals.siteSlug = siteSlug;

		next();
	} catch (err) {
		console.error('Site middleware error:', err);
		req.siteSlug = process.env.SITE_SLUG || 'slug';
		req.siteConfig = { title: 'Memorial Site', bio: 'In loving memory' };

		next();
	}
};

export default siteMiddleware;