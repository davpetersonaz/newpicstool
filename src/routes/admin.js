//src/routes/admin.js
import express from 'express';
import { isAdmin } from '../middleware/auth.js';
const router = express.Router();

router.get('/', isAdmin, (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
});

router.post('/delete/:id', isAdmin, async (req, res) => {
    await req.app.locals.prisma.photo.delete({ where: { id: parseInt(req.params.id) } });
    res.redirect('/admin');
});

router.post('/caption/:id', isAdmin, async (req, res) => {
    await req.app.locals.prisma.photo.update({
        where: { id: parseInt(req.params.id) },
        data: { caption: req.body.caption }
    });
    res.redirect('/admin');
});

router.post('/feature/:id', isAdmin, async (req, res) => {
    await req.app.locals.prisma.photo.update({
        where: { id: parseInt(req.params.id) },
        data: { featured: true }
    });
    res.redirect('/admin');
});

export default router;