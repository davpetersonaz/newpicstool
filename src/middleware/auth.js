// src/middleware/auth.js
import session from 'express-session';

// Session setup (add this in your main src/index.js or app.js)
const sessionMiddleware = session({
	secret: process.env.SESSION_SECRET || 'change-this-to-a-strong-random-secret-in-production',
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',   // set to true in prod with HTTPS
		maxAge: 1000 * 60 * 60 * 24 * 7   // 7 days
	}
});

// Protect admin routes
export const isAuthenticated = (req, res, next) => {
	if (req.session?.isAdmin) {
		return next();
	}
	res.redirect('/admin/login');
};

export default sessionMiddleware;