// src/config/domains.js
const DOMAIN_TO_SLUG = {
	'myboydino.com': 'dino',
	'www.myboydino.com': 'dino',
	'littlemanharley.com': 'harley',
	'www.littlemanharley.com': 'harley',
	// local / preview
	'localhost': process.env.SITE_SLUG || 'dino',
	'127.0.0.1': process.env.SITE_SLUG || 'dino',
};

export default DOMAIN_TO_SLUG;