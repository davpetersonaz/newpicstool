//src/routes/auth.js
import bcrypt from 'bcryptjs';
import express from 'express';

import asyncHandler from '../middleware/asyncHandler.js';

const router = express.Router();

// Admin Login GET
router.get('/admin/login', (req, res) => {
	res.render('admin/login', { 
		title: 'Admin Login',
		error: req.query.error || null 
	});
});

// Admin Login POST
router.post('/admin/login', asyncHandler(async (req, res) => {
	const siteSlug = req.siteSlug;
	let { username, password } = req.body;
	username = (username || '').trim();
	password = (password || '');
	if (!username || !password) { return res.redirect('/admin/login?error=Username and password are required'); }
	if (typeof username !== 'string' || typeof password !== 'string') { return res.redirect('/admin/login?error=Invalid input'); }
	if (username.length > 100 || password.length > 200) { return res.redirect('/admin/login?error=Input too long'); }

	try {
		const admin = await req.prisma.admin.findUnique({
			where: { 
				siteSlug_username: {
					siteSlug: siteSlug,
					username: username
				}
			}
		});
		if (!admin || !(await bcrypt.compare(password, admin.password))) {
			return res.redirect('/admin/login?error=Invalid credentials');
		}

		// Set session
		req.session.isAdmin = true;
		req.session.adminUsername = username;
		res.redirect('/admin');
	} catch (err) {
		console.error('Login error:', err);
		res.redirect('/admin/login?error=Server error');
	}
}));

// Admin Logout
router.get('/admin/logout', (req, res) => {
	req.session.destroy((err) => {
		if (err){ console.error('Logout error:', err); }
		res.redirect('/');
	});
});

export default router;