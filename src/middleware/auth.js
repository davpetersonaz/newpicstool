// src/middleware/auth.js
import session from 'express-session';

const sessionMiddleware = session({
	secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
	resave: false,
	saveUninitialized: false,
	proxy: true, //important for vercel
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',   // set to true in prod with HTTPS
		sameSite: 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 7   // 7 days
	}
});

// Protect admin routes
export const isAuthenticated = (req, res, next) => {
	if (req.session?.isAdmin) {
		return next();
	}

	if (req.headers['accept']?.includes('application/json') || req.xhr) {
		return res.status(401).json({ 
			success: false, 
			message: 'Session expired. Please log in again.',
			requireLogin: true 
		});
	}

	// Normal browser navigation → redirect
	res.redirect('/admin/login?error=Please log in');
};

export default sessionMiddleware;