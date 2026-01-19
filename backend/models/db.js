 
const mysql = require('mysql');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'cron',
    password: 'Cron@12345!', 
    database: 'telephony_db',
    multipleStatements: true    
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1); 
    } else {
        console.log('Connected to database');
    }
});

 

module.exports = db;
