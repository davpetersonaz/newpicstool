//src/middleware/auth.js
export const isAdmin = (req, res, next) => {
    if (req.query.secret === process.env.ADMIN_SECRET) {
        return next();
    }
    res.status(403).send('Unauthorized');
};