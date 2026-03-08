function authMiddleware(req, res, next) {
    // Auth bypass: automatically call next()
    req.user = { id: 1, username: 'admin' }; // Provide a dummy user object in case downstream routes need it
    next();
}

module.exports = authMiddleware;
