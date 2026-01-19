 app.get("/viewLeadReport", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;

  // console.log("user_type lead:", userType);
  // console.log("userId lead:", userId);
  // console.log("adminId:", adminId);

  let query = "";
  let params = [];

  if (userType == 9) {
  query = `
    SELECT DISTINCT ci.*
    FROM company_info ci
    JOIN users u ON ci.upload_user = u.user_id
    WHERE u.user_id IN (
      SELECT user_id FROM users WHERE SuperAdmin = ?
      UNION
      SELECT user_id FROM users
      WHERE admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
    )
    ORDER BY ci.id DESC;
  `;
  params = [userId, userId];


  // 🪵 Log the query and params
  // console.log("Running query:", query);
  // console.log("With params:", params);
  } 
  else if (userType == 8) {
    // Admin: Data uploaded by self and their users
    query = `
      SELECT DISTINCT ci.*
      FROM company_info ci
      JOIN users u ON ci.upload_user = u.user_id
      WHERE u.admin = ?
    `;
    params = [adminId];

  } else if (userType == 7) {
    // Manager: Self + users under them (TL, QA, Agents)
    query = `
      SELECT DISTINCT ci.*
      FROM company_info ci
      JOIN users u ON ci.upload_user = u.user_id
      WHERE u.user_id = ? OR ci.upload_user = ?
    `;
    params = [userId, userId];

  } else if (userType == 2) {
    // Team Leader: Self + their agents
    query = `
      SELECT DISTINCT ci.*
      FROM company_info ci
      JOIN users u ON ci.upload_user = u.user_id
      WHERE u.user_id = ? OR ci.upload_user = ?
    `;
    params = [userId, userId];

  } else if (userType == 6 || userType == 1) {
    // QA or IT: Only self
    query = `
      SELECT DISTINCT *
      FROM company_info
      WHERE upload_user = ?
    `;
    params = [userId];

  } else {
    return res.status(403).json({ message: "Unauthorized user type." });
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching data.", error: err });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ message: "No data found." });
    }

    return res.status(200).json(results);
  });
});




app.post("/reminders", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { datetime, message } = req.body;

  if (!datetime || !message) {
    return res.status(400).json({ message: "Date and message are required." });
  }

  const sql = `INSERT INTO reminders (user_id, datetime, message) VALUES (?, ?, ?)`;

  db.query(sql, [userId, datetime, message], (err, result) => {
    if (err) {
      console.error("Error inserting reminder:", err);
      return res.status(500).json({ message: "Failed to add reminder." });
    }
    res.status(201).json({ message: "Reminder created successfully." });
  });
});


app.get("/reminders", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const countQuery = `SELECT COUNT(*) AS total FROM reminders WHERE user_id = ?`;
  const dataQuery = `SELECT * FROM reminders WHERE user_id = ? ORDER BY datetime ASC LIMIT ? OFFSET ?`;

  db.query(countQuery, [userId], (err, countResult) => {
    if (err) {
      console.error("Count query failed:", err);
      return res.status(500).json({ message: "Failed to count reminders." });
    }

    const total = countResult[0].total;

    db.query(dataQuery, [userId, limit, offset], (err, dataResult) => {
      if (err) {
        console.error("Data query failed:", err);
        return res.status(500).json({ message: "Failed to get reminders." });
      }

      return res.status(200).json({
        total,
        data: dataResult,

      });
    });
  });
});


