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
                        // Check multiple EXIF and XMP/IPTC date fields
                        let exifDate = exifData.DateTimeOriginal?.value ||
                                      exifData.DateTime?.value ||
                                      exifData.CreateDate?.value ||
                                      exifData.ModifyDate?.value ||
                                      exifData['Date/Time Original']?.value ||
                                      exifData['Date/Time Created']?.value ||
                                      exifData.DateCreated?.value ||
                                      exifData['xmp:DateCreated']?.value;

                        // Handle array-wrapped strings (e.g., ["2019:07:31 23:18:03"])
                        if (Array.isArray(exifDate) && exifDate.length > 0 && typeof exifDate[0] === 'string') {
                            exifDate = exifDate[0];
                        }

                        // Debug: Log raw DateTimeOriginal and CreateDate
                        console.log(`Raw DateTimeOriginal for ${file}: ${JSON.stringify(exifData.DateTimeOriginal?.value)}`);
                        console.log(`Raw CreateDate for ${file}: ${JSON.stringify(exifData.CreateDate?.value)}`);

                        // Handle XMP Date Created + Time Created
                        if (!exifDate && (exifData['Date Created']?.value || exifData['xmp:DateCreated']?.value)) {
                            let dateStr = exifData['Date Created']?.value || exifData['xmp:DateCreated']?.value;
                            let timeStr = exifData['Time Created']?.value || '00:00:00';

                            // Convert arrays to strings if necessary
                            dateStr = Array.isArray(dateStr) ? String.fromCharCode(...dateStr) : dateStr;
                            timeStr = Array.isArray(timeStr) ? String.fromCharCode(...timeStr) : timeStr;

                            // Debug: Log raw and converted values
                            console.log(`Raw Date Created for ${file}: ${JSON.stringify(exifData['Date Created']?.value)}`);
                            console.log(`Converted Date Created for ${file}: ${dateStr}`);
                            console.log(`Raw xmp:DateCreated for ${file}: ${JSON.stringify(exifData['xmp:DateCreated']?.value)}`);
                            console.log(`Raw Time Created for ${file}: ${JSON.stringify(exifData['Time Created']?.value)}`);
                            console.log(`Converted Time Created for ${file}: ${timeStr}`);

                            if (typeof dateStr === 'string') {
                                timeStr = typeof timeStr === 'string' ? timeStr.split('-')[0].trim() : '00:00:00';
                                exifDate = `${dateStr} ${timeStr}`;
                            }
                        }

                        if (exifDate) {
                            // Handle array or string
                            let dateStr = Array.isArray(exifDate) ? String.fromCharCode(...exifDate) : exifDate;
                            if (typeof dateStr === 'string') {
                                let parsedDate;
                                // Normalize to ISO 8601 (YYYY-MM-DDTHH:mm:ss) for reliable parsing
                                if (dateStr.match(/^\d{4}[:-]\d{2}[:-]\d{2} \d{2}:\d{2}:\d{2}$/)) {
                                    // Full datetime (YYYY:MM:DD HH:mm:ss or YYYY-MM-DD HH:mm:ss)
                                    dateStr = dateStr.replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
                                    parsedDate = new Date(dateStr.replace(' ', 'T')); // Convert to YYYY-MM-DDTHH:mm:ss
                                } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/)) {
                                    // ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
                                    parsedDate = new Date(dateStr);
                                } else if (dateStr.match(/^\d{4}[:-]\d{2}[:-]\d{2}$/)) {
                                    // Date only (YYYY:MM:DD or YYYY-MM-DD)
                                    dateStr = dateStr.replace(/(\d{4})[:-](\d{2})[:-](\d{2})/, '$1-$2-$3');
                                    parsedDate = new Date(`${dateStr}T00:00:00`);
                                }
                                if (!isNaN(parsedDate)) {
                                    console.log(`Parsed Date for ${file}: ${parsedDate.toISOString()}`);
                                    createdAt = parsedDate;
                                } else {
                                    console.warn(`Invalid EXIF date format for ${file}: ${dateStr}`);
                                }
                            } else {
                                console.warn(`EXIF date is not a string for ${file}: ${JSON.stringify(exifDate)}`);
                            }
                        } else {
                            // Log available EXIF fields for debugging
                            const hasExif = Object.keys(exifData).length > 0;
                            if (hasExif) {
                                const availableFields = Object.keys(exifData).join(', ');
                                console.warn(`No EXIF date fields (DateTimeOriginal, DateTime, CreateDate, ModifyDate, Date/Time Original, Date/Time Created, DateCreated, Date Created/Time Created, xmp:DateCreated) for ${file}; available EXIF fields: ${availableFields}`);
                            } else {
                                console.warn(`No EXIF data for ${file}`);
                            }
                        }
                    } catch (exifError) {
                        console.warn(`Failed to read EXIF data for ${file}: ${exifError.message}`);
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