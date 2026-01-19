require("dotenv").config();
const util = require("util");
const { Server } = require("socket.io");
const axios = require("axios");
const express = require("express");
const https = require("https");
const cors = require("cors");
const multer = require("multer");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const path = require("path");
const XLSX = require("xlsx");
const jwt = require("jsonwebtoken");
const Routes = require("./routes/authRoute");
const groupRoutes = require("./routes/groupRoute");
const dataUploadRoute = require("./routes/dataUploadRoute");
const campaignRoute = require("./routes/campaignRoutes");
const Block = require("./routes/blockRoute");
const dispoRoute = require("./routes/dispositionRoute");
const Calls = require("./routes/CallsRoute");
const IVR = require("./routes/ivrRoute");
const log = require("./routes/LoginRoute");
const Extn = require("./routes/extensionRoute");
const LeadCall = require("./routes/callLeadRoute");
const app = express();
const db = require("./models/db");
const PORT = 4000;
const fs = require("fs");
const JWT_SECRET = "0987654321";
const imaps = require("imap-simple");
const moment = require("moment");
const query = util.promisify(db.query).bind(db);
app.use(express.json());
const getIp = (req) => req.ip || req.connection.remoteAddress;
const imageDir = path.join(__dirname, "uploads/img");
const excelDir = path.join(__dirname, "uploads/excel");
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir);
if (!fs.existsSync(excelDir)) fs.mkdirSync(excelDir);

const audioDir = path.join(__dirname, "ivr");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token || !token.startsWith("Bearer")) {
    return res.status(401).send("Access denied or incorrect token format.");
  }
  const tokenWithoutBearer = token.slice(7);
  jwt.verify(tokenWithoutBearer, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send("Invalid token.");
    }
    req.user = user;
    next();
  });
};

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, path) => {
      if (path.endsWith(".mp3")) {
        res.setHeader("Content-Type", "audio/mpeg");
      }
    },
  })
);
const bill = express();
bill.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase();

    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(fileExt)) {
      cb(null, imageDir);
    } else if ([".xls", ".xlsx", ".csv"].includes(fileExt)) {
      cb(null, excelDir);
    } else {
      cb(new Error("Invalid file type"), null);
    }
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "POST", "DELETE", "PUT", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
//----------------------------------------------------------------------------------------------------------------------------
app.use("/ivr", express.static(audioDir));
app.use(bodyParser.json());
app.use("/log", log);
app.use("/telephony", authenticateToken, Routes);
app.use("/groupList", authenticateToken, groupRoutes);
app.use("/data", dataUploadRoute);
app.use("/campaigns", authenticateToken, campaignRoute);
app.use("/dispo", authenticateToken, dispoRoute);
const protectedRoutes = [Calls, Block, Extn, LeadCall, IVR];
protectedRoutes.forEach((route) => app.use("/", authenticateToken, route));

app.post("/send-email", async (req, res) => {
  const {
    to_emails,
    subject,
    email_body,
    Agents = 0,
    Admin = 0,
    type = "admin",
  } = req.body;

  const ip = getIp(req);

  if (!to_emails || !subject || !email_body) {
    return res.status(400).json({ message: "Missing required fields." });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: to_emails,
      subject,
      html: email_body,
    });

    const sql = `INSERT INTO email_logs (to_emails, subject, email_body, status, type, Agents, Admin, Ip_Address)
                 VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`;

    db.query(
      sql,
      [to_emails, subject, email_body, type, Agents, Admin, ip],
      (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.status(200).json({ message: "Email sent and logged." });
      }
    );
  } catch (error) {
    console.error("Email send failed:", error);

    const sql = `INSERT INTO email_logs (to_emails, subject, email_body, status, type, Agents, Admin, Ip_Address)
                 VALUES (?, ?, ?, 'failed', ?, ?, ?, ?)`;

    db.query(
      sql,
      [to_emails, subject, email_body, type, Agents, Admin, ip],
      () => {
        res.status(500).json({ message: "Failed to send email." });
      }
    );
  }
});

app.get("/emails", (req, res) => {
  db.query(
    "SELECT * FROM email_logs ORDER BY Create_time DESC",
    (err, results) => {
      if (err)
        return res.status(500).json({ message: "Failed to fetch emails." });
      res.status(200).json(results);
    }
  );
});

app.get("/incoming-emails", async (req, res) => {
  const config = {
    imap: {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASS,
      host: "imap.hostinger.com",
      port: 993,
      tls: true,
      authTimeout: 3000,
    },
  };

  try {
    const connection = await imaps.connect(config);
    await connection.openBox("INBOX");
    const searchCriteria = ["ALL"];
    const fetchOptions = {
      bodies: ["HEADER", "TEXT"],
      markSeen: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    const emails = messages.map((message) => {
      const header = message.parts.find((part) => part.which === "HEADER");
      const text = message.parts.find((part) => part.which === "TEXT");
      return {
        from: header.body.from?.[0] || "",
        subject: header.body.subject?.[0] || "",
        date: header.body.date?.[0] || "",
        body: text?.body || "No content",
      };
    });

    res.json(emails);
  } catch (err) {
    console.error("IMAP Error:", err);
    res.status(500).json({ error: "Failed to fetch inbox emails" });
  }
});

app.get("/company-info/search", authenticateToken, (req, res) => {
  try {
    const raw = req.query.number || "";

    // Extract digits
    const digits = (raw.match(/\d+/g) || []).join("");
    if (!digits) return res.json({ found: false });

    const last6 = digits.slice(-6);

    const sql = `
      SELECT 
      city,
        email,
        name,
        phone_number,
        company_name,
        city,
        country,
        department,
        designation,
        remark
      FROM company_info
      WHERE REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', '') LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `;

    const params = [`%${last6}`];

    db.query(sql, params, (err, rows) => {
      if (err) {
        console.error("Company search error:", err);
        return res.status(500).json({ found: false, error: "Server error" });
      }

      if (!rows || rows.length === 0) {
        return res.json({ found: false });
      }

      return res.json({
        found: true,
        data: rows[0]
      });
    });
  } catch (err) {
    console.error("Company search error:", err);
    res.status(500).json({ found: false, error: "Server error" });
  }
});



app.post("/admin/user", authenticateToken, async (req, res) => {
  try {
    const {
      user_id,
      password,
      user_type,
      agent_priorty,
      full_name,
      campaigns_id,
      campaign_name,
      use_did,
      ext_number,
      admin,
    } = req.body;

    const newUser = {
      user_id,
      password,
      user_type,
      agent_priorty,
      full_name,
      campaigns_id,
      campaign_name,
      use_did,
      ext_number,
      admin,
    };

    await addUserToDB(newUser);

    res.status(200).json({ message: "User added successfully." });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Internal Server Error." });
  }
});

//--------------------------------------------------------------------------------------------------

app.get("/viewLeadReport", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;

    console.log("==== Lead Report Debug ====");
  console.log("userId:", req.user.userId);
  console.log("userType:", req.user.userType);
  console.log("adminId:", req.user.admin);

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
  } else if (userType == 8) {
    query = `
      SELECT DISTINCT ci.*
      FROM company_info ci
      JOIN users u ON ci.upload_user = u.user_id
      WHERE u.admin = ? 
    `;
    params = [adminId];
  } else if (userType == 7) {
    query = `
      SELECT DISTINCT ci.*
      FROM company_info ci
      JOIN users u ON ci.upload_user = u.user_id
      WHERE u.user_id = ? OR ci.upload_user = ?
    `;
    params = [userId, userId];
  } else if (userType == 2) {
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
      WHERE upload_user = ? ORDER BY id DESC;
    `;
    params = [userId];
      console.log("Final Query:", query);
  console.log("Params:", params);

  } else {
    return res.status(403).json({ message: "Unauthorized user type." });
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching data.", error: err });
    }
 return res.status(200).json(results || []);
  });
});

//--------------------------------------------------------------------------------------------------

app.get("/campaigns_dropdown", authenticateToken, (req, res) => {
  const userType = req.user.userType;
  const userId = req.user.userId;
  const adminId = req.user.admin;

  let sql, params;

  if (userType == 8) {
    sql = `
      SELECT compaign_id, compaignname 
      FROM compaign_list 
      WHERE admin = ?`;
    params = [adminId];
  } else if (userType == 9) {
    sql = `
  SELECT compaign_id, compaignname
  FROM compaign_list
  WHERE admin = ? 
     OR admin IN (
       SELECT u.admin FROM users u WHERE u.SuperAdmin = ?
     )`;
    params = [userId, userId]; // first one for self, second for sub-admins

    // console.log("SQL:", sql, "Params:", params);
  } else if (userType == 7) {
    sql = `
 SELECT compaign_id, compaignname 
      FROM compaign_list 
      WHERE admin = ?`;
    params = [userId];
  } else if (userType == 2) {
    sql = `
      SELECT DISTINCT campaign_name AS compaign_id 
      FROM login_log 
      WHERE user_name = ?`;
    params = [userId];
  } else {
    return res.status(403).json({ error: "Unauthorized access." });
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ error: "Internal server error." });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "No campaigns found." });
    }

    const formatted = result.map((row, index) => ({
      compaign_id: row.compaign_id || index + 1,
      compaignname: row.compaignname,
    }));

    res.json(formatted);
  });
});

//------------------------------------------------------------------------------------------------------------
app.post("/checkSession", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    const user_id = decoded.userId;
    const query = `
      SELECT emg_log_out, token 
      FROM login_log 
      WHERE user_name = ? 
      ORDER BY id DESC 
      LIMIT 1
    `;

    db.query(query, [user_id], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Internal server error." });
      }

      if (
        results.length === 0 ||
        !results[0].token ||
        results[0].token !== token
      ) {
        return res
          .status(401)
          .json({ message: "Session expired. Please log in again." });
      }

      if (results[0].emg_log_out === 1) {
        return res
          .status(403)
          .json({ message: "You have been logged out by the admin." });
      }

      res.json({ message: "Session is active." });
    });
  });
});

//--------------------------------------------------------------------------------------------------
app.get("/weater", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const query = `SELECT  * FROM users WHERE user_id = ?`;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching user data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No users found." });
    }

    let i = 0;
    const users = [];

    while (i < results.length) {
      const user = results[i];
      users.push(user);
      i++;
    }
    return res.status(200).json(users);
  });
});

//--------------------------------------------------------------------------------------------------

app.post("/logoutAgent/:user_id", authenticateToken, (req, res) => {
  const { user_id } = req.params;
  const adminId = req.user.admin;

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  const checkQuery = `
    SELECT * FROM login_log 
    WHERE user_name = ? AND status = 1 
    ORDER BY id DESC 
    LIMIT 1
  `;
  db.query(checkQuery, [user_id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "User is not logged in or does not exist." });
    }
    const updateQuery = `
   UPDATE login_log 
   SET status = 2, emg_log_out = 1, emg_log_out_time = NOW(), log_out_time = NOW()
   WHERE user_name = ? AND status = 1 AND admin = ?
 `;
    db.query(updateQuery, [adminId, user_id], (err, result) => {
      if (err) {
        console.error("Error logging out agent:", err);
        return res.status(500).json({ message: "Failed to log out agent." });
      }
      res.json({
        message: `Agent ${user_id} has been logged out by Admin ${adminId}.`,
      });
    });
  });
});

//--------------------------------upload data select(view) query--------------------------

app.get("/list", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  const listQuery = "SELECT * FROM lists WHERE admin = ? ORDER BY LIST_ID ASC";

  db.query(listQuery, [userId], (err, lists) => {
    if (err) {
      return res.status(500).send("Error fetching lists");
    }

    if (lists.length === 0) {
      return res.status(404).json({ message: "No lists found." });
    }

    const leadCountPromises = lists.map((list) => {
      return new Promise((resolve, reject) => {
        const leadQuery = `
          SELECT COUNT(*) as LEADS_COUNT
          FROM upload_data
          WHERE admin = ? AND list_id = ? AND dial_status = 'NEW'
        `;

        db.query(leadQuery, [userId, list.LIST_ID], (err, leadResult) => {
          if (err) {
            console.error("Error fetching lead count:", err);
            reject(err);
          } else {
            resolve({
              ...list,
              LEADS_COUNT: leadResult[0].LEADS_COUNT || 0,
            });
          }
        });
      });
    });

    Promise.all(leadCountPromises)
      .then((finalData) => {
        res.status(200).json(finalData);
      })
      .catch((error) => {
        res.status(500).json({ error: "Error fetching lead counts" });
      });
  });
});

//--------------------------------upload data insert query--------------------------

app.post("/listAdd", authenticateToken, (req, res) => {
  const { LIST_ID, NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE } =
    req.body;
  const adminId = req.user.admin || req.user.userId;
  console.log("djd", adminId);
  const createTime = new Date();

  const query = `
    INSERT INTO lists 
    (LIST_ID, NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE, ADMIN, RTIME) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [
      LIST_ID,
      NAME,
      DESCRIPTION,
      LEADS_COUNT,
      CAMPAIGN,
      ACTIVE !== undefined ? (ACTIVE ? 1 : 0) : 1,
      adminId,
      createTime,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting data:", err);
        return res.status(500).json({
          message: "Error adding new list.",
          error: err,
        });
      }
      res.status(201).json({
        message: "List added successfully.",
        list: {
          LIST_ID,
          NAME,
          DESCRIPTION,
          LEADS_COUNT,
          CAMPAIGN,
          ACTIVE,
          ADMIN: adminId,
          RTIME: createTime,
        },
      });
    }
  );
});

app.put("/lists/:listId", authenticateToken, (req, res) => {
  const adminId = req.user.userId; // Extract admin ID from JWT
  const { listId } = req.params; // Get listId from URL
  const { name, description, leadsCount, campaign, active } = req.body; // Extract fields from request body

  const updateSql = `
    UPDATE lists 
    SET NAME = ?, DESCRIPTION = ?, LEADS_COUNT = ?, CAMPAIGN = ?, ACTIVE = ?, ADMIN = ?
    WHERE LIST_ID = ?
  `;

  const values = [
    name,
    description,
    leadsCount || 0, // Default leads count to 0 if not provided
    campaign || "Unknown Campaign", // Default campaign name
    active !== undefined ? active : true, // Default active to true
    adminId, // Track admin who made the change
    listId, // WHERE condition
  ];

  db.query(updateSql, values, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "List not found or no changes made" });
    }

    res.status(200).json({ message: "Data updated successfully" });
  });
});

// ------------------------upload data delete query --------------------------------

app.delete("/lists/:listId", authenticateToken, (req, res) => {
  const { listId } = req.params;

  const deleteQuery = "DELETE FROM lists WHERE LIST_ID = ?";

  db.query(deleteQuery, [listId], (err, result) => {
    if (err) {
      console.error("Error deleting list:", err);
      return res.status(500).json({ error: "Failed to delete the list." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "List not found." });
    }

    res.status(200).json({ message: "List deleted successfully." });
  });
});

// --------------------------------upload data Update status --------------------------------
app.put("/statusUpload/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await db.query("UPDATE lists SET ACTIVE = ? WHERE ID = ?", [
      status,
      id,
    ]);

    if (result.affectedRows > 0) {
      res.status(200).json({ message: "Status updated successfully" });
    } else {
      res.status(404).json({ message: "No rows updated, ID might not exist" });
    }
  } catch (error) {
    console.error("Error in PUT /statusUpload/:id:", error.message);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

app.post(
  "/upload",
  authenticateToken,
  upload.single("excel"),
  async (req, res) => {
    const userId = req.user.userId;
    const userType = req.user.userType;

    const { list_id, campaign_id } = req.body;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!campaign_id) {
        return res.status(400).json({ error: "Campaign ID missing" });
      }

      const filePath = req.file.path;
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data.length) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Empty Excel file" });
      }

      let campaignQuery = "";
      let campaignParams = [];

      if (userType == 9) {
        campaignQuery = `SELECT campaigns_id FROM users WHERE admin = ?  LIMIT 1`;
        campaignParams = [userId];
      } else if (userType == 8) {
        // Admin: Same as before
        campaignQuery = `SELECT campaigns_id FROM users WHERE admin = ? LIMIT 1`;
        campaignParams = [userId];
      } else {
        // For Agent, TL, Manager: Get their Admin's ID first
        campaignQuery = `SELECT campaigns_id FROM users WHERE user_id = ? LIMIT 1;`;
        campaignParams = [userId];
      }

      db.query(campaignQuery, campaignParams, (err, result) => {
        if (err) {
          console.error("Error fetching campaign ID:", err);
          return res
            .status(500)
            .json({ error: "Database error while fetching campaign" });
        }

        if (result.length === 0) {
          return res
            .status(400)
            .json({ error: "No campaign found for this user" });
        }

        const insertQuery = `
        INSERT INTO upload_data (
          id, uniqueid, company_name, employee_size, industry, country, city, department,
          designation, email, name, phone_number, phone_2, phone_3, phone_code,
          username, admin, dial_status, list_id, campaign_Id
        ) VALUES ?`;

        const values = data.map((row) => [
          row.id || null,
          row.uniqueid || null,
          row.company_name || null,
          row.employee_size || null,
          row.industry || null,
          row.country || null,
          row.city || null,
          row.department || null,
          row.designation || null,
          row.email || null,
          row.name || null,
          row.phone_number || null,
          row.phone_2 || null,
          row.phone_3 || null,
          row.phone_code || null,
          row.username || null,
          userId,
          "NEW",
          list_id,
          campaign_id,
        ]);

        db.query(insertQuery, [values], (err, result) => {
          fs.unlinkSync(filePath);

          if (err) {
            console.error("Error inserting data:", err);
            return res.status(500).json({ error: "Database error" });
          }

          const insertedRows = result.affectedRows;

          const updateLeadCountQuery = `UPDATE lists SET LEADS_COUNT = ? WHERE LIST_ID = ?`;
          db.query(
            updateLeadCountQuery,
            [insertedRows, list_id],
            (updateErr) => {
              if (updateErr) {
                console.error("Error updating LEADS_COUNT:", updateErr);
                return res.status(500).json({
                  error: "Upload success, but LEADS_COUNT update failed",
                });
              }

              return res.status(200).json({
                success: true,
                message: "Data uploaded successfully",
                successCount: insertedRows,
              });
            }
          );
        });
      });
    } catch (error) {
      console.error("Upload Error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  }
);
//---------------------------------ShowList Upload & Process Excel Files-------------------------------------------------
app.post(
  "/showListupload",
  authenticateToken,
  upload.single("excel"),
  async (req, res) => {
    try {
      const { listId, selectedUsers, campaign_id } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      if (!selectedUsers || !selectedUsers.trim()) {
        fs.unlinkSync(req.file.path); // cleanup
        return res.status(400).json({ error: "No users selected." });
      }

      if (!listId || isNaN(Number(listId))) {
        fs.unlinkSync(req.file.path); // cleanup
        return res.status(400).json({ error: "Invalid or missing list ID." });
      }

      if (!campaign_id) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Missing campaign ID." });
      }

      const selectedUsersArray = selectedUsers.split(",").map((u) => u.trim());
      const filePath = req.file.path;

      // Read Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data.length) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Empty Excel file." });
      }

      // Build insert values
      const values = data.map((row) => [
        row.id || null,
        row.uniqueid || null,
        row.company_name || null,
        row.employee_size || null,
        row.industry || null,
        row.country || null,
        row.city || null,
        row.department || null,
        row.designation || null,
        row.email || null,
        row.name || null,
        row.phone_number || null,
        row.phone_2 || null,
        row.phone_3 || null,
        row.phone_code || null,
        selectedUsersArray.join(","),
        req.user.userId,
        row.dial_status || null,
        listId,
        campaign_id, // ✅ Add campaign_id to each row
      ]);

      const insertQuery = `
      INSERT INTO upload_data (
        id, uniqueid, company_name, employee_size, industry, country, city, department,
        designation, email, name, phone_number, phone_2, phone_3, phone_code,
        username, admin, dial_status, list_id, campaign_Id
      ) VALUES ?
    `;

      db.query(insertQuery, [values], (err, result) => {
        fs.unlinkSync(filePath); // Always clean up

        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ error: "Database insertion failed." });
        }

        return res.status(200).json({
          success: true,
          message: "Data uploaded successfully.",
          insertedCount: result.affectedRows,
        });
      });
    } catch (error) {
      console.error("Upload Error:", error);

      // Safe file cleanup on unexpected crash
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({ error: "Server error during upload." });
    }
  }
);

//--------------------------------- Agent API to Upload & Process Excel Files-------------------------------------------------

app.post(
  "/agent_upload",
  authenticateToken,
  upload.single("excel"),
  async (req, res) => {
    const adminId = req.user.userId;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data.length) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Empty Excel file" });
      }

      const campaignQuery = `SELECT campaigns_id FROM users WHERE user_id = ?`;

      db.query(campaignQuery, [adminId], (err, result) => {
        if (err) {
          console.error("Error fetching campaign ID:", err);
          return res
            .status(500)
            .json({ error: "Database error while fetching campaign" });
        }

        if (result.length === 0) {
          return res
            .status(400)
            .json({ error: "No campaign found for this admin" });
        }

        const campaignId = result[0].campaigns_id;
        const insertQuery = `
              INSERT INTO upload_data (
                  id, uniqueid, company_name, employee_size, industry, country, city, department,
                  designation, email, name, phone_number, phone_2, phone_3, phone_code,
                  username, admin, dial_status, campaign_Id
              ) VALUES ?`;

        const values = data.map((row) => [
          row.id || null,
          row.uniqueid || null,
          row.company_name || null,
          row.employee_size || null,
          row.industry || null,
          row.country || null,
          row.city || null,
          row.department || null,
          row.designation || null,
          row.email || null,
          row.name || null,
          row.phone_number || null,
          row.phone_2 || null,
          row.phone_3 || null,
          row.phone_code || null,
          adminId,
          adminId,
          row.dial_status || null,
          campaignId,
        ]);

        db.query(insertQuery, [values], (err, result) => {
          fs.unlinkSync(filePath);
          if (err) {
            console.error("Error inserting data:", err);
            return res.status(500).json({ error: "Database error" });
          }

          return res.status(200).json({
            success: true,
            message: "Data uploaded successfully",
            successCount: result.affectedRows,
          });
        });
      });
    } catch (error) {
      console.error("Upload Error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

//--------------------------------- GET API Upload (showlist)-------------------------------------------------

app.get("/showlist/:listId", authenticateToken, async (req, res) => {
  const { listId } = req.params; // Get listId from params
  const adminId = req.user.userId;

  try {
    const query = `
       SELECT * FROM upload_data 
    WHERE list_id = ? 
      AND admin = ? 
      AND dial_status = 'NEW'`;
    db.query(query, [listId, adminId], (err, result) => {
      if (err) {
        console.error("Error fetching data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.length === 0) {
        return res
          .status(404)
          .json({ error: "No data found for the given List ID" });
      }

      return res.status(200).json({
        success: true,
        data: result,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------- GET API Upload (DialData)-------------------------------------------------

app.get("/dialdata/:listId", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  const adminId = req.user.userId;

  try {
    const query = `
      SELECT id, company_name, industry, email, name, phone_number, phone_code, username, dial_status 
      FROM upload_data 
      WHERE list_id = ? AND admin = ? AND dial_status != 'NEW'
    `;

    db.query(query, [listId, adminId], (err, result) => {
      if (err) {
        console.error("Error fetching dial data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.length === 0) {
        return res.status(404).json({ error: "No dialed data found" });
      }

      return res.status(200).json({
        success: true,
        data: result,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

//-----------------------Agent panel data upload-------------------------------------------------------------------------------------

app.get("/AgentDataUpload", authenticateToken, async (req, res) => {
  const admin = req.user.admin;
  const username = req.user.userId; // Assuming the logged-in user's ID

  try {
    const query = `
         SELECT * FROM upload_data 
    WHERE (admin = ? OR username = ? OR username IS NULL OR username = '')
      AND dial_status = 'NEW'`;

    db.query(query, [admin, username], (err, result) => {
      if (err) {
        console.error("Error fetching data:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.length === 0) {
        return res.status(404).json({ error: "No data found" });
      }

      return res.status(200).json({
        success: true,
        data: result,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------- DELETE API Upload (showlist)-------------------------------------------------

app.delete("/data/delete/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  const deleteQuery = "DELETE FROM upload_data WHERE id = ?";

  db.query(deleteQuery, [id], (err, result) => {
    if (err) {
      console.error("Error deleting data:", err);
      return res.status(500).json({ message: "Server Error" });
    }

    if (result.affectedRows > 0) {
      return res.status(200).json({ message: "Row deleted successfully" });
    } else {
      return res.status(404).json({ message: "Row not found" });
    }
  });
});

//--------------------------------- DELETE ALL API Upload (showlist)-------------------------------------------------

app.delete("/delete-all/:listId", authenticateToken, (req, res) => {
  const listId = req.params.listId;
  const adminId = req.user.userId;

  const query = "DELETE FROM upload_data WHERE list_id = ? AND admin = ?";
  db.query(query, [listId, adminId], (err, result) => {
    if (err) {
      console.error("Error deleting data:", err); // More specific logging
      return res.status(500).json({ error: "Failed to delete data" });
    }

    if (result.affectedRows > 0) {
      return res
        .status(200)
        .json({ message: "All data for this listId has been deleted." });
    } else {
      return res.status(404).json({ message: "No data found for this listId" });
    }
  });
});

app.post("/checkAgentAssignment", authenticateToken, (req, res) => {
  const { groupId, agentId } = req.body;

  if (!groupId || !agentId) {
    return res.status(400).json({ message: "Invalid input." });
  }

  const query = `
    SELECT COUNT(*) AS count 
    FROM group_agent 
    WHERE group_id = ? AND agent_id = ?;
  `;

  db.query(query, [groupId, agentId], (err, result) => {
    if (err) {
      console.error("SQL Error:", err.sqlMessage || err.message);
      return res
        .status(500)
        .json({ message: "Error checking assignment.", error: err });
    }

    const assigned = result[0]?.count > 0;
    res.status(200).json({ assigned });
  });
});

app.put(
  "/users/:userId",
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  (req, res) => {
    const { userId } = req.params;
    const { fullName, campaignId, useDID, email, mobile, timezone, password } =
      req.body;

    const profilePicFile = req.files?.profilePicture?.[0];
    const logoFile = req.files?.companyLogo?.[0];

    const profilePicture = profilePicFile
      ? `/uploads/img/${profilePicFile.filename}`
      : null;
    const companyLogo = logoFile ? `/uploads/img/${logoFile.filename}` : null;

    let hashedPassword = null;
    if (password) {
      const hashedFull = crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
      const keyLength = Math.floor(Math.random() * 6) + 10;
      hashedPassword = hashedFull.substring(0, keyLength);
    }

    const query = `
    UPDATE users SET 
      full_name = ?, campaigns_id = ?, use_did = ?, admin_email = ?, 
      admin_mobile = ?, admin_profile = COALESCE(?, admin_profile), 
      admin_logo = COALESCE(?, admin_logo),
      user_timezone = ?, password = COALESCE(?, password)
    WHERE user_id = ?`;

    db.query(
      query,
      [
        fullName,
        campaignId,
        useDID,
        email,
        mobile,
        profilePicture,
        companyLogo,
        timezone,
        hashedPassword,
        userId,
      ],
      (err, result) => {
        if (err) {
          console.error("DB Error:", err.message);
          return res.status(500).send("Error updating profile: " + err.message);
        }

        if (result.affectedRows === 0) {
          return res.status(404).send("User not found or no changes made.");
        }

        res.send("Profile updated successfully.");
      }
    );
  }
);

//------------------------------- Update user Key----------------------------------------------------------

app.put("/update-api-key/:userId", authenticateToken, (req, res) => {
  const { userId } = req.params;

  const keyLength = Math.floor(Math.random() * 3) + 10;
  const newApiKey = crypto
    .randomBytes(6)
    .toString("hex")
    .substring(0, keyLength);

  const query = "UPDATE users SET api_key = ? WHERE user_id = ?";
  db.query(query, [newApiKey, userId], (err, result) => {
    if (err) {
      console.error("❌ Error updating API key:", err.sqlMessage || err);
      return res.status(500).json({ message: "Error updating API key." });
    }

    // console.log("✅ API key updated for user:", userId);
    res.json({ api_key: newApiKey });
  });
});

//------------------------------- live call ----------------------------------------------------------

app.get("/live-calls", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;

  let query = `
    SELECT  
      live.id,
      live.uniqueid,
      live.did,
      live.call_to,
      live.call_from,
      live.Agent,
      live.time,
      live.direction,
      live.status,
      DATE_FORMAT(live.time, '%Y-%m-%d %H:%i:%s') AS formatted_time,
      live.Agent_name,
      live.campaign_Id,
      live.channel,
      compaign_list.compaignname 
    FROM live
    LEFT JOIN compaign_list ON compaign_list.compaign_id = live.campaign_Id
  `;

  let whereClause = "";
  let values = [];

  if (userType === "9") {
    whereClause = `
      WHERE 
        live.Agent IN (
          SELECT user_id FROM users 
          WHERE admin IN (
            SELECT user_id FROM users WHERE SuperAdmin = ?
          )
        )
        OR compaign_list.admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
    `;
    values = [userId, userId];
  } else if (userType === "8") {
    whereClause = `
      WHERE live.Agent IN (
        SELECT user_id FROM users WHERE admin = ?
      )
    `;
    values = [userId];
  } else if (userType === "7") {
    whereClause = `
      WHERE live.admin IN (
        SELECT user_id FROM users WHERE admin = ? AND user_type IN (1, 2, 6)
      )
        OR compaign_list.admin IN (
          SELECT user_id FROM users WHERE admin = ?
        )
    `;
    values = [userId];
  } else if (userType === "2") {
    whereClause = `
      WHERE live.Agent = ? OR live.Agent IN (
        SELECT user_id FROM users WHERE admin = ? AND user_type = 1
      )
            OR compaign_list.admin IN (
          SELECT user_id FROM users WHERE admin = ?
        )
    `;
    values = [userId, userId];
  } else if (userType === "6" || userType === "1") {
    whereClause = `WHERE live.Agent = ?`;
    values = [userId];
  } else if (userType === "5") {
    whereClause = ``;
    values = [];
  } else {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  query += ` ${whereClause} ORDER BY live.time DESC`;

  db.query(query, values, (err, results) => {
    if (err) {
      // console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching live calls." });
    }

    return res.status(200).json(results);
  });
});

//------------------------------- live call count ----------------------------------------------------------

app.get("/agent-status", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;

  let whereUsersCondition = "";
  let whereLiveCondition = "";
  let values = [];

  if (userType === "9") {
    whereUsersCondition = `
      users.admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
    `;
    whereLiveCondition = `
      admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
    `;
    values = [userId, userId];
  } else if (userType === "8") {
    whereUsersCondition = `users.admin = ?`;
    whereLiveCondition = `admin = ?`;
    values = [userId, userId];
  } else if (userType === "7") {
    whereUsersCondition = `
      users.admin IN (
        SELECT user_id FROM users WHERE admin = ? AND user_type IN (1, 2, 6)
      )
    `;
    whereLiveCondition = `
      admin IN (
        SELECT user_id FROM users WHERE admin = ? AND user_type IN (1, 2, 6)
      )
    `;
    values = [userId, userId];
  } else if (userType === "2") {
    whereUsersCondition = `
      users.user_id = ? OR users.admin = ?
    `;
    whereLiveCondition = `
      Agent = ? OR Agent IN (
        SELECT user_id FROM users WHERE admin = ? AND user_type = 1
      )
    `;
    values = [userId, userId, userId, userId];
  } else if (userType === "6" || userType === "1") {
    whereUsersCondition = `users.user_id = ?`;
    whereLiveCondition = `Agent = ?`;
    values = [userId, userId];
  } else {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  const query1 = `
    SELECT  
      COUNT(DISTINCT CASE 
        WHEN (break_time.status = '2' OR break_time.status = '1') 
          AND login_log.status = '1' 
          AND (login_log.admin != ? OR login_log.token IS NOT NULL)
        THEN break_time.user_name ELSE NULL 
      END) AS login_agents, 
      
      COUNT(DISTINCT CASE 
        WHEN break_time.break_status = '2' 
          AND break_time.status = '2' 
        THEN break_time.user_name ELSE NULL 
      END) AS available_agents, 
      
      COUNT(DISTINCT CASE 
        WHEN break_time.break_status = '2' 
          AND break_time.status = '1' 
          AND break_time.break_name <> 'Ready'  
        THEN break_time.user_name ELSE NULL 
      END) AS pause_agents
    FROM users 
    JOIN login_log ON users.user_id = login_log.user_name 
    LEFT JOIN break_time ON break_time.user_name = users.user_id 
    WHERE ${whereUsersCondition};
  `;

  const query2 = `
    SELECT 
      SUM(status = 'Answer') AS in_call_agents,
      SUM(CASE WHEN (status = 'Ringing' OR Agent = 'NOAGENT') AND direction = 'inbound' THEN 1 ELSE 0 END) AS call_queue_agents,
      SUM(CASE WHEN status = 'Ringing' AND direction = 'outbound' THEN 1 ELSE 0 END) AS call_dial_agents
    FROM live 
    WHERE ${whereLiveCondition};
  `;

  // Split values for each query
  const query1Values = values.slice(0, 2); // first two (may repeat userId)
  const query2Values = values.slice(values.length - 2); // last two

  db.query(query1, query1Values, (err, result1) => {
    if (err) {
      // console.error("Query1 Error:", err);
      return res.status(500).json({ error: err.message });
    }

    db.query(query2, query2Values, (err, result2) => {
      if (err) {
        // console.error("Query2 Error:", err);
        return res.status(500).json({ error: err.message });
      }

      const responseData = {
        login: result1[0]?.login_agents || 0,
        available: result1[0]?.available_agents || 0,
        pause: result1[0]?.pause_agents || 0,
        in_call: result2[0]?.in_call_agents || 0,
        call_dialing: result2[0]?.call_dial_agents || 0,
        call_queue: result2[0]?.call_queue_agents || 0,
      };

      res.json(responseData);
    });
  });
});

app.get("/auto_dial/:id", authenticateToken, (req, res) => {
  const userId = req.params.id;
  db.query(
    "SELECT auto_dial_status FROM users WHERE user_id = ?",
    [userId],
    (err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ auto_dial_status: results[0].auto_dial_status });
    }
  );
});

app.patch(
  "/user/:userid/update-status",
  authenticateToken,
  async (req, res) => {
    const userId = req.params.userid;
    const { auto_dial_status } = req.body;

    try {
      const result = await db.query(
        "UPDATE users SET auto_dial_status = ? WHERE user_id = ?",
        [auto_dial_status ? 1 : 0, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        message: "Auto Dial status updated successfully",
      });
    } catch (err) {
      console.error("Error updating auto_dial_status:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get("/permissions/:adminId", authenticateToken, (req, res) => {
  const { adminId } = req.params;
  db.query(
    "SELECT agent_management, campaign, data_upload, report_view, ivr_converter, disposition, block_no, dtmf, `group`, lead_form_type FROM admin_permissions WHERE admin_id = ?",
    [adminId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      if (results.length > 0) {
        res.json(results[0]);
      } else {
        res.json({
          agent_management: false,
          campaign: false,
          data_upload: false,
          report_view: false,
          ivr_converter: false,
          disposition: false,
          block_no: false,
          dtmf: false,
          group: false,
          lead_form_type: "",
        });
      }
    }
  );
});

app.post("/permissions/:adminId", authenticateToken, (req, res) => {
  const { adminId } = req.params;
  const {
    agent_management,
    campaign,
    data_upload,
    report_view,
    ivr_converter,
    disposition,
    block_no,
    dtmf,
    group,
    lead_form_type,
  } = req.body;

  // Check if entry exists
  db.query(
    "SELECT * FROM admin_permissions WHERE admin_id = ?",
    [adminId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      if (results.length > 0) {
        // Update existing permissions
        db.query(
          `UPDATE admin_permissions
           SET agent_management = ?, campaign = ?, data_upload = ?, report_view = ?, ivr_converter = ?, disposition = ?, block_no = ?, dtmf = ?, \`group\` = ?, lead_form_type = ?,updated_at = NOW()
           WHERE admin_id = ?`,
          [
            agent_management,
            campaign,
            data_upload,
            report_view,
            ivr_converter,
            disposition,
            block_no,
            dtmf,
            group,
            lead_form_type,
            adminId,
          ],
          (err2) => {
            if (err2) {
              console.error("Update error:", err2);
              return res.status(500).json({ message: "Update failed" });
            }
            res.json({ success: true });
          }
        );
      } else {
        // Insert new permissions
        db.query(
          `INSERT INTO admin_permissions 
           (admin_id, agent_management, campaign, data_upload, report_view, ivr_converter, disposition, block_no, dtmf, \`group\`, lead_form_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adminId,
            agent_management,
            campaign,
            data_upload,
            report_view,
            ivr_converter,
            disposition,
            block_no,
            dtmf,
            group,
            lead_form_type,
          ],
          (err3) => {
            if (err3) {
              console.error("Insert error:", err3);
              return res.status(500).json({ message: "Insert failed" });
            }
            res.json({ success: true });
          }
        );
      }
    }
  );
});
app.get("/perm/current", authenticateToken, (req, res) => {
  const adminId = req.user.admin;
  db.query(
    "SELECT lead_form_type FROM admin_permissions WHERE admin_id = ?",
    [adminId],
    (err, results) => {
      if (err) {
        console.error("Error fetching lead_form_type:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Permission not found" });
      }

      res.json({ lead_form_type: results[0].lead_form_type });
    }
  );
});
app.get("/form-fields/:formType", authenticateToken, (req, res) => {
  const { formType } = req.params;
  db.query(
    `SELECT * FROM lead_form_fields WHERE form_type = ? ORDER BY field_order`,
    [formType],
    (err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Failed to load form fields" });
      }
      res.json(results);
    }
  );
});

app.post("/announcements/create", authenticateToken, (req, res) => {
  const { message } = req.body;
  const adminId = req.user.userId;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message is required." });
  }

  const sql = "INSERT INTO announcements (message, admin) VALUES (?, ?)";
  db.query(sql, [message.trim(), adminId], (err, result) => {
    if (err) {
      console.error("Error posting announcement:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    res.json({
      message: "Announcement posted successfully.",
      id: result.insertId,
    });
  });
});

// GET /announcements/latest
app.get("/announcements/today", authenticateToken, (req, res) => {
  const adminId = req.user.admin;

  const sql = `
    SELECT * FROM announcements 
    WHERE admin = ? 
    AND DATE(created_at) = CURDATE()
    ORDER BY created_at DESC
  `;

  db.query(sql, [adminId], (err, results) => {
    if (err) {
      console.error("Error fetching announcements:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    if (results.length === 0) {
      return res.json([]);
    }

    res.json(results); // return array of today's announcements
  });
});

app.post("/ap/autodial", authenticateToken, async (req, res) => {
  const user_id = req.user.userId;

  try {
    // 1️⃣ Get campaign_name
    const campaignResult = await query(
      `SELECT campaign_name 
       FROM login_log 
       WHERE user_name = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [user_id]
    );

    const campaign_name = campaignResult?.[0]?.campaign_name;
    if (!campaign_name) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // 2️⃣ Get admin
    const userResult = await query(
      `SELECT admin FROM users WHERE user_id = ?`,
      [user_id]
    );
    const user_admin = userResult?.[0]?.admin || "";

    // 3️⃣ Check if already live
    const liveResult = await query(
      `SELECT * FROM live WHERE Agent = ? OR call_to = ?`,
      [user_id, user_id]
    );
    if (liveResult.length > 0) {
      return res.json("live");
    }

    // 4️⃣ Check agent wrapup status
    const agentReport = await query(
      `SELECT wrapup, wait_for_next_call, agent_status 
       FROM agent_live_report 
       WHERE agent_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [user_id]
    );

    if (agentReport.length > 0) {
      const { wrapup, wait_for_next_call, agent_status } = agentReport[0];

      if (wrapup == 1) {
        if (wait_for_next_call) {
          const lastWait = new Date(wait_for_next_call);
          const now = new Date();
          const diffSec = (now - lastWait) / 1000;

          if (diffSec > 60) {
            // ✅ Auto-reset wrapup
            await query(
              `UPDATE agent_live_report 
               SET wrapup = 0 
               WHERE agent_id = ?`,
              [user_id]
            );
          } else {
            return res.json("wrapup"); // 🚫 still in wrapup
          }
        } else {
          return res.json("wrapup");
        }
      }
    }

    // 5️⃣ Start transaction
    await query("START TRANSACTION");

    // First try unassigned leads
    let lead = await query(
      `SELECT id, name, email, phone_number 
       FROM upload_data 
       WHERE admin = ? 
         AND (username = ? OR username = '' OR username IS NULL) 
         AND dial_status = 'NEW' 
         AND campaign_Id = ? 
       ORDER BY id ASC 
       LIMIT 1 
       FOR UPDATE`,
      [user_admin, user_id, campaign_name]
    );

    // If no lead, try user’s own leads
    if (lead.length === 0) {
      lead = await query(
        `SELECT id, name, email, phone_number 
         FROM upload_data 
         WHERE username = ? 
           AND dial_status = 'NEW' 
           AND campaign_Id = ? 
         ORDER BY id ASC 
         LIMIT 1 
         FOR UPDATE`,
        [user_id, campaign_name]
      );
    }

    if (lead.length === 0) {
      await query("COMMIT");
      return res.json([]); // no leads
    }

    const { id, name, email, phone_number } = lead[0];

    // Mark as dialing
    await query(
      `UPDATE upload_data 
       SET dial_status = 'DIALING' 
       WHERE id = ?`,
      [id]
    );

    await query("COMMIT");

    // Small delay before sending
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return res.json({ name, email, number: phone_number });
  } catch (err) {
    console.error("[AUTODIAL] ❌ Error:", err);
    await query("ROLLBACK");
    return res.status(500).json({ error: "Autodial failed" });
  }
});

// server.js or routes file
app.post("/auto_dial/toggle", authenticateToken, (req, res) => {
  const { user_id, status } = req.body;

  db.query(
    "UPDATE users SET auto_dial_on = ? WHERE user_id = ?",
    [status, user_id],
    (err) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json({ success: true, auto_dial_on: status });
    }
  );
});

app.post("/agent-wrapup", authenticateToken, async (req, res) => {
  const { wrapup } = req.body;
  const user_id = req.user.userId;

  try {
    // ✅ Just update wrapup flag directly
    await query(
      `UPDATE agent_live_report 
       SET wrapup = ? 
       WHERE agent_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [wrapup, user_id]
    );

    console.log(`ℹ️ [WRAPUP] Agent ${user_id} set wrapup=${wrapup}`);

    // 🚫 Removed auto-reset logic completely

    res.json({ success: true, wrapup });
  } catch (err) {
    console.error("❌ [WRAPUP] Error updating wrapup", err);
    res.status(500).json({ error: "Failed to update wrapup" });
  }
});

app.get("/agent-wrapup-status", authenticateToken, async (req, res) => {
  const user_id = req.user.userId;

  try {
    // 1️⃣ Check if agent is live
    const liveResult = await query(
      `SELECT * FROM live WHERE Agent = ? OR call_to = ?`,
      [user_id, user_id]
    );
    if (liveResult.length > 0) {
      return res.json({ status: "live" });
    }

    // 2️⃣ Get last wrapup + wait_for_next_call
    const wrapupResult = await query(
      `SELECT wrapup, wait_for_next_call 
       FROM agent_live_report 
       WHERE agent_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [user_id]
    );

    if (wrapupResult.length > 0) {
      const { wrapup, wait_for_next_call } = wrapupResult[0];

      if (wrapup === 1) {
        if (wait_for_next_call) {
          return res.json({
            status: "wrapup",
            wait_for_next_call,
          });
        } else {
          // ❌ wait_for_next_call missing → give default timer
          return res.json({
            status: "wrapup",
            defaultTimer: 120, // 2 min in seconds
          });
        }
      }
    }

    return res.json({ status: "idle" });
  } catch (err) {
    console.error("❌ Wrapup status error:", err);
    res.status(500).json({ error: "Failed to fetch wrapup status" });
  }
});
app.post("/agent-wrapup-reset", authenticateToken, async (req, res) => {
  const user_id = req.user.userId;

  try {
    await query(
      `UPDATE agent_live_report 
       SET wrapup = 0 
       WHERE agent_id = ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [user_id]
    );

    console.log(`♻️ [WRAPUP RESET] Agent ${user_id} reset wrapup=0`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [WRAPUP RESET] Error:", err);
    res.status(500).json({ error: "Failed to reset wrapup" });
  }
});

//----------------------------------------------agent permission ---------------------------------------------------------------

app.post("/agent-permissions/:userid", authenticateToken, (req, res) => {
  const userId = req.params.userid;
  const adminId = req.user.admin; // Make sure your token contains this field
  const { data_upload, report_view, block_no } = req.body;
  const permissionValues = {
    data_upload: data_upload ? 1 : 0,
    report_view: report_view ? 1 : 0,
    block_no: block_no ? 1 : 0,
  };

  db.query(
    "SELECT id FROM admin_permissions WHERE user_id = ? AND admin_id = ?",
    [userId, adminId],
    (err, results) => {
      if (err) {
        console.error("DB SELECT error:", err);
        return res.status(500).json({ error: "SELECT failed" });
      }

      if (results.length > 0) {
        // Row exists — do UPDATE
        db.query(
          `UPDATE admin_permissions
           SET data_upload = ?, report_view = ?, block_no = ?, updated_at = NOW()
           WHERE user_id = ? AND admin_id = ?`,
          [
            permissionValues.data_upload,
            permissionValues.report_view,
            permissionValues.block_no,
            userId,
            adminId,
          ],
          (err2) => {
            if (err2) {
              console.error("DB UPDATE error:", err2);
              return res.status(500).json({ error: "Update failed" });
            }
            return res.json({ success: true, message: "Permissions updated." });
          }
        );
      } else {
        // Row does not exist — do INSERT
        db.query(
          `INSERT INTO admin_permissions (
    admin_id, user_id,
    data_upload, report_view, block_no,
    agent_management, campaign, ivr_converter,
    disposition, dtmf, \`group\`, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            adminId,
            userId,
            permissionValues.data_upload,
            permissionValues.report_view,
            permissionValues.block_no,
            0, // agent_management
            0, // campaign
            0, // ivr_converter
            0, // disposition
            0, // dtmf
            0, // group
          ],
          (err3) => {
            if (err3) {
              console.error("DB INSERT error:", err3);
              return res.status(500).json({ error: "Insert failed" });
            }
            return res.json({
              success: true,
              message: "Permissions inserted.",
            });
          }
        );
      }
    }
  );
});

//--------------------------------------reminder --------------------------------------------------------------

app.post("/reminders", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { datetime, message, lead_id } = req.body;

  if (!datetime || !message) {
    return res
      .status(400)
      .json({ message: "Date, message, and lead ID are required." });
  }

  const sql = `INSERT INTO reminders (user_id, datetime, message, lead_id) VALUES (?, ?, ?, ?)`;

  db.query(sql, [userId, datetime, message, lead_id], (err, result) => {
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

  const countQuery = `
    SELECT COUNT(*) AS total 
    FROM reminders 
    WHERE user_id = ? AND datetime >= NOW()
  `;

  const dataQuery = `
    SELECT r.*, c.email, c.phone_number, c.dialstatus, c.name AS lead_name
    FROM reminders r
    LEFT JOIN company_info c ON r.lead_id = c.id
    WHERE r.user_id = ? AND r.datetime >= NOW()
    ORDER BY r.datetime ASC 
    LIMIT ? OFFSET ?
  `;

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
        page,
        limit,
      });
    });
  });
});

app.delete("/reminders/:id", authenticateToken, (req, res) => {
  const userId = req.user.userId; // Extracted from JWT token
  const reminderId = req.params.id;

  const sql = `DELETE FROM reminders WHERE id = ? AND user_id = ?`;

  db.query(sql, [reminderId, userId], (err, result) => {
    if (err) {
      console.error("Error deleting reminder:", err);
      return res.status(500).json({ message: "Failed to delete reminder." });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Reminder not found or unauthorized." });
    }

    return res.status(200).json({ message: "Reminder deleted successfully." });
  });
});

app.get("/get-dispositions", authenticateToken, (req, res) => {
  const admin = req.user.admin;
  const user = req.user.userId;

  const getCampaignQuery = `
    SELECT campaign_name FROM login_log
    WHERE user_name = ? AND status = 1
    ORDER BY log_in_time DESC
  `;

  db.query(getCampaignQuery, [user], (err, campaignResult) => {
    if (err) {
      console.error("Error fetching campaign:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (campaignResult.length === 0) {
      return res
        .status(404)
        .json({ error: "No active campaign found for user" });
    }
    const campaign_id = campaignResult[0].campaign_name;

    const getDisposQuery = `
      SELECT dispo, reminder FROM dispo
      WHERE admin = ? AND campaign_id = ?
      ORDER BY ins_date DESC
    `;

    db.query(getDisposQuery, [admin, campaign_id], (err, dispoResults) => {
      if (err) {
        console.error("Error fetching dispositions:", err);
        return res.status(500).json({ error: "Failed to fetch dispositions" });
      }

      return res.json({ dispositions: dispoResults }); // now includes reminder flag
    });
  });
});

app.get("/get-softphone-link", (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ message: "Token missing." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const allowedRoles = [1, 8, 9, 2, 7];
    if (!allowedRoles.includes(decoded.userType)) {
      return res.status(403).json({ message: "Not authorized for WebPhone." });
    }

    // Generate dynamic webphone URL (can be customized per user)
    const sipUser = decoded.userId;
    const sipPass = decoded.password;
    const sipDomain = "103.113.27.239";
    const profileName = "admin";

    const webphoneUrl = `https://${sipDomain}/softphone/Phone/index.html?profileName=${profileName}&SipDomain=${sipDomain}&SipUsername=${sipUser}&SipPassword=${sipPass}`;

    return res.json({ webphone_url: webphoneUrl });
  } catch (err) {
    console.error("Invalid token:", err);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
});

//--------------------------------------------------------- All DID ---------------------------------------------------

app.post("/addDid", authenticateToken, async (req, res) => {
  try {
    const { tfn } = req.body;
    const adminId = req.user.admin;

    if (!tfn) {
      return res
        .status(400)
        .json({ success: false, message: "TFN is required." });
    }

    const uses_count = 0;
    const max_uses_count = 1000;
    const date = moment().format("YYYY-MM-DD HH:mm:ss");

    // ✅ Step 1: Insert into DB
    const insertQuery = `
      INSERT INTO tfn_table (tfn, uses_count, max_uses_count, date, user)
      VALUES (?, ?, ?, ?, ?)
    `;

    const insertResult = await db.query(insertQuery, [
      tfn,
      uses_count,
      max_uses_count,
      date,
      adminId,
    ]);

    const insertedId = insertResult.insertId; // ✅ Yeh important hai

    // ✅ Step 2: Fetch inserted row using that ID
    const rows = await db.query(`SELECT * FROM tfn_table WHERE id = ?`, [
      insertedId,
    ]);

    if (rows.length === 0) {
      return res
        .status(500)
        .json({ success: false, message: "DID inserted but not retrievable." });
    }

    const newDid = rows[0]; // ✅ Yeh frontend me bheja jaata hai

    res.json({ success: true, message: "DID inserted successfully", newDid });
  } catch (err) {
    console.error("Add DID Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error while adding DID." });
  }
});

//----------------------------------------------------------------------------------------------------------

app.get("/getAllDids", authenticateToken, (req, res) => {
  const adminId = req.user.admin; // Use `id` not `admin`
  db.query(
    "SELECT * FROM tfn_table WHERE user = ? ORDER BY id DESC",
    [adminId],
    (err, results) => {
      if (err) {
        console.error("❌ Error fetching DID data:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }

      res.status(200).json({ success: true, data: results });
    }
  );
});

//-------------------------------------------------------------------------------------------------------------

app.put("/updateMaxUsesCount", authenticateToken, async (req, res) => {
  try {
    const { ids, max_uses_count } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res
        .status(400)
        .json({ success: false, message: "DID IDs are required." });
    }

    if (!max_uses_count || isNaN(max_uses_count)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid max_uses_count is required." });
    }

    const placeholders = ids.map(() => "?").join(",");
    const query = `UPDATE tfn_table SET max_uses_count = ? WHERE id IN (${placeholders})`;

    await db.query(query, [max_uses_count, ...ids]);

    res
      .status(200)
      .json({ success: true, message: "Max uses count updated successfully." });
  } catch (error) {
    console.error("Error updating max uses count:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

//--------------------------------------------------------------------------------------------------------------------

app.put("/resetUsesCount", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: "No IDs provided" });
  }

  try {
    const placeholders = ids.map(() => "?").join(",");
    const sql = `UPDATE tfn_table SET uses_count = 0, last_updated_time = NOW() WHERE id IN (${placeholders})`;
    await db.query(sql, ids);

    res.json({ success: true });
  } catch (error) {
    console.error("Reset Uses Count Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//-------------------------------------------------------------------------------------------------------------------

app.delete("/deleteDid/:id", authenticateToken, (req, res) => {
  const adminId = req.user.admin; // Use `id` not `admin`
  const { id } = req.params;

  db.query(
    "DELETE FROM tfn_table WHERE id = ? AND user = ?",
    [id, adminId],
    (err, result) => {
      if (err) {
        console.error("❌ Delete DID error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "DID not found." });
      }

      res.json({ success: true, message: "DID deleted successfully." });
    }
  );
});

//----------------------------------------------------------------------------------------------------------------------

app.patch("/user/:userId/recording-permission", async (req, res) => {
  const userId = req.params.userId;
  const { recording_permission } = req.body;

  try {
    await db.query(
      "UPDATE users SET recording_permission = ? WHERE user_id = ?",
      [recording_permission ? 1 : 0, userId]
    );
    res.json({ success: true, message: "Recording permission updated" });
  } catch (error) {
    console.error("Error updating recording permission:", error);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

app.get("/user/:userId/recording", authenticateToken, (req, res) => {
  const userId = req.params.userId;

  try {
    db.query(
      "SELECT recording_permission FROM users WHERE user_id = ?",
      [userId],
      (err, rows) => {
        if (err) {
          console.error("Error fetching recording permission:", err);
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }

        if (rows.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        return res
          .status(200)
          .json({ recording_permission: rows[0].recording_permission });
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unexpected server error" });
  }
});

//---------------------------------------------------------------------------------------------------------------------------

app.post("/send-whatsapp", authenticateToken, async (req, res) => {
  const { to, templateName, parameters } = req.body;

  if (!to || !templateName || !parameters || !Array.isArray(parameters)) {
    return res.status(400).json({ error: "Missing or invalid parameters." });
  }

  const sendMessage = async () => {
    return await axios.post(
      "https://partnersv1.pinbot.ai/v3/517973978061642/messages",
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: "en",
          },
          components: [
            {
              type: "body",
              parameters: parameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      },
      {
        headers: {
          apikey: "701a60c9-c50d-11ef-bb5a-02c8a5e042bd",
          "Content-Type": "application/json",
        },
      }
    );
  };
  let attempts = 0;
  const maxAttempts = 3;
  let lastError;

  while (attempts < maxAttempts) {
    try {
      const response = await sendMessage();
      return res.status(200).json({ success: true, data: response.data });
    } catch (error) {
      lastError = error;
      const isNetworkError =
        error.code === "EAI_AGAIN" || error.code === "ECONNRESET";
      if (!isNetworkError) break;

      console.warn(
        `Retrying... Attempt ${attempts + 1} failed with:`,
        error.code
      );
      await new Promise((r) => setTimeout(r, 1000 * (attempts + 1))); // backoff delay
      attempts++;
    }
  }

  console.error(
    "WhatsApp API Error:",
    lastError.response?.data || lastError.message
  );
  return res.status(500).json({ error: "Failed to send message." });
});

app.get("/api/user/script-status", authenticateToken, (req, res) => {
  const userId = req.user.userId; // comes from JWT

  // 1️⃣ Find latest login_log for this user, get campaign_name
  db.query(
    `SELECT campaign_name FROM login_log WHERE user_name = ? ORDER BY log_in_time DESC LIMIT 1`,
    [userId],
    (err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ error: "DB error" });
      }

      if (results.length === 0 || !results[0].campaign_name) {
        return res.json({ script_notes: "inactive", campaign_name: null });
      }

      const campaignId = results[0].campaign_name; // ✅ comes from your real table

      // 2️⃣ Check if script_notes is active for this campaign
      db.query(
        `SELECT script_notes FROM campaign_list WHERE compaign_id = ?`,
        [campaignId],
        (err2, results2) => {
          if (err2) {
            console.error("DB error:", err2);
            return res.status(500).json({ error: "DB error" });
          }

          if (results2.length === 0) {
            return res.json({
              script_notes: "inactive",
              campaign_name: campaignId,
            });
          }

          const scriptNotes = results2[0].script_notes || "inactive";
          res.json({ script_notes: scriptNotes, campaign_name: campaignId });
        }
      );
    }
  );
});

//-----------------------------------------------------------------------------------------------

app.post("/telephony/context/save", authenticateToken, (req, res) => {
  const { superadmin, admin, career, contextname, contextvalue } = req.body;

  if (!career || !contextvalue) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  // Save context to DB
  const insertQuery = `
    INSERT INTO context_config (superadmin, admin, career, contextname, contextvalue)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    insertQuery,
    [superadmin, admin, career, contextname, contextvalue],
    (err, result) => {
      if (err) {
        console.error("DB Insert Error:", err);
        return res.status(500).json({ success: false });
      }

      // Save to pjsip.conf (optional)
      const fs = require("fs");
      const filePath = "/etc/asterisk/pjsip.conf"; // or wherever your custom context lives
      fs.appendFile(filePath, `\n\n${contextvalue}\n`, (err) => {
        if (err) {
          console.error("File write error:", err);
          return res.status(500).json({ success: false });
        }

        return res.status(200).json({ success: true });
      });
    }
  );
});

//-------------------------------------------------------------------------------------------------------------------------

app.get("/logo/:userId", authenticateToken, (req, res) => {
  const { userId } = req.params;
  const query = "SELECT admin_logo FROM users WHERE admin = ?";
  db.query(query, [userId], (err, result) => {
    if (err) return res.status(500).send("Database error");
    if (result.length === 0) return res.status(404).send("User not found");

    res.json(result[0]); // returns { admin_logo: '/uploads/img/logo.png' }
  });
});

//-------------------------------------------------------------------------------------------------------------------------
app.get("/api/group-chat/:groupId", (req, res) => {
  const sql =
    "SELECT * FROM group_chat WHERE group_id = ? ORDER BY created_at ASC";

  db.query(sql, [req.params.groupId], (err, results) => {
    if (err) {
      console.error("Error fetching messages:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // 🟢 Normalize the response
    const formattedMessages = results.map((msg) => ({
      id: msg.id,
      groupId: msg.group_id,
      groupName: msg.group_name,
      senderId: msg.sender_id,
      senderName: msg.sender_name || "Unknown",
      senderRole: msg.sender_role,
      text: msg.message,
      type: msg.type,
      groupMembers: msg.group_members,
      seen_by: msg.seen_by,
      created_at: msg.created_at,
    }));

    res.json(formattedMessages);
  });
});

//-------------------------------------------------------------------------------------------------------------------------

app.post("/api/group-chat/seen/:groupId", authenticateToken, (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

  const sql = `
    UPDATE group_chat 
    SET seen_by = JSON_ARRAY_APPEND(seen_by, '$', ?) 
    WHERE group_id = ? AND NOT JSON_CONTAINS(seen_by, JSON_QUOTE(?))
  `;

  db.query(sql, [userId, groupId, userId], (err, result) => {
    if (err) {
      console.error("Error updating seen:", err);
      return res.status(500).json({ error: "Internal error" });
    }
    res.json({ success: true });
  });
});

//-------------------------------------------------------------------------------------------------------------------------
const options = {
  cert: fs.readFileSync("/etc/apache2/ssl.crt/viciphone.crt"),
  key: fs.readFileSync("/etc/apache2/ssl.key/viciphone.key"),
};

// Set up HTTPS server

// https.createServer(options, app).listen(PORT, () => {
//   `Server running on https://localhost:${PORT}`;
//   // console.log(`Server running on https://localhost:${PORT}`);
// });

const httpsServer = https.createServer(options, app);

const io = new Server(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // console.log("User connected:", socket.id);

  // 🔸 Join a group room
  socket.on("joinGroup", (groupId) => {
    socket.join(`group_${groupId}`);
    // console.log(`User ${socket.id} joined group_${groupId}`);
  });

  // ✅ 🔸 Send and Save Message to DB + broadcast
  socket.on("sendMessage", ({ groupId, message }) => {
    // ✅ Before inserting into DB
    let seenBy = [];
    if (message.senderId) seenBy.push(message.senderId);

    // 🟦 Get group creator and add them to seenBy
    const queryGroup = `SELECT created_by, members FROM chat_groups WHERE id = ? LIMIT 1`;
    db.query(queryGroup, [groupId], (err, groupRows) => {
      if (!err && groupRows.length > 0) {
        const group = groupRows[0];
        if (group.created_by && !seenBy.includes(group.created_by)) {
          seenBy.push(group.created_by);
        }
      }

      // ✅ Now insert the message into DB
      const sql = `
      INSERT INTO group_chat (
        group_id,
        group_name,
        sender_id,
        sender_name,
        sender_role,
        message,
        type,
        group_members,
        seen_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      // 🟢 Convert array → comma-separated string
      let membersText = "";
      if (Array.isArray(message.groupMembers)) {
        membersText = message.groupMembers.join(",");
      } else if (typeof message.groupMembers === "string") {
        membersText = message.groupMembers;
      }

      const values = [
        groupId,
        message.groupName || "",
        message.senderId || null,
        message.senderName || "",
        message.senderRole || "",
        message.text || "",
        message.type || "text",
        membersText,
        JSON.stringify(seenBy), // ✅ seen_by as JSON array
      ];

      db.query(sql, values, (err, result) => {
        if (err) {
          console.error("❌ DB insert error:", err);
        }
      });

      // ✅ Broadcast message to other members in group
      socket.to(`group_${groupId}`).emit("receiveMessage", {
        groupId,
        message,
      });
    });
  });

  // 🔸 Disconnect
  socket.on("disconnect", () => {
    // console.log("User disconnected:", socket.id);
  });
});

httpsServer.listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});
