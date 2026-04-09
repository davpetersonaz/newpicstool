//src/routes/admin.js
import express from 'express';

const router = express.Router();

// Improved admin middleware
const isAdmin = (req, res, next) => {
    const providedSecret = req.query.secret || req.body.secret || req.headers['x-admin-secret'];

    console.log('Admin access attempt - Provided secret:', providedSecret ? '***present***' : 'missing');
    console.log('Expected secret from env:', process.env.ADMIN_SECRET ? '***present***' : 'missing');

    if (!process.env.ADMIN_SECRET) {
        console.error('ERROR: ADMIN_SECRET is not loaded from .env');
        return res.status(500).send('Server configuration error: ADMIN_SECRET not set');
    }

    if (providedSecret && providedSecret === process.env.ADMIN_SECRET) {
        req.isAdmin = true;
        return next();
    }

    // For browser access, we'll use a session-like cookie later, but for now use ?secret=...
    res.status(401).send(`
        <h1>Unauthorized</h1>
        <p>Access denied. Incorrect or missing admin secret.</p>
        <p>Make sure you are using ?secret=your-secret-here</p>
        <a href="/">Go Home</a>
    `);
};

// GET /admin - Show admin dashboard
router.get('/', isAdmin, async (req, res) => {
    try {
        let config = await req.prisma.siteConfig.findFirst({
            where: { siteSlug: process.env.SITE_SLUG || 'default' }
        });

        if (!config) {
            // Create default config if none exists
            config = await req.prisma.siteConfig.create({
                data: {
                    siteSlug: 'dino',
                    title: 'My Boy Dino',
                    bio: 'In loving memory of Dino ❤️'
                }
            });
        }

        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            config,
            adminSecret: process.env.ADMIN_SECRET   // We'll pass this for forms
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Error loading admin dashboard');
    }
});

// POST /admin/update - Save title and bio
router.post('/update', isAdmin, async (req, res) => {
    const { title, bio } = req.body;
    if (!title || !bio) {
        return res.status(400).send('Title and bio are required');
    }

    try {
        await req.prisma.siteConfig.upsert({
            where: { siteSlug: process.env.SITE_SLUG || 'default' },
            update: { title, bio },
            create: {
                siteSlug: process.env.SITE_SLUG || 'default',
                title,
                bio
            }
        });

        console.log('Site config updated successfully');
        res.redirect(`/admin?secret=${process.env.ADMIN_SECRET}`);
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).send('Error saving settings');
    }
});

export default router;