//src/routes/auth.js
import bcrypt from 'bcryptjs';
import express from 'express';

const router = express.Router();
const SITE_SLUG = process.env.SITE_SLUG || 'slug';

// Admin Login GET
router.get('/admin/login', (req, res) => {
	res.render('admin/login', { 
		title: 'Admin Login',
		error: req.query.error || null 
	});
});

// Admin Login POST
router.post('/admin/login', async (req, res) => {
	const { username, password } = req.body;
	try {
		const admin = await req.prisma.admin.findUnique({
			where: { 
				siteSlug_username: {
					siteSlug: SITE_SLUG,
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
});

// Admin Logout
router.get('/admin/logout', (req, res) => {
	req.session.destroy((err) => {
		if (err){ console.error('Logout error:', err); }
		res.redirect('/');
	});
});

export default router;