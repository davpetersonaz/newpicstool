//src/routes/index.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', async (req, res) => {
    const bio = 'Harley is a lovable dog who enjoys park adventures and cozy naps.'; // Replace with DB or file-based bio
    res.render('index', { title: 'Little Man Harley', bio });
});

router.get('/pictures', async (req, res) => {
    try {
        // Path to the images folder
        const imagesDir = path.join(__dirname, '../../public/images');

        // Read all files in the images directory
        const files = await fs.readdir(imagesDir);

        // Filter for common image file extensions
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const images = files
            .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
            .map(file => ({
                src: `/images/${file}`,
                name: path.basename(file, path.extname(file))
        })); // Relative path for serving

        // Randomize the images
        const randomizedImages = shuffleArray([...images]);

        // Render the EJS template with the images
        res.render('pictures', { images: randomizedImages });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading images');
    }
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

// Helper function to shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default router;