// src/utils/errors.js
export function sendError(res, status, message = 'Something went wrong') {
	return res.status(status).json({
		success: false,
		message
	});
}