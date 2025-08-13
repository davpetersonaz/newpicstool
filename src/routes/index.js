//src/routes/index.js
import express from 'express';
const router = express.Router();

router.get('/', async (req, res) => {
    const bio = 'Harley is a lovable dog who enjoys park adventures and cozy naps.'; // Replace with DB or file-based bio
    res.render('index', { title: 'Little Man Harley', bio });
});

router.get('/bio', (req, res) => {
    res.render('bio', { title: 'About Harley' });
});

router.get('/gallery', async (req, res) => {
    const galleries = await req.app.locals.prisma.photo.findMany();
    res.render('gallery', { title: 'Gallery', galleries });
});

router.get('/best', async (req, res) => {
    const galleries = await req.app.locals.prisma.photo.findMany({ where: { featured: true } });
    res.render('gallery', { title: 'Best Moments', galleries });
});

router.get('/search', async (req, res) => {
    const query = req.query.q;
    const galleries = await req.app.locals.prisma.photo.findMany({
        where: { caption: { contains: query, mode: 'insensitive' } }
    });
    res.render('gallery', { title: `Search Results for "${query}"`, galleries });
});

export default router;