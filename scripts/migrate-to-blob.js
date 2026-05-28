// scripts/migrate-to-blob.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import { put } from '@vercel/blob';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
	console.warn('🚀 Starting migration to Vercel Blob with optimization...');

	const photos = await prisma.photo.findMany({
		where: { siteSlug: process.env.SITE_SLUG }
	});
	console.warn(`Found ${photos.length} photos to migrate.`);

	let success = 0;
	let failed = 0;
	for (const photo of photos) {
		const localPath = path.join(__dirname, '../public/images', photo.image);
		if (!fs.existsSync(localPath)) {
			console.warn(`⚠️ File not found: ${photo.image}`);
			failed++;
			continue;
		}

		try {
			let buffer = fs.readFileSync(localPath);
			const originalSize = (buffer.length / 1024 / 1024).toFixed(2);

			// Optimize only if bigger than 3.5 MB
			if (buffer.length > 3.5 * 1024 * 1024) {
				console.warn(`🔄 Optimizing ${photo.image} (${originalSize} MB)`);
				buffer = await sharp(buffer)
					.resize(2000, 2000, { 
						fit: 'inside', 
						withoutEnlargement: true 
					})
					.jpeg({ quality: 88 })
					.toBuffer();
			}

			const newSize = (buffer.length / 1024 / 1024).toFixed(2);
			const originalName = photo.originalFilename || `photo-${photo.id}.jpg`;
			const { url } = await put(originalName, buffer, {
				access: 'public',
				addRandomSuffix: true,
		        token: process.env.BLOB_READ_WRITE_TOKEN
			});

			// Update the database with the new full URL
			await prisma.photo.update({
				where: { id: photo.id },
				data: { image: url }
			});
			console.warn(`✅ Migrated: ${originalName}  (${originalSize} → ${newSize} MB)`);
			success++;
		} catch (err) {
			console.error(`❌ Failed to migrate ${photo.image}:`, err.message);
			failed++;
		}
	}

	console.warn('\n🎉 Migration complete!');
	console.warn(`   Successfully migrated: ${success}`);
	console.warn(`❌ Failed: ${failed}`);

	await prisma.$disconnect();
}

main().catch(console.error);