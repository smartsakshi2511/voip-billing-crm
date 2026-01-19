const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Uploads directory created successfully.');
    }
} catch (error) {
    console.error('Error creating uploads directory:', error);
}

// Configure Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // Save to the uploads directory
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Unique filename
    }
});

const upload = multer({ storage: storage });

// Export middleware for multiple file fields
const uploadFields = upload.fields([
    { name: 'welcomeIVR', maxCount: 1 },
    { name: 'afterOfficeIVR', maxCount: 1 },
    { name: 'callOnHoldMusic', maxCount: 1 },
    { name: 'ringToneMusic', maxCount: 1 },
    { name: 'noAgentIVR', maxCount: 1 },
    { name: 'weekOffIVR', maxCount: 1 },
]);

module.exports = uploadFields;
