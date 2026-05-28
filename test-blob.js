//test-blob.js
import { put } from '@vercel/blob';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
	try {
		const { url } = await put('test-upload.jpg', 'Hello from picstool test!', {
			access: 'public',
			addRandomSuffix: true,
			token: process.env.BLOB_READ_WRITE_TOKEN
		});
		console.warn('✅ SUCCESS! Test file uploaded.');
		console.warn('URL:', url);
	} catch (err) {
		console.error('❌ FAILED:', err.message);
	}
}

test();
