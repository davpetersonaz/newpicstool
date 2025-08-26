//src/routes/index.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ExifReader from 'exifreader';

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
        const images = await Promise.all(
            files
                .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
                .map(async file => {
                    const filePath = path.join(imagesDir, file);
                    const stats = await fs.stat(filePath);
                    let createdAt = stats.birthtime; // Default to file birthtime

                    // Try to get EXIF date
                    try {
                        const exifData = await ExifReader.load(filePath);
                        const exifDate = exifData.DateTimeOriginal?.value || exifData.DateTime?.value;
                        if (exifDate) {
                            // Parse EXIF date (e.g., "2023:04:15 12:00:00")
                            const dateStr = exifData.DateTimeOriginal?.value || exifData.DateTime?.value
                            const parsedDate = new Date(dateStr.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
                            if (!isNaN(parsedDate)) {
                                createdAt = parsedDate;
                            }
                        }
                    } catch (exifError) {
                        console.warn(`No EXIF data for ${file}: ${exifError.message}`);
                    }

                    return {
                        src: `/images/${file}`,
                        name: path.basename(file, path.extname(file)),
                        createdAt
                    };
                })
        );

        // Get sort parameter (default: random)
        const sort = req.query.sort || 'random';
        let sortedImages = [...images];

        // Sort images based on query parameter
        if (sort === 'alpha') {
            sortedImages.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === 'chrono') {
            sortedImages.sort((a, b) => a.createdAt - b.createdAt);
        } else {
            // Default: random
            sortedImages = shuffleArray(sortedImages);
        }

        // Render the EJS template with the images and current sort
        res.render('pictures', { images: sortedImages, sort });
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