const express = require("express");
require("dotenv").config();
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const billingDb = require("./models/billingdb");
const https = require("https");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const xlsx = require("xlsx");
const { getCountryFromCode } = require("./middlewares/countryCodes.js");

const bill = express();
bill.use(express.json());

const upload = multer({ dest: "uploads/" });

bill.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://10.10.10.18:5173",
      "https://10.10.10.18:5173"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
bill.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET;

const OTP_EXP_MINUTES = parseInt(process.env.OTP_EXP_MINUTES || "1", 10);
const FROM_SMS_PREFIX = process.env.SMS_FROM || "WINETT";

const authenticate = (roles = []) => {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Access denied or incorrect token format." });
    }
    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const [rows] = await billingDb.query(
        "SELECT token FROM user WHERE id = ?",
        [decoded.id]
      );

      if (!rows.length || rows[0].token !== token) {
        return res.status(403).json({ message: "Token is not active." });
      }
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Forbidden." });
      }

      req.user = decoded;
      next();
    } catch (err) {
      return res.status(403).json({ message: "Invalid or expired token." });
    }
  };
};
async function logActivity({
  user,
  ip_address,
  event_section,
  event_type,
  record_id,
  event_code,
  event_sql,
  event_notes,
  user_group,
}) {
  const sql = `
    INSERT INTO activity_log 
    (event_date, user, ip_address, event_section, event_type, record_id, event_code, event_sql, event_notes, user_group)
    VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await billingDb.query(sql, [
    user,
    ip_address,
    event_section,
    event_type,
    record_id,
    event_code,
    event_sql,
    event_notes,
    user_group,
  ]);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// async function sendEmail(toEmail, subject, html) {
//   if (!transporter) return;
//   try {
//     await transporter.sendMail({
//       from: process.env.SMTP_FROM || transporter.options.auth.user,
//       to: toEmail,
//       subject,
//       html,
//     });
//   } catch (err) {
//     console.error("Email send error:", err);
//   }
// }

async function sendEmail(toEmail, subject, html, options = {}) {
  if (!transporter) return;

  // 👇 agar object pass hua ho
  let mailOptions;

  if (typeof toEmail === "object") {
    mailOptions = {
      from: options.fromName
        ? `"${options.fromName}" <${process.env.SMTP_FROM}>`
        : process.env.SMTP_FROM,
      to: toEmail.to,
      subject: toEmail.subject,
      html: toEmail.html,
      replyTo: toEmail.replyTo,
    };
  } else {
    // 👇 OTP & existing emails ke liye (unchanged)
    mailOptions = {
      from: process.env.SMTP_FROM,
      to: toEmail,
      subject,
      html,
    };
  }

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Email send error:", err);
  }
}


async function sendWhatsappOtp(mobile, countryCode, otp) {
  try {
    if (!mobile) {
      console.warn("⚠️ Mobile number is missing, skipping WhatsApp OTP.");
      return;
    }

    if (!countryCode) {
    }

    const cleanMobile = mobile.replace(/[^0-9]/g, "");
    const to = countryCode + cleanMobile; // full number

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: "billingotp",
        language: { code: "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: otp }] },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    };

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:
          process.env.WHATSAPP_API_KEY ||
          "701a60c9-c50d-11ef-bb5a-02c8a5e042bd",
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(
        "https://partnersv1.pinbot.ai/v3/517973978061642/messages",
        options,
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                console.error("❌ WhatsApp API returned an error:", json.error);
                return reject(json.error);
              }
              resolve(json);
            } catch (e) {
              console.warn(
                "⚠️ Failed to parse WhatsApp API response as JSON, returning raw data."
              );
              resolve(data);
            }
          });
        }
      );

      req.on("error", (err) => {
        console.error("🚨 WhatsApp request error:", err);
        reject(err);
      });

      req.write(JSON.stringify(payload));
      req.end();

    });
  } catch (err) {
    console.error("💥 WhatsApp Send Error:", err);
  }
}

bill.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: "Missing credentials" });

    const [rows] = await billingDb.query(
      "SELECT * FROM user WHERE username = ? AND (del_status IS NULL OR del_status != 1)",
      [username]
    );

    if (!rows.length)
      return res.status(401).json({ message: "Invalid username or password" });

    const user = rows[0];

    const match = user.password.startsWith("$2")
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!match)
      return res.status(401).json({ message: "Invalid username or password" });

    if (user.status === "inactive") {
      return res.status(403).json({
        message: "Your account is inactive. Please contact your Admin.",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);
    const now = new Date();

    await billingDb.query(
      `INSERT INTO otp_verification
      (user_id, username, otp, otp_email, otp_mobile, expires_at, created_at, attempt, otp_status, used)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'sent', 0)`,
      [
        user.id,
        user.username,
        otp,
        user.email || null,
        user.mobileno || null,
        expiresAt,
        now,
      ]
    );

    if (user.mobileno && user.country_code) {
      await sendWhatsappOtp(user.mobileno, user.country_code, otp);
    }

    if (user.email) {
      const year = new Date().getFullYear();
      const template = fs.readFileSync("cron/loginOtpEmail.html", "utf8");

      const html = template
        .replace(/{{name}}/g, user.firstname || user.username)
        .replace(/{{otp}}/g, otp)
        .replace(/{{year}}/g, year);

      sendEmail(user.email, "Your Login OTP", html);
    }

    return res.json({ message: "OTP sent", userId: user.id });
  } catch (err) {
    console.error("Login OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});
//------------------------------------------------------------------------------------------------------

bill.get("/auth/otp-reference/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await billingDb.query(
      "SELECT email, mobileno FROM user WHERE id = ?",
      [userId]
    );

    if (!rows.length)
      return res.status(404).json({ message: "User not found" });

    return res.json({
      email: rows[0].email || "",
      mobile: rows[0].mobileno || "",
    });
  } catch (err) {
    console.error("OTP reference error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.post("/auth/verify-otp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp)
      return res.status(400).json({ message: "Missing userId or otp" });

    const [rows] = await billingDb.query(
      `SELECT * FROM otp_verification
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (!rows.length) return res.status(400).json({ message: "OTP not found" });

    const record = rows[0];
    const now = new Date();

    if (new Date(record.expires_at) < now)
      return res.status(400).json({ message: "OTP expired" });

    if (record.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    await billingDb.query(
      "UPDATE otp_verification SET otp_status='verified', used=1 WHERE id=?",
      [record.id]
    );

    const [userRows] = await billingDb.query(
      "SELECT * FROM user WHERE id = ?",
      [userId]
    );

    const user = userRows[0];
    const role = user.group == 0 ? "admin" : "client";

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        firstname: user.firstname,
        Typeofaccount: user.Typeofaccount,
        balance: user.balance,
        Creditlimit: user.Creditlimit,
        role,
      },
      JWT_SECRET,
      { expiresIn: "9h" }
    );

    await billingDb.query("UPDATE user SET token = ? WHERE id = ?", [
      token,
      user.id,
    ]);

    return res.json({
      message: "Login success",
      token,
      role,
      user: {
        id: user.id,
        username: user.username,
        firstname: user.firstname,
        Typeofaccount: user.Typeofaccount,
        balance: user.balance,
        Creditlimit: user.Creditlimit,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.post("/auth/resend-otp", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const [rows] = await billingDb.query("SELECT * FROM user WHERE id = ?", [
      userId,
    ]);

    if (!rows.length)
      return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);

    await billingDb.query(
      `INSERT INTO otp_verification
      (user_id, username, otp, otp_email, otp_mobile, expires_at, created_at, attempt, otp_status, used)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), 2, 'resent', 0)`,
      [
        user.id,
        user.username,
        otp,
        user.email || null,
        user.mobileno || null,
        expiresAt,
      ]
    );

    if (user.mobileno && user.country_code) {
      await sendWhatsappOtp(user.mobileno, user.country_code, otp);
    }

    if (user.email) {
      sendEmail(
        user.email,
        "Your Login OTP (Resent)",
        `<p>Your OTP is <b>${otp}</b>. Valid for ${OTP_EXP_MINUTES} minutes.</p>`
      );
    }

    return res.json({ message: "OTP resent successfully" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});
//------------------------------------------------------------------------------------------------------

bill.get("/auth/check-token", authenticate(), (req, res) => {
  res.json({ valid: true });
});

bill.post("/auth/logout", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided." });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    await billingDb.query("UPDATE user SET token = NULL WHERE id = ?", [
      decoded.id,
    ]);

    res.json({ message: "Logged out successfully." });
  } catch (err) {
    res.status(400).json({ message: "Invalid token." });
  }
});

bill.get("/logs", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT 
        admin_log_id,
        event_date,
        user,
        ip_address,
        event_section,
        event_type,
        record_id,
        event_code,
        event_sql,
        event_notes,
        user_group
      FROM  activity_log
      ORDER BY event_date DESC
      LIMIT 500
    `);

    res.json(rows);
  } catch (err) {
    console.error("🔴 Fetch activity logs error:", err);
    res.status(500).json({ message: "Failed to fetch activity logs" });
  }
});

//--------------------------------------------------------------------------------------------

bill.get("/users_dropdown", authenticate(), async (req, res) => {
  try {
    const { id, role } = req.user;
    let query = "";
    let params = [];
    if (role === "admin") {
      query = `
        SELECT id, username, firstname, lastname 
        FROM user 
        WHERE (del_status IS NULL OR del_status != 1)
          AND \`group\` != 0
      `;
    } else if (role === "client") {
      query = `
        SELECT id, username, firstname, lastname
        FROM user
        WHERE id = ?
          AND (del_status IS NULL OR del_status != 1)
      `;
      params = [id];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }
    const [rows] = await billingDb.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error("🔴 Users Dropdown Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

bill.post("/next2call-users", async (req, res) => {
  try {
    const {
      username,
      password,
      country,
      companyname,
      state,
      lastname,
      firstname,
      city,
      address,
      pincode,
      phoneno,
      email,
      token,
      mobileno,
      Recordcall,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username & password required" });
    }
    const [existing] = await billingDb.query(
      "SELECT id FROM user WHERE username = ? AND (del_status IS NULL OR del_status = 0)",
      [username]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const insertSql = `
      INSERT INTO user (
        username, password, \`group\`, planid, planname, status,
        country, companyname, state, lastname, firstname, city, address,
        pincode, phoneno, email, token, mobileno,
        Typeofaccount, Recordcall, balance, del_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      username,
      password,
      1,
      null,
      null,
      "pending",
      country || null,
      companyname || null,
      state || null,
      lastname || null,
      firstname || null,
      city || null,
      address || null,
      pincode || null,
      phoneno || null,
      email || null,
      token || null,
      mobileno || null,
      "Prepaid",
      Recordcall || 0,
      0,
      0,
    ];

    await billingDb.query(insertSql, values);
    if (email) {
      const subject = "Welcome to Next2Call – Your Account Is Ready";

      const year = new Date().getFullYear();
      const loginUrl = "https://10.10.10.18/billing/";

      const htmlTemplate = fs.readFileSync("cron/welcomEmail.html", "utf8");

      const html = htmlTemplate
        .replace(/{{name}}/g, firstname || username)
        .replace(/{{username}}/g, username)
        .replace(/{{password}}/g, password)
        .replace(/{{loginUrl}}/g, loginUrl)
        .replace(/{{year}}/g, year);

      sendEmail(email, subject, html);
      sendEmail(
        "sakshi.gupta@next2call.com",
        `New User Registered: ${username}`,
        html
      );
    }

    res.status(201).json({
      message: "User created successfully",
    });
  } catch (err) {
    console.error("Add user error:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

//-----------------------------------------------------------------------

bill.get("/users", authenticate(), async (req, res) => {
  try {
    const { id, role } = req.user;

    let query, params;

    if (role === "admin") {
      query = `
        SELECT * FROM user 
       WHERE (del_status = 0 OR del_status IS NULL)
          AND \`group\` != 0 
        ORDER BY id DESC
      `;
      params = [];
    } else if (role === "client") {
      query = `
        SELECT * FROM user 
        WHERE id = ? 
          AND (del_status = 0 OR del_status IS NULL)

      `;
      params = [id];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Users fetch error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

//-------------------------------------------------------------------------------------------

bill.post("/users", authenticate(), async (req, res) => {
  try {
    const adminId = req.user?.username || 0;
    const clientIp = req.ip;

    const {
      username,
      password,
      group,
      planid,
      planname,
      status,
      country,
      state,
      lastname,
      firstname,
      city,
      address,
      pincode,
      companyname,
      email,
      mobileno,
      country_code,
      Typeofaccount,
      Recordcall,
      createSip,
      select_host,
      host,
      codec,
      port,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }
    const [existing] = await billingDb.query(
      "SELECT id FROM user WHERE username = ? AND (del_status IS NULL OR del_status = 0)",
      [username]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const userSql = `
  INSERT INTO user (
    username, password, \`group\`, planid, planname, status, 
    country, state, lastname, firstname, city, address, 
    pincode, email, mobileno, country_code, Typeofaccount, Recordcall, companyname,del_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
`;

    const userValues = [
      username,
      password,
      group || 1,
      planid,
      planname,
      status || "active",
      country,
      state,
      lastname,
      firstname,
      city,
      address,
      pincode,
      email,
      mobileno,
      country_code || "91",
      Typeofaccount,
      Recordcall || 0,
      companyname,
    ];

    const result = await billingDb.query(userSql, userValues);
    const newUserId = result[0].insertId;
    await logActivity({
      user: adminId,
      ip_address: clientIp,
      event_section: "USERS",
      event_type: "ADD",
      record_id: newUserId,
      event_code: "ADD_USER",
      event_sql: userSql,
      event_notes: `User '${username}' created`,
      user_group: "---ALL---",
    });

    if (createSip && select_host) {
      const codecString = Array.isArray(codec)
        ? codec.join(",")
        : codec || "ulaw,alaw,g722";

      const sipSql = `
    INSERT INTO sipaccount (
      accountcode, username, password, callerid, codec, host, select_host, port, del_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `;

      const sipPassword = select_host === "ip" ? null : password;

      const sipValues = [
        username,
        username,
        sipPassword,
        username,
        codecString,
        select_host === "ip" ? host : "user",
        select_host,
        port || 5060,
      ];
      await billingDb.query(sipSql, sipValues);

      await logActivity({
        user: adminId,
        ip_address: clientIp,
        event_section: "SIP",
        event_type: "ADD",
        record_id: newUserId,
        event_code: "ADD_SIP",
        event_sql: sipSql,
        event_notes: `SIP created for user '${username}'`,
        user_group: "---ALL---",
      });

      const confPath = path.join("/etc/asterisk", "billingsip.conf");
      let confEntry = "";

      if (select_host === "user") {
        confEntry = `
[${username}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
transport=transport-udp
auth=${username}
aors=${username}
callerid=${username}
accountcode=${username}

[${username}]
type=auth
auth_type=userpass
password=${password}
username=${username}

[${username}]
type=aor
max_contacts=1
`;
      } else if (select_host === "ip") {
        const carrierName = `carrier-${username}`;
        confEntry = `
[${carrierName}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${carrierName}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${carrierName}-aor]
type=aor
max_contacts=1

[${carrierName}-identify]
type=identify
endpoint=${carrierName}
match=${host}
`;
      }

      fs.appendFileSync(confPath, confEntry, "utf8");

      await billingDb.query(
        "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
      );
    }

    res.status(201).json({
      message: createSip
        ? " User + SIP account created successfully"
        : "User created successfully (no SIP account)",
    });
  } catch (err) {
    console.error("Add user error:", err);

    const mysqlMessage = err.sqlMessage || err.message || "Failed to add user";

    res.status(500).json({ message: mysqlMessage });
  }
});

//-------------------------------------------------------------

bill.put("/users/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      group,
      planid,
      planname,
      status,
      country,
      state,
      lastname,
      firstname,
      city,
      address,
      pincode,
      email,
      mobileno,
      country_code,
      Typeofaccount,
      Recordcall,
      createSip,
      select_host,
      host,
      codec,
      port,
    } = req.body;

    const [existingUser] = await billingDb.query(
      "SELECT * FROM user WHERE id = ? AND del_status = 0",
      [id]
    );
    if (!existingUser.length)
      return res.status(404).json({ message: "User not found" });

    const currentUser = existingUser[0];
    const oldUsername = currentUser.username;

    const usernameChanged = username && username !== oldUsername;
    const passwordChanged = password && password !== currentUser.password;

    const sql = `
      UPDATE user
      SET 
        username = COALESCE(?, username),
        password = COALESCE(?, password),
        \`group\` = ?,
        planid = ?,
        planname = ?,
        status = ?,
        country = ?,
        state = ?,
        lastname = ?,
        firstname = ?,
        city = ?,
        address = ?,
        pincode = ?,
        email = ?,
        mobileno = ?,
         country_code = ?, 
        Typeofaccount = ?,
        Recordcall = ?
      WHERE id = ? AND del_status = 0
    `;

    await billingDb.query(sql, [
      username || currentUser.username,
      password || currentUser.password,
      group || currentUser.group,
      planid || currentUser.planid,
      planname || currentUser.planname,
      status || currentUser.status,
      country || currentUser.country,
      state || currentUser.state,
      lastname || currentUser.lastname,
      firstname || currentUser.firstname,
      city || currentUser.city,
      address || currentUser.address,
      pincode || currentUser.pincode,
      email || currentUser.email,
      mobileno || currentUser.mobileno,
      country_code || currentUser.country_code || "91",
      Typeofaccount || currentUser.Typeofaccount,
      Recordcall ?? currentUser.Recordcall,
      id,
    ]);

    if (createSip && select_host) {
      const codecString = Array.isArray(codec)
        ? codec.join(",")
        : codec || "ulaw,alaw,g722";
      const sipUsername = username || oldUsername;
      const sipPassword = password || currentUser.password;

      await billingDb.query(
        `INSERT INTO sipaccount (accountcode, username, password, callerid, codec, host, select_host, port, del_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE username=VALUES(username), password=VALUES(password), codec=VALUES(codec), host=VALUES(host), port=VALUES(port)`,
        [
          sipUsername,
          sipUsername,
          sipPassword,
          sipUsername,
          codecString,
          host || "user",
          select_host,
          port || 5060,
        ]
      );

      const confPath = path.join("/etc/asterisk", "billingsip.conf");
      let confContent = fs.readFileSync(confPath, "utf8");

      const regex = new RegExp(
        `\\[${oldUsername}\\][\\s\\S]*?(?=\\n\\[|$)`,
        "g"
      );
      confContent = confContent.replace(regex, "");

      let newConfEntry = "";

      if (select_host === "user") {
        newConfEntry = `
[${sipUsername}]
type=endpoint
context=from-external
disallow=all
allow=${codecString}
transport=transport-udp
auth=${sipUsername}
aors=${sipUsername}
callerid=${sipUsername}
accountcode=${sipUsername}

[${sipUsername}]
type=auth
auth_type=userpass
password=${sipPassword}
username=${sipUsername}

[${sipUsername}]
type=aor
max_contacts=1
`;
      } else if (select_host === "ip") {
        const carrierName = `carrier-${sipUsername}`;
        newConfEntry = `
[${carrierName}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${carrierName}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${carrierName}-aor]
type=aor
max_contacts=1

[${carrierName}-identify]
type=identify
endpoint=${carrierName}
match=${host}
`;
      }

      fs.writeFileSync(confPath, confContent + newConfEntry, "utf8");

      await billingDb.query(
        "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
      );
    }

    res.json({
      message:
        "✅ User updated successfully" +
        (usernameChanged || passwordChanged || createSip
          ? " (SIP updated and reload triggered)"
          : ""),
    });
  } catch (err) {
    console.error("🔴 Failed to update user:", err);
    res.status(500).json({ message: "Failed to update user" });
  }
});
//----------------------------------------------------------------------------------------------------

bill.delete("/users/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // 1. CHECK USER EXISTS
    const [userRows] = await billingDb.query(
      "SELECT username, planid FROM user WHERE id = ? LIMIT 1",
      [id]
    );

    if (!userRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const { username } = userRows[0];

    // 2. DELETE SIPACCOUNT (HARD DELETE)
    await billingDb.query("DELETE FROM sipaccount WHERE username = ?", [
      username,
    ]);

    // 3. DELETE USER (HARD DELETE)
    await billingDb.query("DELETE FROM user WHERE id = ?", [id]);

    // 4. REMOVE FROM billingsip.conf
    const confPath = path.join("/etc/asterisk", "billingsip.conf");

    if (fs.existsSync(confPath)) {
      let confData = fs.readFileSync(confPath, "utf8");

      // Remove endpoint, auth, and aor blocks
      const regex = new RegExp(`(\\[${username}\\][\\s\\S]*?)(?=\\[|$)`, "g");

      confData = confData.replace(regex, "");

      fs.writeFileSync(confPath, confData, "utf8");
    }

    // 5. Trigger Asterisk reload
    await billingDb.query(
      "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
    );

    res.json({
      message: "🗑️ User and SIP account permanently deleted",
    });
  } catch (err) {
    console.error("🔴 HARD DELETE ERROR:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

//-------------------------------------------------------------------------------------------
bill.get("/user_planGroups", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT pg.PlanGroupID, pg.Plangroupname
      FROM planGroup pg
      LEFT JOIN user u 
        ON u.planid = pg.PlanGroupID 
        AND (u.del_status IS NULL OR u.del_status != 1)
      WHERE 
        (pg.del_status IS NULL OR pg.del_status != 1)
        AND u.id IS NULL
    `);

    res.json(rows);
  } catch (err) {
    console.error("🔴 Plan groups fetch error:", err);
    res.status(500).json({ message: "Failed to fetch plan groups" });
  }
});


//-------------------------------------------------------------------------------------------

bill.get("/plans", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      `SELECT id, PlanID, PlanName, lcr_type
       FROM plans 
       WHERE (del_status IS NULL OR del_status != 1) ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Backend Plans fetch error:", err);
    res.status(500).json({ message: "Failed to fetch plans" });
  }
});

//----------------------------------------------------------------------------------

bill.post("/plans", authenticate(), async (req, res) => {
  try {
    let { PlanID, PlanName, lcr_type } = req.body;

    if (!PlanName) {
      return res.status(400).json({ message: "Plan Name is required" });
    }

    if (!lcr_type) {
      return res.status(400).json({ message: "LCR Type is required" });
    }

    // ✅ Generate unique PlanID if not provided
    if (!PlanID) {
      PlanID = Math.floor(100000 + Math.random() * 900000).toString();
      let [existing] = await billingDb.query(
        "SELECT id FROM plans WHERE PlanID = ?",
        [PlanID]
      );

      while (existing.length > 0) {
        PlanID = Math.floor(100000 + Math.random() * 900000).toString();
        [existing] = await billingDb.query(
          "SELECT id FROM plans WHERE PlanID = ?",
          [PlanID]
        );
      }
    }

    // ✅ Insert Plan
    const [result] = await billingDb.query(
      "INSERT INTO plans (PlanID, PlanName, lcr_type) VALUES (?, ?, ?)",
      [PlanID, PlanName, lcr_type]
    );

    // ✅ Add to activity_log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN",
      event_type: "ADD",
      record_id: result.insertId,
      event_code: "ADD_PLAN",
      event_sql: `
        INSERT INTO plans (PlanID, PlanName, lcr_type)
        VALUES ('${PlanID}', '${PlanName}', '${lcr_type}');
      `,
      event_notes: `New Plan Created: ${PlanName} (${PlanID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json({
      id: result.insertId,
      PlanID,
      PlanName,
      lcr_type,
      del_status: null,
    });
  } catch (err) {
    console.error("Failed to add plan:", err);
    res.status(500).json({ message: "Failed to add plan" });
  }
});

//----------------------------------------------------------------------------------

bill.put("/plans/bulk-update", authenticate(), async (req, res) => {
  try {
    const { ids, PlanName, lcr_type } = req.body;

    if (!ids?.length) {
      return res.status(400).json({ message: "No plans selected" });
    }

    const fields = [];
    const values = [];

    if (PlanName) {
      fields.push("PlanName = ?");
      values.push(PlanName);
    }
    if (lcr_type) {
      fields.push("lcr_type = ?");
      values.push(lcr_type);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    await billingDb.query(
      `UPDATE plans SET ${fields.join(", ")} WHERE id IN (?)`,
      [...values, ids]
    );

    res.json({ message: "Plans updated successfully" });
  } catch (err) {
    console.error("Bulk update error:", err);
    res.status(500).json({ message: "Bulk update failed" });
  }
});

//-------------------------------------------------------------------------------------
bill.put("/plans/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { lcr_type } = req.body;

    // Get old data for logging
    const [oldRows] = await billingDb.query(
      "SELECT * FROM plans WHERE id = ?",
      [id]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // Update plan
    const [result] = await billingDb.query(
      "UPDATE plans SET lcr_type = ? WHERE id = ?",
      [lcr_type, id]
    );

    // Activity log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN",
      event_type: "MODIFY",
      record_id: id,
      event_code: "MODIFY_PLAN",
      event_sql: `
        UPDATE plans
        SET PlanID='${PlanID}', PlanName='${PlanName}', lcr_type='${lcr_type}'
        WHERE id=${id};
      `,
      event_notes: `Plan updated: ${oldRows[0].PlanName} → ${PlanName}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Plan updated successfully" });
  } catch (err) {
    console.error("❌ Error updating plan:", err);
    res.status(500).json({ message: "Failed to update plan" });
  }
});

//--------------------------------------------------------------------------------------------------

bill.delete("/plans/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get plan
    const [rows] = await billingDb.query(
      "SELECT * FROM plans WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const plan = rows[0];

    // 2️⃣ DEPENDENCY CHECK → planGroup
    const [pgRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM planGroup WHERE FIND_IN_SET(?, plangroupmembers)",
      [plan.PlanID]   // 🔥 VERY IMPORTANT (PlanID, not id)
    );

    if (pgRows[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete plan "${plan.PlanName}" because it is assigned to ${pgRows[0].count} plan group(s). Remove dependency first.`,
      });
    }

    // 3️⃣ Safe hard delete
    await billingDb.query("DELETE FROM plans WHERE id = ?", [id]);

    // 4️⃣ Activity log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_PLAN",
      event_sql: `DELETE FROM plans WHERE id=${id}`,
      event_notes: `Plan deleted: ${plan.PlanName} (${plan.PlanID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Plan deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting plan:", err);
    res.status(500).json({ message: "Failed to delete plan" });
  }
});

//--------------------------------------------------------------------------------------------------
bill.post("/plans/check-and-assign", authenticate(), async (req, res) => {
  try {
    const { planIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(planIds) || planIds.length === 0) {
      return res.status(400).json({ message: "No plans selected" });
    }

    // 1️⃣ User ka plan group
    const [users] = await billingDb.query(
      "SELECT planid FROM user WHERE id = ?",
      [userId]
    );

    if (!users.length || !users[0].planid) {
      return res.status(400).json({ message: "User has no plan group" });
    }

    const planGroupId = users[0].planid;

    // 2️⃣ Existing plan group data
    const [groups] = await billingDb.query(
      "SELECT plangroupmembers, Lcrtype FROM planGroup WHERE PlanGroupID = ?",
      [planGroupId]
    );

    const existingPlans = groups[0]?.plangroupmembers
      ? groups[0].plangroupmembers.split(",")
      : [];

    const existingLcrTypes = groups[0]?.Lcrtype
      ? groups[0].Lcrtype.split(",")
      : [];

    // 3️⃣ Get lcr_type of selected plans
    const [planRows] = await billingDb.query(
      "SELECT PlanID, lcr_type FROM plans WHERE PlanID IN (?)",
      [planIds]
    );

    const planTypeMap = {};
    planRows.forEach(p => {
      planTypeMap[p.PlanID] = p.lcr_type;
    });

    // 4️⃣ Compare
    const alreadyAssigned = [];
    const newlyAssigned = [];
    const newLcrTypes = [];

    for (const pid of planIds) {
      if (existingPlans.includes(pid)) {
        alreadyAssigned.push(pid);
      } else {
        newlyAssigned.push(pid);

        const lcr = planTypeMap[pid];
        if (lcr && !existingLcrTypes.includes(lcr)) {
          newLcrTypes.push(lcr);
        }
      }
    }

    // 5️⃣ Update DB
    if (newlyAssigned.length > 0) {
      const updatedPlans = [...existingPlans, ...newlyAssigned];
      const updatedLcrTypes = [...existingLcrTypes, ...newLcrTypes];

      await billingDb.query(
        `UPDATE planGroup
         SET plangroupmembers = ?, Lcrtype = ?
         WHERE PlanGroupID = ?`,
        [
          updatedPlans.join(","),
          updatedLcrTypes.join(","),
          planGroupId
        ]
      );
    }

    res.json({
      message: "Plan assignment processed",
      alreadyAssigned,
      newlyAssigned,
      addedLcrTypes: newLcrTypes
    });
  } catch (err) {
    console.error("❌ Plan assign + lcr_type error:", err);
    res.status(500).json({ message: "Plan assignment failed" });
  }
});




//------------------------------------------------------------------------------------------

bill.get("/plangroups", authenticate(), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    // 1️⃣ Fetch all plans so we can map ID → Name
    const [planRows] = await billingDb.query(
      "SELECT PlanID, PlanName FROM plans"
    );

    const planMap = {};
    planRows.forEach((p) => {
      planMap[p.PlanID] = p.PlanName;
    });

    // 2️⃣ Fetch plan groups
    const [rows] = await billingDb.query(
      `SELECT id, PlanGroupID, Plangroupname, plangroupmembers, Lcrtype, del_status
       FROM planGroup
       WHERE del_status IS NULL OR del_status != 1
       ORDER BY id DESC`
    );

    const planGroupIds = rows.map((r) => r.PlanGroupID);
    let usersByGroup = {};

    if (planGroupIds.length > 0) {
      const [users] = await billingDb.query(
        `SELECT username, planid 
         FROM user 
         WHERE planid IN (?)`,
        [planGroupIds]
      );

      usersByGroup = users.reduce((acc, u) => {
        if (!acc[u.planid]) acc[u.planid] = [];
        acc[u.planid].push(u.username);
        return acc;
      }, {});
    }

    // 3️⃣ Format response
    const formatted = rows.map((r) => {
      const memberIDs =
        typeof r.plangroupmembers === "string"
          ? r.plangroupmembers.split(",").map((id) => id.trim())
          : [];

      const memberNames = memberIDs.map((id) => planMap[id] || "");

      const types =
        typeof r.Lcrtype === "string"
          ? r.Lcrtype.split(",").map((t) => t.trim())
          : [];

      return {
        ...r,
        plangroupmembers: memberNames, // ← IDs ko convert karke NAME bhej diya
        plangroupids: memberIDs, // ← IDs alag se dedo checkbox ke liye
        Lcrtype: types,
        user: usersByGroup[r.PlanGroupID] || [],
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("Backend: PlanGroups fetch error:", err);
    res.status(500).json({ message: "Failed to fetch Plan Groups" });
  }
});

//------------------------------------------------------------------------------

bill.post("/plangroups", authenticate(), async (req, res) => {
  try {
    let { PlanGroupID, Plangroupname, plangroupmembers } = req.body;

    if (!Plangroupname || !plangroupmembers) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!PlanGroupID) {
      do {
        PlanGroupID = Math.floor(100000 + Math.random() * 900000).toString();
        const [check] = await billingDb.query(
          "SELECT PlanGroupID FROM planGroup WHERE PlanGroupID = ?",
          [PlanGroupID]
        );
        if (check.length === 0) break;
      } while (true);
    }

    const memberIDs = Array.isArray(plangroupmembers)
      ? plangroupmembers
      : plangroupmembers.split(",");

    const finalType = [];

    for (let planID of memberIDs) {
      const [rows] = await billingDb.query(
        "SELECT lcr_type FROM plans WHERE PlanID = ?",
        [planID]
      );

      let actualType = "";
      if (rows.length > 0) {
        const type = rows[0].lcr_type;
        if (type === "loadbalance") actualType = "loadbalance";
        else if (type === "sellprice") actualType = "sellprice";
        else if (type === "buyprice") actualType = "buyprice";
      }
      finalType.push(actualType);
    }

    const [result] = await billingDb.query(
      `INSERT INTO planGroup (PlanGroupID, Plangroupname, plangroupmembers, Lcrtype)
       VALUES (?, ?, ?, ?)`,
      [PlanGroupID, Plangroupname, memberIDs.join(","), finalType.join(",")]
    );

    // ✅ Activity Log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN_GROUP",
      event_type: "ADD",
      record_id: result.insertId,
      event_code: "ADD_PLANGROUP",
      event_sql: `
        INSERT INTO planGroup (PlanGroupID, Plangroupname, plangroupmembers, Lcrtype)
        VALUES ('${PlanGroupID}', '${Plangroupname}', '${memberIDs.join(
        ","
      )}', '${finalType.join(",")}');
      `,
      event_notes: `Plan Group created: ${Plangroupname} (${PlanGroupID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json({
      id: result.insertId,
      PlanGroupID,
      Plangroupname,
      plangroupmembers: memberIDs,
      Lcrtype: finalType,
    });
  } catch (err) {
    console.error("Failed to add plan group:", err);
    res.status(500).json({ message: "Failed to add plan group" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.put("/plangroups/bulk-update", authenticate(), async (req, res) => {
  try {
    const { ids, Plangroupname, plangroupmembers } = req.body;

    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: "No Plan Groups selected" });
    }

    if (!Plangroupname && !plangroupmembers) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    // 🔹 Fetch existing records (for logging)
    const [oldRows] = await billingDb.query(
      "SELECT * FROM planGroup WHERE id IN (?)",
      [ids]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Plan Groups not found" });
    }

    // 🔹 Calculate LCR type if members provided
    let finalType = null;
    let memberIDs = null;

    if (plangroupmembers) {
      memberIDs = Array.isArray(plangroupmembers)
        ? plangroupmembers
        : plangroupmembers.split(",");

      finalType = [];

      for (let planID of memberIDs) {
        const [rows] = await billingDb.query(
          "SELECT lcr_type FROM plans WHERE PlanID = ?",
          [planID]
        );

        let actualType = "";
        if (rows.length) {
          const type = rows[0].lcr_type;
          if (type === "loadbalance") actualType = "loadbalance";
          else if (type === "sellprice") actualType = "sellprice";
          else if (type === "buyprice") actualType = "buyprice";
        }
        finalType.push(actualType);
      }
    }

    // 🔹 Build dynamic query
    const fields = [];
    const values = [];

    if (Plangroupname) {
      fields.push("Plangroupname = ?");
      values.push(Plangroupname);
    }

    if (memberIDs) {
      fields.push("plangroupmembers = ?");
      values.push(memberIDs.join(","));
      fields.push("Lcrtype = ?");
      values.push(finalType.join(","));
    }

    values.push(ids);

    await billingDb.query(
      `UPDATE planGroup SET ${fields.join(", ")} WHERE id IN (?)`,
      values
    );

    // 🔹 Log activity per record (VERY IMPORTANT)
    for (const row of oldRows) {
      await logActivity({
        user: req.user.username,
        ip_address: req.ip,
        event_section: "PLAN_GROUP",
        event_type: "MODIFY",
        record_id: row.id,
        event_code: "BULK_MODIFY_PLANGROUP",
        event_sql: `
          UPDATE planGroup
          SET ${fields.join(", ")}
          WHERE id = ${row.id};
        `,
        event_notes: `Bulk update Plan Group: ${row.Plangroupname}`,
        user_group: req.user.role || "UNKNOWN",
      });
    }

    res.json({ message: "Plan Groups updated successfully" });
  } catch (err) {
    console.error("Bulk update error:", err);
    res.status(500).json({ message: "Bulk update failed" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.put("/plangroups/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { PlanGroupID, Plangroupname, plangroupmembers } = req.body;

    if (!PlanGroupID || !Plangroupname || !plangroupmembers) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const [oldRows] = await billingDb.query(
      "SELECT * FROM planGroup WHERE id = ?",
      [id]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Plan Group not found" });
    }

    const memberIDs = Array.isArray(plangroupmembers)
      ? plangroupmembers
      : plangroupmembers.split(",");

    const finalType = [];

    for (let planID of memberIDs) {
      const [rows] = await billingDb.query(
        "SELECT lcr_type FROM plans WHERE PlanID = ?",
        [planID]
      );

      let actualType = "";
      if (rows.length > 0) {
        const type = rows[0].lcr_type;
        if (type === "loadbalance") actualType = "loadbalance";
        else if (type === "sellprice") actualType = "sellprice";
        else if (type === "buyprice") actualType = "buyprice";
      }
      finalType.push(actualType);
    }

    const [result] = await billingDb.query(
      `UPDATE planGroup 
       SET PlanGroupID = ?, Plangroupname = ?, plangroupmembers = ?, Lcrtype = ?
       WHERE id = ?`,
      [PlanGroupID, Plangroupname, memberIDs.join(","), finalType.join(","), id]
    );

    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN_GROUP",
      event_type: "MODIFY",
      record_id: id,
      event_code: "MODIFY_PLANGROUP",
      event_sql: `
        UPDATE planGroup
        SET PlanGroupID='${PlanGroupID}',
            Plangroupname='${Plangroupname}',
            plangroupmembers='${memberIDs.join(",")}',
            Lcrtype='${finalType.join(",")}'
        WHERE id=${id};
      `,
      event_notes: `Plan Group updated: ${oldRows[0].Plangroupname} → ${Plangroupname}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(200).json({
      message: "Plan Group updated successfully",
    });
  } catch (err) {
    console.error("Failed to update plan group:", err);
    res.status(500).json({ message: "Failed to update plan group" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.delete("/plangroups/bulk-delete", authenticate(), async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: "No Plan Groups selected" });
    }

    const [rows] = await billingDb.query(
      "SELECT * FROM planGroup WHERE id IN (?)",
      [ids]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Plan Groups not found" });
    }

    await billingDb.query(
      "DELETE FROM planGroup WHERE id IN (?)",
      [ids]
    );

    // 🔹 Log activity per deleted record
    for (const row of rows) {
      await logActivity({
        user: req.user.username,
        ip_address: req.ip,
        event_section: "PLAN_GROUP",
        event_type: "DELETE",
        record_id: row.id,
        event_code: "BULK_DELETE_PLANGROUP",
        event_sql: `DELETE FROM planGroup WHERE id = ${row.id};`,
        event_notes: `Bulk deleted Plan Group: ${row.Plangroupname} (${row.PlanGroupID})`,
        user_group: req.user.role || "UNKNOWN",
      });
    }

    res.json({ message: "Plan Groups deleted successfully" });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ message: "Bulk delete failed" });
  }
});

//-------------------------------------------------------------------------------------------

bill.delete("/plangroups/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get Plan Group
    const [rows] = await billingDb.query(
      "SELECT * FROM planGroup WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Plan Group not found" });
    }

    const group = rows[0];

    // 2️⃣ DEPENDENCY CHECK → users table
    const [userRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM user WHERE planid = ?",
      [group.PlanGroupID]   // 🔥 VERY IMPORTANT
    );

    if (userRows[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete Plan Group "${group.Plangroupname}" because ${userRows[0].count} user(s) are assigned to it.`,
      });
    }

    // 3️⃣ SAFE HARD DELETE
    await billingDb.query(
      "DELETE FROM planGroup WHERE id = ?",
      [id]
    );

    // 4️⃣ Activity Log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN_GROUP",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_PLANGROUP",
      event_sql: `DELETE FROM planGroup WHERE id = ${id};`,
      event_notes: `Plan Group deleted: ${group.Plangroupname} (${group.PlanGroupID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(200).json({
      message: "Plan Group deleted permanently",
    });
  } catch (err) {
    console.error("Failed to delete plan group:", err);
    res.status(500).json({ message: "Failed to delete plan group" });
  }
});


//-----------------------------------------------"/sipaccounts"--------------------------------------------

bill.get("/sipaccounts", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;

    let query, params;

    if (role === "admin") {
      query = `
        SELECT * FROM sipaccount 
        WHERE (del_status IS NULL OR del_status != 1)
        ORDER BY id DESC
      `;
      params = [];
    } else if (role === "client") {
      query = `
        SELECT * FROM sipaccount 
        WHERE accountcode = ? 
          AND (del_status IS NULL OR del_status != 1)
        ORDER BY id DESC
      `;
      params = [username];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Fetch SIP accounts error:", err);
    res.status(500).json({ message: "Failed to fetch SIP accounts" });
  }
});

//-------------------------------------------------------------------------------------------

bill.post("/sipaccounts", authenticate(), async (req, res) => {
  try {
    const {
      accountcode,
      username,
      password,
      callerid,
      codec,
      host,
      select_host,
      port,
    } = req.body;

    if (!accountcode || !select_host) {
      return res
        .status(400)
        .json({ message: "Accountcode and select_host are required" });
    }

    const codecString = Array.isArray(codec)
      ? codec.join(",")
      : codec || "ulaw";

    const sql = `
      INSERT INTO sipaccount 
      (accountcode, username, password, callerid, codec, host, select_host, port, del_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    await billingDb.query(sql, [
      accountcode,
      username || null,
      password || null,
      callerid || username || accountcode,
      codecString,
      host || null,
      select_host,
      port || 5060,
    ]);

    const confPath = path.join("/etc/asterisk", "billingsip.conf");
    let confEntry = "";

    if (select_host === "user") {
      // NORMAL USER SIP
      confEntry = `
[${username}]
type=endpoint
context=from-external
disallow=all
allow=${codecString}
transport=transport-udp
auth=${username}
aors=${username}
callerid=${callerid || username}
accountcode=${accountcode}

[${username}]
type=auth
auth_type=userpass
password=${password}
username=${username}

[${username}]
type=aor
max_contacts=1
`;
    } else if (select_host === "ip") {
      // IP BASED SIP WITH CARRIER PREFIX
      const carrierName = `carrier-${username}`;

      confEntry = `
[${carrierName}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${carrierName}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${carrierName}-aor]
type=aor
max_contacts=1

[${carrierName}-identify]
type=identify
endpoint=${carrierName}
match=${host}
`;
    }

    fs.appendFileSync(confPath, confEntry, "utf8");

    await billingDb.query(
      "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
    );

    res.status(201).json({
      message: "SIP account created and reload triggered successfully",
    });
  } catch (err) {
    console.error("Add SIP account error:", err);

    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      return res.status(409).json({
        message: "Username already exists",
        code: "DUPLICATE_USERNAME",
      });
    }

    res.status(500).json({ message: "Failed to add SIP account" });
  }
});

//-----------------------------------------//  edit SIP account--------------------------------------------------

bill.put("/sipaccounts/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      accountcode,
      username,
      password,
      callerid,
      codec,
      host,
      select_host,
      port,
    } = req.body;

    // Fetch existing
    const [existing] = await billingDb.query(
      "SELECT * FROM sipaccount WHERE id = ? AND (del_status IS NULL OR del_status != 1)",
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({ message: "SIP account not found" });
    }

    const old = existing[0];

    const oldType = old.select_host;
    const newType = select_host || oldType;

    const codecString = Array.isArray(codec)
      ? codec.join(",")
      : codec || old.codec || "ulaw";

    // ENFORCE SAME LOGIC AS POST:
    const finalPassword = newType === "ip" ? null : password || old.password;
    const finalHost = newType === "user" ? null : host || old.host;

    // Update DB
    const sql = `
      UPDATE sipaccount 
      SET accountcode=?, username=?, password=?, callerid=?, codec=?, host=?, select_host=?, port=? 
      WHERE id=? AND (del_status IS NULL OR del_status!=1)
    `;

    await billingDb.query(sql, [
      accountcode || old.accountcode,
      username || old.username,
      finalPassword,
      callerid || old.callerid,
      codecString,
      finalHost,
      newType,
      port || old.port,
      id,
    ]);

    // Read Asterisk conf
    const confPath = path.join("/etc/asterisk", "billingsip.conf");
    let conf = fs.readFileSync(confPath, "utf8");

    // Remove ALL old blocks (fully safe)
    const oldCarrier = `carrier-${old.username}`;
    const regex = new RegExp(
      `(\\[${old.username}\\][^\\[]*)|` +
      `(\\[${old.username}-aor\\][^\\[]*)|` +
      `(\\[${old.username}-identify\\][^\\[]*)|` +
      `(\\[${oldCarrier}\\][^\\[]*)|` +
      `(\\[${oldCarrier}-aor\\][^\\[]*)|` +
      `(\\[${oldCarrier}-identify\\][^\\[]*)`,
      "g"
    );
    conf = conf.replace(regex, "");

    // Build new block (same as POST API)
    let confEntry = "";

    if (newType === "user") {
      confEntry = `
[${username}]
type=endpoint
context=from-external
disallow=all
allow=${codecString}
transport=transport-udp
auth=${username}
aors=${username}
callerid=${callerid || username}
accountcode=${accountcode}

[${username}]
type=auth
auth_type=userpass
password=${finalPassword}
username=${username}

[${username}]
type=aor
max_contacts=1
`;
    } else if (newType === "ip") {
      const carrierName = `carrier-${username}`;

      confEntry = `
[${carrierName}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${carrierName}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${carrierName}-aor]
type=aor
max_contacts=1

[${carrierName}-identify]
type=identify
endpoint=${carrierName}
match=${finalHost}
`;
    }

    // Append new block
    fs.writeFileSync(confPath, conf + "\n" + confEntry, "utf8");

    // Reload flag
    await billingDb.query(
      "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
    );

    res.json({
      message: `SIP account updated successfully${oldType !== newType ? " (type changed, block rebuilt)" : ""
        }`,
    });
  } catch (err) {
    console.error("Update SIP account error:", err);

    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      return res.status(409).json({
        message: "Username already exists",
        code: "DUPLICATE_USERNAME",
      });
    }

    res.status(500).json({ message: "Failed to update SIP account" });
  }
});

//----------------------------------------------------
bill.delete("/sipaccounts/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await billingDb.query(
      "SELECT username, select_host FROM sipaccount WHERE id=?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "SIP account not found" });
    }

    const sip = rows[0];

    // Determine config block name
    const confPath = path.join("/etc/asterisk", "billingsip.conf");
    const carrierName =
      sip.select_host === "ip" ? `carrier-${sip.username}` : sip.username;

    // HARD DELETE from database
    await billingDb.query("DELETE FROM sipaccount WHERE id=?", [id]);

    // Remove from config
    if (fs.existsSync(confPath)) {
      let data = fs.readFileSync(confPath, "utf8");
      const regex = new RegExp(
        `\\[(${carrierName}|${carrierName}-aor|${carrierName}-identify)\\][\\s\\S]*?(?=\\n\\[|$)`,
        "g"
      );

      data = data.replace(regex, "");
      fs.writeFileSync(confPath, data, "utf8");
    }
    await billingDb.query(
      "UPDATE reload_status SET status=1, last_updated=NOW() WHERE reload_type='pjsip_reload'"
    );

    res.json({
      message: "🗑 SIP account permanently deleted from DB and config",
    });
  } catch (err) {
    console.error("🔴 Delete SIP account error:", err);
    res.status(500).json({ message: "Failed to delete SIP account" });
  }
});

//-------------------------------------------------------------------------------------------

bill.get("/sipaccounts/check-duplicate", authenticate(), async (req, res) => {
  const { username, host } = req.query;

  try {
    let response = { usernameExists: false, hostExists: false };

    if (username) {
      const [uRows] = await billingDb.query(
        "SELECT id FROM sipaccount WHERE username = ? AND (del_status IS NULL OR del_status != 1)",
        [username]
      );
      response.usernameExists = uRows.length > 0;
    }

    // Host/IP check
    if (host) {
      const [hRows] = await billingDb.query(
        "SELECT id FROM sipaccount WHERE host = ? AND (del_status IS NULL OR del_status != 1)",
        [host]
      );
      response.hostExists = hRows.length > 0;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//-------------------------------------------------------------------------------------------

bill.get("/onlinecalls", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query("SELECT * FROM onlinecalls");

    const enhancedRows = rows.map((call) => {
      const status = String(call.status || "").toLowerCase();
      let duration = 0;

      if (status === "answer" && call.updated_at) {
        const start = new Date(call.updated_at).getTime();
        if (!isNaN(start)) {
          duration = Math.floor((Date.now() - start) / 1000);
        }
      }
      return { ...call, duration };
    });

    res.json(enhancedRows);
  } catch (err) {
    console.error("🔴 Fetch Online Calls Error:", err);
    res.status(500).json({ message: "Failed to fetch online calls" });
  }
});

//-------------------------------------------------------------------------------------------


bill.get("/tariffs", authenticate(), async (req, res) => {
  try {
    const { username, role } = req.user;

    if (role === "admin") {
      const [rows] = await billingDb.query(`
        SELECT 
          t.id, t.TarrifID, t.PlanID, t.PlanName, t.Code, t.Destination,
          t.TrunkID, t.TrunkName, t.buyprice, t.buyminimum, t.buyincrement,
          t.sellprice, t.sellminimum, t.sellincrement, t.status, t.del_status
        FROM tariff t
        WHERE t.del_status IS NULL OR t.del_status != 1
        ORDER BY t.id DESC
      `);

      return res.json(rows);
    }

    if (role === "client") {
      const [userRow] = await billingDb.query(
        "SELECT planid, planname FROM user WHERE username = ?",
        [username]
      );

      if (!userRow.length) {
        return res.json([]);
      }
      const { planid, planname } = userRow[0];
      const [pg] = await billingDb.query(
        "SELECT plangroupmembers FROM planGroup WHERE PlanGroupID = ? AND plangroupname = ?",
        [planid, planname]
      );

      if (!pg.length) {
        return res.json([]);
      }

      const members = pg[0].plangroupmembers.split(",").map((x) => x.trim());
      const [rows] = await billingDb.query(
        `
        SELECT 
          t.id, t.TarrifID, t.PlanID, t.PlanName, t.Code, t.Destination,
          t.TrunkID, t.TrunkName, t.buyprice, t.buyminimum, t.buyincrement,
          t.sellprice, t.sellminimum, t.sellincrement, t.status, t.del_status
        FROM tariff t
        WHERE t.PlanID IN (?)
          AND (t.del_status IS NULL OR t.del_status != 1)
        ORDER BY t.id DESC
      `,
        [members]
      );
      const formatted = rows.map((r) => ({
        ...r,
        status: r.status ? r.status.toLowerCase() : "inactive",
      }));
      return res.json(formatted);
    }
    return res.status(403).json({ message: "Unauthorized role" });
  } catch (err) {
    console.error("Tariffs fetch error:", err);
    res.status(500).json({ message: "Failed to fetch Tariffs" });
  }
});

//-------------------------------------------------------------------------------------------


bill.get("/tariff_trunks", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      `SELECT id, trunkname 
       FROM trunk 
       WHERE del_status IS NULL OR del_status != 1 `
    );
    res.json(rows);
  } catch (err) {
    console.error("🔴 Backend Trunks fetch error:", err);
    res.status(500).json({ message: "Failed to fetch trunks" });
  }
});

//-------------------------------------------------------------------------------------------

bill.post("/tariffs", authenticate(), async (req, res) => {
  try {
    let {
      TarrifID,
      PlanID,
      PlanName,
      TrunkID,
      TrunkName,
      Code,
      Destination,
      buyprice,
      buyminimum,
      buyincrement,
      sellprice,
      sellminimum,
      sellincrement,
      status,
    } = req.body;

    // ✅ Safety duplicate check (rare case)
    const [dup] = await billingDb.query(
      "SELECT id FROM tariff WHERE TarrifID = ? LIMIT 1",
      [TarrifID]
    );

    if (dup.length > 0) {
      return res.status(409).json({ message: "Duplicate TarrifID detected" });
    }

    if (!PlanName || !TrunkName) {
      return res
        .status(400)
        .json({ message: "PlanName & TrunkName are required" });
    }

    if (!PlanID && PlanName) {
      const [planRow] = await billingDb.query(
        "SELECT PlanID FROM plans WHERE PlanName = ? LIMIT 1",
        [PlanName]
      );
      if (planRow.length > 0) PlanID = planRow[0].PlanID;
    }

    if (!TrunkID && TrunkName) {
      const [trunkRow] = await billingDb.query(
        "SELECT id FROM trunk WHERE trunkname = ? LIMIT 1",
        [TrunkName]
      );
      if (trunkRow.length > 0) TrunkID = trunkRow[0].id;
    }

    const query = `
      INSERT INTO tariff
      (TarrifID, PlanID, PlanName, Code, Destination, TrunkID, TrunkName,
       buyprice, buyminimum, buyincrement, sellprice, sellminimum, sellincrement, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      TarrifID,
      PlanID,
      PlanName,
      Code || null,
      Destination || null,
      TrunkID,
      TrunkName,
      buyprice || 0,
      buyminimum || 0,
      buyincrement || 0,
      sellprice || 0,
      sellminimum || 0,
      sellincrement || 0,
      status || "Active",
    ];

    const [result] = await billingDb.query(query, values);

    const [rows] = await billingDb.query("SELECT * FROM tariff WHERE id = ?", [
      result.insertId,
    ]);

    // ✅ Activity Log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TARIFF",
      event_type: "ADD",
      record_id: result.insertId,
      event_code: "ADD_TARIFF",
      event_sql: `
        INSERT INTO tariff (TarrifID, PlanID, PlanName, Code, Destination, TrunkID, TrunkName,
          buyprice, buyminimum, buyincrement, sellprice, sellminimum, sellincrement, status)
        VALUES ('${TarrifID}', '${PlanID}', '${PlanName}', '${Code}', '${Destination}',
          '${TrunkID}', '${TrunkName}', '${buyprice}', '${buyminimum}', '${buyincrement}',
          '${sellprice}', '${sellminimum}', '${sellincrement}', '${status}');
      `,
      event_notes: `New Tariff Created: ${PlanName} → ${Destination} (${TarrifID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Tariff insert error:", err);
    res.status(500).json({ message: "Failed to add tariff" });
  }
});

//-------------------------------------------------------------------------------------------

bill.put("/tariffs/bulk-update", authenticate(), async (req, res) => {
  const { ids, updates } = req.body;

  if (!ids?.length || !updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "Invalid bulk update data" });
  }

  const allowedFields = [
    "buyprice",
    "buyminimum",
    "buyincrement",
    "sellprice",
    "sellminimum",
    "sellincrement",
    "status",
    "del_status",
    "PlanID",
    "PlanName",
    "TrunkID",
    "TrunkName"
  ];

  const fields = [];
  const values = [];

  for (const key in updates) {
    if (
      allowedFields.includes(key) &&
      updates[key] !== "" &&
      updates[key] !== null &&
      updates[key] !== undefined
    ) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }

  }

  if (!fields.length) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  const sql = `
    UPDATE tariff
    SET ${fields.join(", ")}
    WHERE id IN (?)
  `;

  await billingDb.query(sql, [...values, ids]);

  res.json({ updatedCount: ids.length });
});

//-----------------------------------------------------------------------------------

bill.get("/tariffs/next-id", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT CAST(TarrifID AS UNSIGNED) AS id
      FROM tariff
      WHERE CAST(TarrifID AS UNSIGNED) >= 1
      ORDER BY id ASC
    `);

    let nextId = 1;

    for (const r of rows) {
      if (r.id !== nextId) break;
      nextId++;
    }

    if (nextId > 99999999) {
      return res.status(400).json({ message: "Tariff ID limit exceeded" });
    }

    res.json({
      TarrifID: String(nextId).padStart(8, "0"),
    });

  } catch (err) {
    console.error("Next Tariff ID error:", err);
    res.status(500).json({ message: "Failed to generate TarrifID" });
  }
});

//----------------------------------------------------------------------------------------

bill.put("/tariffs/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const allowedFields = [
      "TarrifID",
      "PlanID",
      "PlanName",
      "Code",
      "Destination",
      "TrunkID",
      "TrunkName",
      "buyprice",
      "buyminimum",
      "buyincrement",
      "sellprice",
      "sellminimum",
      "sellincrement",
      "status",
      "del_status",
    ];
    const [oldRows] = await billingDb.query(
      "SELECT * FROM tariff WHERE id = ?",
      [id]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Tariff not found" });
    }

    const fields = [];
    const values = [];
    for (const key in data) {
      if (allowedFields.includes(key)) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    values.push(id);

    const updateSQL = `
      UPDATE tariff
      SET ${fields.join(", ")}
      WHERE id = ?
    `;

    await billingDb.query(updateSQL, values);
    const [updated] = await billingDb.query(
      "SELECT * FROM tariff WHERE id = ?",
      [id]
    );
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TARIFF",
      event_type: "MODIFY",
      record_id: id,
      event_code: "MODIFY_TARIFF",
      event_sql: updateSQL.replace(/\s+/g, " ").trim(),
      event_notes: `Tariff updated: ${oldRows[0].Destination} → ${updated[0].Destination}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json(updated[0]);
  } catch (err) {
    console.error("Tariff update error:", err);
    res.status(500).json({ message: "Failed to update tariff" });
  }
});

//-----------------------------------------------------------------------------------------------------------------------

bill.delete("/tariffs/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await billingDb.query("SELECT * FROM tariff WHERE id = ?", [
      id,
    ]);
    if (!rows.length) {
      return res.status(404).json({ message: "Tariff not found" });
    }

    const tariff = rows[0];

    await billingDb.query("DELETE FROM tariff WHERE id = ?", [id]);

    // Log delete activity
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TARIFF",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_TARIFF",
      event_sql: `DELETE FROM tariff WHERE id = ${id};`,
      event_notes: `Tariff deleted: ${tariff.PlanName} → ${tariff.Destination} (${tariff.TarrifID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Tariff deleted successfully", id });
  } catch (err) {
    console.error("Tariff delete error:", err);
    res.status(500).json({ message: "Failed to delete tariff" });
  }
});

//------------------------------------------------------------------------------------------------

async function getNextTariffId() {
  console.log("🔍 [getNextTariffId] Fetching existing TarrifIDs");

  const [rows] = await billingDb.query(
    "SELECT CAST(TarrifID AS UNSIGNED) AS id FROM tariff ORDER BY id ASC"
  );

  console.log(
    "📊 [getNextTariffId] Existing IDs:",
    rows.map(r => r.id)
  );

  let nextId = 1;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].id !== nextId) break;
    nextId++;
  }

  const finalId = String(nextId).padStart(8, "0");
  console.log("✅ [getNextTariffId] Generated:", finalId);

  return finalId;
}


bill.post(
  "/tariffs/upload",
  authenticate(),
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("🚀 Tariff upload started");

      if (!req.file) {
        console.log("❌ No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }

      const {
        PlanName: formPlanName,
        TrunkName: formTrunkName,
        Code: formCode,
        Destination: formDestination,
        status = "Active",
      } = req.body;

      console.log("📥 Form values:", {
        formPlanName,
        formTrunkName,
        formCode,
        formDestination,
        status,
      });

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);

      console.log(`📄 Total rows in Excel: ${data.length}`);

      let inserted = [];
      let skippedRows = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        console.log(`\n➡️ Processing row ${i + 1}`, row);

        const PlanName = row.PlanName || formPlanName;
        const TrunkName = row.TrunkName || formTrunkName;
        const Code = row.Code || formCode;
        const Destination = row.Destination || formDestination;

        console.log("🧾 Final names:", { PlanName, TrunkName });

        let {
          buyprice = 0,
          buyminimum = 1,
          buyincrement = 1,
          sellprice = 0,
          sellminimum = 1,
          sellincrement = 1,
        } = row;

        let currentTarrifID;
        try {
          currentTarrifID = await getNextTariffId();
        } catch (e) {
          console.log("❌ TarrifID generation failed:", e.message);
          skippedRows.push({
            rowNumber: i + 1,
            row,
            reason: e.message,
          });
          continue;
        }

        console.log("🆔 Using TarrifID:", currentTarrifID);

        let PlanID = null;
        if (PlanName) {
          const [planRow] = await billingDb.query(
            "SELECT PlanID FROM plans WHERE PlanName=? LIMIT 1",
            [PlanName]
          );

          console.log("📦 Plan query result:", planRow);

          if (planRow.length > 0) PlanID = planRow[0].PlanID;
        }

        let TrunkID = null;
        if (TrunkName) {
          const [trunkRow] = await billingDb.query(
            "SELECT id FROM trunk WHERE trunkname=? LIMIT 1",
            [TrunkName]
          );

          console.log("📦 Trunk query result:", trunkRow);

          if (trunkRow.length > 0) TrunkID = trunkRow[0].id;
        }

        if (!PlanID || !TrunkID) {
          console.log("⚠️ Dependency missing", { PlanID, TrunkID });
          skippedRows.push({
            rowNumber: i + 1,
            row,
            reason: "PlanID or TrunkID not found",
          });
          continue;
        }

        const [dup] = await billingDb.query(
          "SELECT id FROM tariff WHERE TarrifID = ? LIMIT 1",
          [currentTarrifID]
        );

        if (dup.length > 0) {
          console.log("⚠️ Duplicate TarrifID:", currentTarrifID);
          skippedRows.push({
            rowNumber: i + 1,
            row,
            reason: "Duplicate TarrifID detected",
          });
          continue;
        }

        console.log("🧨 Inserting tariff row...");

        const query = `
          INSERT INTO tariff
          (TarrifID, PlanID, PlanName, Code, Destination, TrunkID, TrunkName,
           buyprice, buyminimum, buyincrement,
           sellprice, sellminimum, sellincrement, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          currentTarrifID,
          PlanID,
          PlanName,
          Code || null,
          Destination || null,
          TrunkID,
          TrunkName,
          buyprice,
          buyminimum,
          buyincrement,
          sellprice,
          sellminimum,
          sellincrement,
          status,
        ];

        const [result] = await billingDb.query(query, values);

        console.log("✅ Inserted tariff ID:", result.insertId);

        inserted.push(result.insertId);
      }

      console.log(
        `🎯 Upload completed | Inserted: ${inserted.length} | Skipped: ${skippedRows.length}`
      );

      await logActivity({
        user: req.user.username,
        ip_address: req.ip,
        event_section: "TARIFF",
        event_type: "UPLOAD",
        record_id: inserted.join(","),
        event_code: "UPLOAD_TARIFF_EXCEL",
        event_sql: `BULK UPLOAD (${inserted.length} inserted, ${skippedRows.length} skipped)`,
        event_notes: `Tariff Excel uploaded`,
        user_group: req.user.role || "UNKNOWN",
      });

      res.status(201).json({
        message: "Bulk tariffs processed successfully",
        insertedCount: inserted.length,
        skippedRows,
      });
    } catch (err) {
      console.error("🔥 Bulk Tariff upload error:", err);
      res.status(500).json({ message: "Failed to upload tariffs" });
    }
  }
);



//-------------------------------------------------------------------------------------------

bill.get("/dids", authenticate(), async (req, res) => {
  try {
    const { username, role } = req.user;

    let query, params;

    if (role === "admin") {
      query = `
        SELECT 
          did.*,
          d.typeofcall,
          d.PSTN,
          d.SIPID,
          d.ivr_extension,
          d.ip_address,
          d.status AS dest_status
        FROM did
        LEFT JOIN diddestination d ON d.did_id = did.did
        ORDER BY did.id DESC
      `;
      params = [];
    } else if (role === "client") {
      query = `
        SELECT 
          did.*,
          d.typeofcall,
          d.PSTN,
          d.SIPID,
          d.ivr_extension,
          d.ip_address,
          d.status AS dest_status
        FROM did
        LEFT JOIN diddestination d ON d.did_id = did.did
        WHERE did.user_id = ?
        ORDER BY did.id DESC
      `;
      params = [username];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch DIDs:", err);
    res.status(500).json({ message: "Failed to fetch DIDs" });
  }
});

//-------------------------------------------------------------------------------------------

bill.post("/dids", authenticate(), async (req, res) => {
  try {
    const {
      did,
      reserved,
      user_id,
      trunk,
      monthlycost = 0,
      buyprice = 0,
      buyminimum = 0,
      buyincrement = 0,
      sellprice = 0,
      sellminimum = 0,
      sellincrement = 0,
      status,
      typeofcall,
      pstn,
      sipid,
      ivr_extension,
      ip_address,
    } = req.body;

    if (!did) {
      return res.status(400).json({ message: "DID is required" });
    }

    const validStatus = ["Active", "Inactive"];
    const didStatus = validStatus.includes(status) ? status : "Inactive";

    const [result] = await billingDb.query(
      `
      INSERT INTO did (
        did, reserved, user_id, trunk, monthlycost, buyprice, buyminimum,
        buyincrement, sellprice, sellminimum, sellincrement, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        did,
        reserved ? "yes" : "no",
        user_id,
        trunk,
        monthlycost,
        buyprice,
        buyminimum,
        buyincrement,
        sellprice,
        sellminimum,
        sellincrement,
        didStatus,
      ]
    );
    if (reserved) {
      await billingDb.query(
        `
        INSERT INTO diddestination (
          did_id, status, typeofcall, ivr_extension, PSTN, ip_address, SIPID
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          did,
          "Active",
          typeofcall || "PSTN",
          ivr_extension || null,
          typeofcall === "PSTN" ? pstn : null,
          ip_address || null,
          typeofcall === "SIPID" ? sipid : null,
        ]
      );
    }
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "DID",
      event_type: "ADD",
      record_id: result.insertId,
      event_code: "ADD_DID",
      event_sql: `
        INSERT INTO did (...) VALUES (${did}, ${reserved}, ${user_id}, ...);
      `,
      event_notes: `New DID Added: ${did}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json({ did, message: "DID added successfully" });
  } catch (err) {
    console.error("Failed to add DID:", err);
    res.status(500).json({ message: "Failed to add DID" });
  }
});

//-------------------------------------------------------------------------------------------

// bill.post("/dids", authenticate(), async (req, res) => {
//   try {
//     const {
//       did,
//       reserved,
//       user_id,
//       trunk,
//       monthlycost = 0,
//       buyprice = 0,
//       buyminimum = 0,
//       buyincrement = 0,
//       sellprice = 0,
//       sellminimum = 0,
//       sellincrement = 0,
//       status,
//       typeofcall,
//       pstn,
//       sipid,
//       ivr_extension,
//       ip_address,
//     } = req.body;

//     if (!did) {
//       return res.status(400).json({ message: "DID is required" });
//     }

//     const validStatus = ["Active", "Inactive"];
//     const didStatus = validStatus.includes(status) ? status : "Inactive";

//     // Insert into DID table
//     const [result] = await billingDb.query(
//       `
//       INSERT INTO did (
//         did, reserved, user_id, trunk, monthlycost, buyprice, buyminimum,
//         buyincrement, sellprice, sellminimum, sellincrement, status
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `,
//       [
//         did,
//         reserved ? "yes" : "no",
//         user_id,
//         trunk,
//         monthlycost,
//         buyprice,
//         buyminimum,
//         buyincrement,
//         sellprice,
//         sellminimum,
//         sellincrement,
//         didStatus,
//       ]
//     );

//     // Insert DID Destination only if reserved = yes
//     if (reserved) {
//       await billingDb.query(
//         `
//         INSERT INTO diddestination (
//           did_id, status, typeofcall, ivr_extension, PSTN, ip_address, SIPID
//         ) VALUES (?, ?, ?, ?, ?, ?, ?)
//       `,
//         [
//           did,
//           "Active",
//           typeofcall || "PSTN",
//           ivr_extension || null,
//           typeofcall === "PSTN" ? pstn : null,
//           ip_address || null,
//           typeofcall === "SIPID" ? sipid : null,
//         ]
//       );
//     }

//     // 🔥 Add Activity Log
//     await logActivity({
//       user: req.user.username,
//       ip_address: req.ip,
//       event_section: "DID",
//       event_type: "ADD",
//       record_id: result.insertId,
//       event_code: "ADD_DID",
//       event_sql: `
//         INSERT INTO did (...) VALUES (${did}, ${reserved}, ${user_id}, ...);
//       `,
//       event_notes: `New DID Added: ${did}`,
//       user_group: req.user.role || "UNKNOWN",
//     });

//     res.status(201).json({ did, message: "DID added successfully" });
//   } catch (err) {
//     console.error("Failed to add DID:", err);
//     res.status(500).json({ message: "Failed to add DID" });
//   }
// });

//-------------------------------------------------------------------------------------------

bill.put("/dids/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // Old data for log_activity comparison
    const [oldRows] = await billingDb.query("SELECT * FROM did WHERE id = ?", [
      id,
    ]);
    if (!oldRows.length) {
      return res.status(404).json({ message: "DID not found" });
    }

    const {
      did,
      reserved,
      user_id,
      trunk,
      monthlycost = 0,
      buyprice = 0,
      buyminimum = 0,
      buyincrement = 0,
      sellprice = 0,
      sellminimum = 0,
      sellincrement = 0,
      status,
      typeofcall,
      pstn,
      sipid,
      ivr_extension,
      ip_address,
    } = req.body;

    if (
      oldRows[0].reserved === "yes" &&
      req.body.did &&
      req.body.did !== oldRows[0].did
    ) {
      return res.status(400).json({
        message: "Reserved DID cannot be changed",
      });
    }

    // Update DID
    await billingDb.query(
      `
      UPDATE did
      SET did=?, reserved=?, user_id=?, trunk=?, monthlycost=?, buyprice=?,
          buyminimum=?, buyincrement=?, sellprice=?, sellminimum=?, sellincrement=?, status=?
      WHERE id=?
    `,
      [
        did,
        reserved ? "yes" : "no",
        reserved && user_id ? user_id : null,
        trunk,
        monthlycost,
        buyprice,
        buyminimum,
        buyincrement,
        sellprice,
        sellminimum,
        sellincrement,
        status || "Inactive",
        id,
      ]
    );

    // DID Destination Update
    if (reserved && user_id) {
      const [existing] = await billingDb.query(
        "SELECT * FROM diddestination WHERE did_id = ?",
        [did]
      );

      const payload = {
        status: "Active",
        typeofcall: typeofcall || "PSTN",
        ivr_extension: typeofcall === "IVR" ? ivr_extension : null,
        PSTN: typeofcall === "PSTN" ? pstn : null,
        ip_address: typeofcall === "IP" ? ip_address : null,
        SIPID: typeofcall === "SIPID" ? sipid : null,
      };

      if (existing.length > 0) {
        await billingDb.query(`UPDATE diddestination SET ? WHERE did_id = ?`, [
          payload,
          did,
        ]);
      } else {
        await billingDb.query(
          `
          INSERT INTO diddestination
          (did_id, status, typeofcall, ivr_extension, PSTN, ip_address, SIPID)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [
            did,
            payload.status,
            payload.typeofcall,
            payload.ivr_extension,
            payload.PSTN,
            payload.ip_address,
            payload.SIPID,
          ]
        );
      }
    } else {
      await billingDb.query(`DELETE FROM diddestination WHERE did_id = ?`, [
        did,
      ]);
    }

    // 🔥 Add Activity Log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "DID",
      event_type: "MODIFY",
      record_id: id,
      event_code: "MODIFY_DID",
      event_sql: `
        UPDATE did SET did='${did}', reserved='${reserved}', user_id='${user_id}' WHERE id=${id};
      `,
      event_notes: `DID Updated: ${oldRows[0].did} → ${did}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "DID updated successfully" });
  } catch (err) {
    console.error("Failed to update DID:", err);
    res.status(500).json({ message: "Failed to update DID" });
  }
});

//-------------------------------------------------------------------------------------------

bill.delete("/dids/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await billingDb.query("SELECT * FROM did WHERE id = ?", [
      id,
    ]);
    if (!rows.length) {
      return res.status(404).json({ message: "DID not found" });
    }

    const didNumber = rows[0].did;

    await billingDb.query("DELETE FROM diddestination WHERE did_id = ?", [id]);
    await billingDb.query("DELETE FROM did WHERE id = ?", [id]);

    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "DID",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_DID",
      event_sql: `DELETE FROM did WHERE id = ${id};`,
      event_notes: `DID Deleted: ${didNumber}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "DID deleted successfully" });
  } catch (err) {
    console.error("Failed to delete DID:", err);
    res.status(500).json({ message: "Failed to delete DID" });
  }
});



bill.put("/dids/bulkUpdate", authenticate(), async (req, res) => {
  console.log("🔵 BULK DID API HIT");
  console.log("URL 👉 /dids/bulkUpdate");
  console.log("User 👉", req.user?.username);
  console.log("IP 👉", req.ip);
  console.log("BODY 👉", JSON.stringify(req.body, null, 2));

  const conn = await billingDb.getConnection();

  try {
    const { ids, data } = req.body;

    console.log("IDs 👉", ids);
    console.log("DATA 👉", data);

    if (!Array.isArray(ids) || ids.length === 0) {
      console.warn("⚠️ IDs missing or empty");
      return res.status(400).json({ message: "DID ids are required" });
    }

    await conn.beginTransaction();
    console.log("🟢 Transaction started");

    for (const id of ids) {
      console.log("➡️ Processing DID ID 👉", id);

      const [rows] = await conn.query(
        "SELECT * FROM did WHERE id = ?",
        [id]
      );

      const oldDid = rows[0];

      console.log("Old DID 👉", oldDid);

      if (!oldDid) {
        console.warn("❌ DID not found for id:", id);
        continue;
      }

      // --------- Build UPDATE dynamically ----------
      const fields = [];
      const values = [];

      const allowedFields = [
        "reserved",
        "user_id",
        "trunk",
        "monthlycost",
        "buyprice",
        "buyminimum",
        "buyincrement",
        "sellprice",
        "sellminimum",
        "sellincrement",
        "status",
      ];

      for (const key of allowedFields) {
        if (key in data) {
          console.log(`Field detected 👉 ${key} =`, data[key]);

          if (key === "reserved") {
            fields.push("reserved = ?");
            values.push(data.reserved ? "yes" : "no");
          } else if (key === "user_id") {
            fields.push("user_id = ?");
            values.push(data.reserved ? data.user_id : null);
          } else {
            fields.push(`${key} = ?`);
            values.push(data[key]);
          }
        }
      }

      console.log("UPDATE fields 👉", fields);
      console.log("UPDATE values 👉", values);

      if (fields.length) {
        await conn.query(
          `UPDATE did SET ${fields.join(", ")} WHERE id = ?`,
          [...values, id]
        );
        console.log("✅ DID table updated for ID:", id);
      } else {
        console.log("ℹ️ No DID fields to update for ID:", id);
      }

      // --------- DID DESTINATION ----------
      if (data.reserved && data.user_id) {
        const payload = {
          status: "Active",
          typeofcall: data.typeofcall || "PSTN",
          ivr_extension:
            data.typeofcall === "IVR" ? data.ivr_extension : null,
          PSTN: data.typeofcall === "PSTN" ? data.pstn : null,
          ip_address: data.typeofcall === "IP" ? data.ip_address : null,
          SIPID: data.typeofcall === "SIPID" ? data.sipid : null,
        };

        console.log("Destination payload 👉", payload);

        const [exists] = await conn.query(
          "SELECT id FROM diddestination WHERE did_id = ?",
          [oldDid.did]
        );

        console.log("Destination exists 👉", exists.length);

        if (exists.length) {
          await conn.query(
            "UPDATE diddestination SET ? WHERE did_id = ?",
            [payload, oldDid.did]
          );
          console.log("✅ diddestination UPDATED");
        } else {
          await conn.query(
            `
            INSERT INTO diddestination
            (did_id, status, typeofcall, ivr_extension, PSTN, ip_address, SIPID)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
            [
              oldDid.did,
              payload.status,
              payload.typeofcall,
              payload.ivr_extension,
              payload.PSTN,
              payload.ip_address,
              payload.SIPID,
            ]
          );
          console.log("✅ diddestination INSERTED");
        }
      } else {
        console.log("ℹ️ Removing diddestination (unreserved)");
        await conn.query(
          "DELETE FROM diddestination WHERE did_id = ?",
          [oldDid.did]
        );
      }

      // --------- ACTIVITY LOG ----------
      await logActivity({
        user: req.user.username,
        ip_address: req.ip,
        event_section: "DID",
        event_type: "BULK_MODIFY",
        record_id: id,
        event_code: "BULK_UPDATE_DID",
        event_notes: `Bulk update DID: ${oldDid.did}`,
        user_group: req.user.role || "UNKNOWN",
      });

      console.log("📘 Activity logged for DID:", oldDid.did);
    }

    await conn.commit();
    console.log("🟢 Transaction committed");

    res.json({ message: "Bulk DID update successful", count: ids.length });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 Bulk DID update failed:", err);
    res.status(500).json({ message: "Bulk DID update failed" });
  } finally {
    conn.release();
    console.log("🔵 DB connection released");
  }
});



//-------------------------------------------------------------------------------------------

bill.post(
  "/dids/import",
  authenticate(),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const {
        user_id,
        trunk,
        reserved,
        status,
        typeofcall,
        pstn,
        sipid,
        ip_address,
        ivr_extension,
      } = req.body;

      // Read Excel
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      // Filter valid DID rows only
      const filteredRows = rows.filter((row) => {
        return row.did && String(row.did).trim() !== "";
      });

      if (!filteredRows.length) {
        return res
          .status(400)
          .json({ message: "Excel file has no valid DIDs" });
      }
      let importedCount = 0;

      for (const row of filteredRows) {
        const {
          did,
          monthlycost = 0,
          buyprice = 0,
          buyminimum = 0,
          buyincrement = 0,
          sellprice = 0,
          sellminimum = 0,
          sellincrement = 0,
        } = row;

        if (!did) continue;

        const didSql = `
          INSERT INTO did (
            did, reserved, user_id, trunk, monthlycost, buyprice,
            buyminimum, buyincrement, sellprice, sellminimum,
            sellincrement, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [didResult] = await billingDb.query(didSql, [
          did,
          reserved === "yes" ? "yes" : "no",
          user_id || null,
          trunk || null,
          monthlycost,
          buyprice,
          buyminimum,
          buyincrement,
          sellprice,
          sellminimum,
          sellincrement,
          status || "Inactive",
        ]);

        importedCount++;

        const insertedId = didResult.insertId;

        if (reserved === "yes" && typeofcall) {
          const destSql = `
            INSERT INTO diddestination (
              did_id, status, typeofcall, ivr_extension,
              PSTN, ip_address, SIPID
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          await billingDb.query(destSql, [
            did,
            "Active",
            typeofcall,
            typeofcall === "IVR" ? ivr_extension : null,
            typeofcall === "PSTN" ? pstn : null,
            typeofcall === "IP" ? ip_address : null,
            typeofcall === "SIPID" ? sipid : null,
          ]);
        }
      }

      // SUMMARY LOG
      await logActivity({
        user: req.user.username,
        ip_address: req.ip,
        event_section: "DID",
        event_type: "UPLOAD",
        event_code: "BULK_UPLOAD_DID",
        record_id: 0,
        event_sql: `Bulk DID Import - Total ${importedCount} records`,
        event_notes: `Bulk Import Completed – ${importedCount} DIDs imported.`,
        user_group: req.user.role || "UNKNOWN",
      });

      res.json({
        message: `Bulk DID import successful. Total imported: ${importedCount}`,
      });
    } catch (err) {
      console.error("Bulk DID upload failed:", err);
      res.status(500).json({
        message: "Failed to import DIDs",
        error: err.message,
      });
    }
  }
);

//----------------------------------------------------------------------------------------------

// Fetch all DIDDestinations
bill.get("/diddestinations", authenticate(), async (req, res) => {
  try {
    const { username, role } = req.user;

    let query, params;

    if (role === "admin") {
      query = `
        SELECT ddes.*
        FROM diddestination ddes
        ORDER BY ddes.id DESC
      `;
      params = [];
    } else if (role === "client") {
      query = `
        SELECT ddes.*
        FROM diddestination ddes
        JOIN did d ON ddes.did_id = d.did
        WHERE d.user_id = ?
        ORDER BY ddes.id DESC
      `;
      params = [username];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch DID Destinations:", err);
    res.status(500).json({ message: "Failed to fetch DID Destinations" });
  }
});
//----------------------------------------------------------------------------------------------

// DELETE /diddestination/:id
bill.delete("/diddestination/:id", authenticate(), async (req, res) => {
  const { id } = req.params;

  try {
    // 🔎 Get destination details before delete (for logging)
    const [destRows] = await billingDb.query(
      "SELECT id, did_id, typeofcall FROM diddestination WHERE id = ?",
      [id]
    );

    if (!destRows.length) {
      return res.status(404).json({ message: "DID Destination not found" });
    }

    const { did_id, typeofcall } = destRows[0];

    // ❌ Delete destination
    await billingDb.query("DELETE FROM diddestination WHERE id = ?", [id]);

    // 🔓 Free DID
    await billingDb.query("UPDATE did SET reserved = 'no' WHERE did = ?", [
      did_id,
    ]);

    // 🔥 ACTIVITY LOG
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "DID",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_DID_DESTINATION",
      event_sql: `DELETE FROM diddestination WHERE id = ${id}`,
      event_notes: `DID Destination removed for DID ${did_id} (${typeofcall})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({
      message: "DID Destination deleted and DID freed",
    });
  } catch (err) {
    console.error("Failed to delete DID Destination:", err);
    res.status(500).json({
      message: "Failed to delete DID Destination",
      error: err.message,
    });
  }
});

//----------------------------------------------------------------------------------------------

bill.get("/cdr", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user; // 🔥 client ID & role
    const { from, to, did, userid, status } = req.query;

    let filters = [];
    let values = [];

    if (from) {
      filters.push("Timestamp >= ?");
      values.push(from);
    }
    if (to) {
      filters.push("Timestamp <= ?");
      values.push(to);
    }
    if (did) {
      filters.push("did = ?");
      values.push(did);
    }
    if (userid) {
      filters.push("userid = ?");
      values.push(userid);
    }
    if (status) {
      filters.push("status = ?");
      values.push(status);
    }

    if (role === "client") {
      filters.push("userid = ?");
      values.push(username);
    }

    let sql = "SELECT * FROM cdr";
    if (filters.length) {
      sql += " WHERE " + filters.join(" AND ");
    }

    sql += " ORDER BY id DESC";

    const [rows] = await billingDb.query(sql, values);
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch CDR records:", err);
    res.status(500).json({ message: "Failed to fetch CDR records" });
  }
});

//----------------------------------------------------------------------------------------------

bill.get("/routes", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      "SELECT * FROM routes WHERE del_status IS NULL ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("🔴 Failed to fetch routes:", err);
    res.status(500).json({ message: "Failed to fetch routes" });
  }
});

//----------------------------------------------------------------------------------------------

bill.post("/routes", authenticate(), async (req, res) => {
  try {
    let { Routeid, routename } = req.body;

    if (!routename) {
      return res.status(400).json({ message: "Route Name is required" });
    }

    // 🔢 Auto-generate Routeid if not provided
    if (!Routeid) {
      Routeid = Math.floor(100000 + Math.random() * 900000).toString();

      let [existing] = await billingDb.query(
        "SELECT id FROM routes WHERE Routeid = ?",
        [Routeid]
      );

      while (existing.length > 0) {
        Routeid = Math.floor(100000 + Math.random() * 900000).toString();
        [existing] = await billingDb.query(
          "SELECT id FROM routes WHERE Routeid = ?",
          [Routeid]
        );
      }
    }

    const [result] = await billingDb.query(
      "INSERT INTO routes (Routeid, routename) VALUES (?, ?)",
      [Routeid, routename]
    );

    // 🔥 ACTIVITY LOG
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "ROUTES",
      event_type: "ADD",
      record_id: result.insertId,
      event_code: "ADD_ROUTE",
      event_sql: `INSERT INTO routes (Routeid, routename) VALUES ('${Routeid}', '${routename}')`,
      event_notes: `Route added (${routename})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json({
      id: result.insertId,
      Routeid,
      routename,
      del_status: null,
    });
  } catch (err) {
    console.error("Failed to add route:", err);
    res.status(500).json({ message: "Failed to add route" });
  }
});

//----------------------------------------------------------------------------------------------
bill.put("/routes/bulk-update", authenticate(), async (req, res) => {
  try {
    const { ids, routename } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No routes selected" });
    }

    if (!routename || !routename.trim()) {
      return res.status(400).json({ message: "Route name is required" });
    }

    // 🔎 Fetch old data (only for log notes)
    const [oldRows] = await billingDb.query(
      "SELECT id, routename FROM routes WHERE id IN (?)",
      [ids]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Routes not found" });
    }

    // ✅ BULK UPDATE
    await billingDb.query(
      "UPDATE routes SET routename = ? WHERE id IN (?)",
      [routename, ids]
    );

    // ✅ SINGLE ACTIVITY LOG
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "ROUTES",
      event_type: "MODIFY",
      record_id: ids.join(","), // bulk reference
      event_code: "BULK_UPDATE_ROUTE",
      event_sql: `
        UPDATE routes
        SET routename='${routename}'
        WHERE id IN (${ids.join(",")});
      `,
      event_notes: `Bulk updated ${ids.length} routes → New name: ${routename}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Routes updated successfully" });
  } catch (err) {
    console.error("Bulk update routes failed:", err);
    res.status(500).json({ message: "Bulk update failed" });
  }
});


//----------------------------------------------------------------------------------------------

bill.put("/routes/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { Routeid, routename } = req.body;

    if (!Routeid || !routename) {
      return res
        .status(400)
        .json({ message: "Routeid and routename are required" });
    }

    // 🔎 Fetch old data for logging
    const [oldRows] = await billingDb.query(
      "SELECT Routeid, routename FROM routes WHERE id = ?",
      [id]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Route not found" });
    }

    // ❌ Duplicate Routeid check
    const [exists] = await billingDb.query(
      "SELECT id FROM routes WHERE Routeid = ? AND id != ?",
      [Routeid, id]
    );

    if (exists.length) {
      return res.status(400).json({ message: "Routeid must be unique" });
    }

    await billingDb.query(
      "UPDATE routes SET Routeid = ?, routename = ? WHERE id = ?",
      [Routeid, routename, id]
    );

    // 🔥 ACTIVITY LOG
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "ROUTES",
      event_type: "MODIFY",
      record_id: id,
      event_code: "UPDATE_ROUTE",
      event_sql: `UPDATE routes SET Routeid='${Routeid}', routename='${routename}' WHERE id=${id}`,
      event_notes: `Route updated from (${oldRows[0].routename}) to (${routename})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Route updated successfully" });
  } catch (err) {
    console.error("Failed to update route:", err);
    res.status(500).json({ message: "Failed to update route" });
  }
});
//----------------------------------------------------------------------------------------------
bill.delete("/routes/bulk-delete", authenticate(), async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No routes selected" });
    }

    const [rows] = await billingDb.query(
      "SELECT id, routename FROM routes WHERE id IN (?)",
      [ids]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Routes not found" });
    }

    // ✅ BULK DELETE
    await billingDb.query(
      "DELETE FROM routes WHERE id IN (?)",
      [ids]
    );

    // ✅ SINGLE ACTIVITY LOG
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "ROUTES",
      event_type: "DELETE",
      record_id: ids.join(","), // bulk reference
      event_code: "BULK_DELETE_ROUTE",
      event_sql: `
        DELETE FROM routes
        WHERE id IN (${ids.join(",")});
      `,
      event_notes: `Bulk deleted ${ids.length} routes`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Routes deleted successfully" });
  } catch (err) {
    console.error("Bulk delete routes failed:", err);
    res.status(500).json({ message: "Bulk delete failed" });
  }
});


//------------------------------------------------------------------------------------------------------

// bill.delete("/routes/:id", authenticate(), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const [rows] = await billingDb.query(
//       "SELECT Routeid, routename FROM routes WHERE id = ?",
//       [id]
//     );

//     if (!rows.length) {
//       return res.status(404).json({ message: "Route not found" });
//     }

//     const { Routeid, routename } = rows[0];

//     await billingDb.query("DELETE FROM routes WHERE id = ?", [id]);
//     await logActivity({
//       user: req.user.username,
//       ip_address: req.ip,
//       event_section: "ROUTES",
//       event_type: "DELETE",
//       record_id: id,
//       event_code: "DELETE_ROUTE",
//       event_sql: `DELETE FROM routes WHERE id=${id}`,
//       event_notes: `Route deleted (${routename})`,
//       user_group: req.user.role || "UNKNOWN",
//     });

//     res.json({ message: "Route deleted successfully" });
//   } catch (err) {
//     console.error("Failed to delete route:", err);
//     res.status(500).json({ message: "Failed to delete route" });
//   }
// });

bill.delete("/routes/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Fetch the route
    const [rows] = await billingDb.query(
      "SELECT Routeid, routename FROM routes WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Route not found" });
    }

    const { Routeid, routename } = rows[0];

    // 2️⃣ Dependency check in trunk
    const [trunkRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM trunk WHERE routeid = ? AND del_status != 1",
      [Routeid]
    );

    if (trunkRows[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete route "${routename}" because ${trunkRows[0].count} trunk(s) are using it.`,
      });
    }

    // 3️⃣ Safe to delete
    await billingDb.query("DELETE FROM routes WHERE id = ?", [id]);

    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "ROUTES",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_ROUTE",
      event_sql: `DELETE FROM routes WHERE id=${id}`,
      event_notes: `Route deleted (${routename})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Route deleted successfully" });
  } catch (err) {
    console.error("Failed to delete route:", err);
    res.status(500).json({ message: "Failed to delete route" });
  }
});


//----------------------------------------------------------------------------------------------
// bill.get("/refills", authenticate(), async (req, res) => {
//   try {
//     const { role, username } = req.user;

//     let query, params;

//     if (role === "admin") {
//       query = `
//         SELECT * FROM refill
//         WHERE del_status = 0 OR del_status IS NULL
//         ORDER BY id DESC
//       `;
//       params = [];
//     } else if (role === "client") {
//       query = `
//         SELECT * FROM refill
//         WHERE (user = ?)
//           AND (del_status = 0 OR del_status IS NULL)
//         ORDER BY id DESC
//       `;
//       params = [username];
//     } else {
//       return res.status(403).json({ message: "Unauthorized role" });
//     }

//     const [rows] = await billingDb.query(query, params);
//     res.json(rows);
//   } catch (err) {
//     console.error("Failed to fetch refills:", err);
//     res.status(500).json({ message: "Failed to fetch refills" });
//   }
// });

bill.get("/refills", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;
    const { user, from, to } = req.query;

    let query = `
      SELECT * FROM refill
      WHERE (del_status = 0 OR del_status IS NULL)
    `;
    let params = [];

    if (role === "client") {
      query += " AND user = ?";
      params.push(username);
    }

    if (role === "admin" && user) {
      query += " AND user = ?";
      params.push(user);
    }

    if (from) {
      query += " AND DATE(date) >= ?";
      params.push(from);
    }

    if (to) {
      query += " AND DATE(date) <= ?";
      params.push(to);
    }

    query += " ORDER BY id DESC";

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch refills:", err);
    res.status(500).json({ message: "Failed to fetch refills" });
  }
});


//----------------------------------------------------------------------------------------------

// bill.post("/refills", authenticate(), async (req, res) => {
//   try {
//     const { user, credit, description, add_delete } = req.body;

//     const amount = Number(credit);

//     if (isNaN(amount) || amount <= 0) {
//       return res
//         .status(400)
//         .json({ message: "Credit must be a positive number." });
//     }

//     const [users] = await billingDb.query(
//       `SELECT id, Typeofaccount, balance, Creditlimit, email
//        FROM user 
//        WHERE username = ? AND (del_status = 0 OR del_status IS NULL)`,
//       [user]
//     );

//     if (!users.length)
//       return res.status(404).json({ message: "User not found" });

//     const account = users[0];

//     let updateColumn, newValue, oldValue;

//     if (account.Typeofaccount?.toLowerCase() === "prepaid") {
//       updateColumn = "balance";
//       oldValue = Number(account.balance);

//       newValue =
//         add_delete.toLowerCase() === "add"
//           ? oldValue + amount
//           : oldValue - amount;

//       if (newValue < 0) {
//         return res.status(400).json({
//           message: "Delete amount exceeds current balance.",
//         });
//       }
//     } else if (account.Typeofaccount?.toLowerCase() === "postpaid") {
//       updateColumn = "Creditlimit";
//       oldValue = Number(account.Creditlimit);

//       newValue =
//         add_delete.toLowerCase() === "add"
//           ? oldValue + amount
//           : oldValue - amount;

//       if (newValue < 0) {
//         return res.status(400).json({
//           message: "Delete amount exceeds current credit limit.",
//         });
//       }
//     } else {
//       return res.status(400).json({ message: "Invalid account type" });
//     }

//     const finalDescription = `${description} | Old ${updateColumn}: ${oldValue} | New ${updateColumn}: ${newValue}`;

//     const [result] = await billingDb.query(
//       `INSERT INTO refill (user, credit, description, add_delete, date, del_status) 
//        VALUES (?, ?, ?, ?, NOW(), 0)`,
//       [user, amount, finalDescription, add_delete]
//     );

//     await billingDb.query(
//       `UPDATE user SET ${updateColumn} = ? WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
//       [newValue, account.id]
//     );
//     await billingDb.query(
//       `UPDATE user SET ${updateColumn} = ? WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
//       [newValue, account.id]
//     );
//     await logActivity({
//       user: req.user.username,
//       ip_address: req.ip,
//       event_section: "REFILL",
//       event_type: add_delete.toUpperCase(),
//       record_id: result.insertId,
//       event_code: "REFILL_UPDATE",
//       event_sql: `
//         UPDATE user SET ${updateColumn} = ${newValue} WHERE id = ${account.id};
//         INSERT INTO refill (user, credit, description, add_delete)
//         VALUES ('${user}', ${amount}, '${finalDescription}', '${add_delete}');
//       `,
//       event_notes: finalDescription,
//       user_group: req.user.user_group || "UNKNOWN",
//     });
//     const emailHtml = `
// <div style="
//     max-width: 650px;
//     margin: auto;
//     background: #ffffff;
//     border-radius: 12px;
//     padding: 30px;
//     font-family: Arial, sans-serif;
//     border: 1px solid #e6e6e6;
//     box-shadow: 0 4px 12px rgba(0,0,0,0.08);
// ">
//   <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #eee;">
//     <img src="https://next2call.com/assets/img/logo/logo2.png" 
//          alt="Next2Call" 
//          style="width:150px; margin-bottom:10px;" />
//     <h2 style="color:#1a73e8; margin:0;">Credit Update Notification</h2>
//   </div>

//   <p style="font-size:16px; color:#333; margin-top:25px;">
//     Hello <strong>${user}</strong>,
//   </p>

//   <p style="font-size:15px; color:#555; line-height:1.6;">
//     Your account credit has been updated. Please review the details below.
//   </p>

//   <div style="
//       background:#f8f9ff;
//       padding:20px;
//       margin-top:20px;
//       border-radius:10px;
//       border-left:4px solid ${
//         add_delete.toLowerCase() === "add" ? "#28a745" : "#d9534f"
//       };
//   ">
//     <h3 style="margin:0 0 10px 0; color:#1a73e8;">Credit Update Details</h3>

//     <p style="margin:8px 0; font-size:15px; color:#333;">
//       <strong>Type:</strong> 
//       <span style="color:${
//         add_delete.toLowerCase() === "add" ? "#28a745" : "#d9534f"
//       }; 
//                    font-weight:bold;">
//         ${add_delete.toUpperCase()}
//       </span>
//     </p>

//     <p style="margin:8px 0; font-size:15px; color:#333;">
//       <strong>Amount:</strong> ${amount}
//     </p>

//     <p style="margin:8px 0; font-size:15px; color:#333;">
//       <strong>Old ${updateColumn}:</strong> ${oldValue}
//     </p>

//     <p style="margin:8px 0; font-size:15px; color:#333;">
//       <strong>New ${updateColumn}:</strong> ${newValue}
//     </p>

//     <p style="margin:8px 0; font-size:15px; color:#333;">
//       <strong>Description:</strong> ${description}
//     </p>
//   </div>

//   <p style="font-size:15px; color:#555; line-height:1.6; margin-top:25px;">
//     If you did not request this change, please contact our support team immediately.
//   </p>

//   <div style="text-align:center; margin-top:35px;">
//     <a href="https://next2call.com" 
//       style="
//         background:#1a73e8;
//         color:white;
//         padding:12px 25px;
//         text-decoration:none;
//         border-radius:8px;
//         font-size:15px;
//         display:inline-block;
//       ">Visit Dashboard</a>
//   </div>

//   <hr style="margin-top:40px; border:none; border-top:1px solid #eee;" />

//   <p style="font-size:13px; color:#999; text-align:center; margin-top:20px;">
//     © ${new Date().getFullYear()} Next2Call. All rights reserved.<br/>
//     This is an automated email — please do not reply.
//   </p>
// </div>
// `;
//     await sendEmail(
//       account.email,
//       `Credit ${add_delete === "Add" ? "Succesfully Added" : "Deleted"}`,
//       emailHtml
//     );

//     res.json({
//       id: result.insertId,
//       user,
//       credit: amount,
//       description: finalDescription,
//       add_delete,
//       date: new Date(),
//       del_status: 0,
//       updatedColumn: updateColumn,
//       oldValue,
//       updatedValue: newValue,
//       email_sent_to: account.email,
//     });
//   } catch (err) {
//     console.error("Failed to add refill:", err);
//     res.status(500).json({ message: "Failed to add refill" });
//   }
// });

bill.post("/refills", authenticate(), async (req, res) => {
  try {
    const { user, credit, description, add_delete } = req.body;

    // ✅ ONLY ADD: decimal precision fix
    const round6 = (num) => Number(Number(num).toFixed(6));
    const amount = round6(credit);

    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Credit must be a positive number." });
    }

    const [users] = await billingDb.query(
      `SELECT id, Typeofaccount, balance, Creditlimit, email
       FROM user 
       WHERE username = ? AND (del_status = 0 OR del_status IS NULL)`,
      [user]
    );

    if (!users.length)
      return res.status(404).json({ message: "User not found" });

    const account = users[0];

    let updateColumn, newValue, oldValue;

    if (account.Typeofaccount?.toLowerCase() === "prepaid") {
      updateColumn = "balance";
      oldValue = round6(account.balance);

      newValue =
        add_delete.toLowerCase() === "add"
          ? round6(oldValue + amount)
          : round6(oldValue - amount);

      if (newValue < 0) {
        return res.status(400).json({
          message: "Delete amount exceeds current balance.",
        });
      }
    } else if (account.Typeofaccount?.toLowerCase() === "postpaid") {
      updateColumn = "Creditlimit";
      oldValue = round6(account.Creditlimit);

      newValue =
        add_delete.toLowerCase() === "add"
          ? round6(oldValue + amount)
          : round6(oldValue - amount);

      if (newValue < 0) {
        return res.status(400).json({
          message: "Delete amount exceeds current credit limit.",
        });
      }
    } else {
      return res.status(400).json({ message: "Invalid account type" });
    }

    const finalDescription = `${description} | Old ${updateColumn}: ${oldValue} | New ${updateColumn}: ${newValue}`;

    const [result] = await billingDb.query(
      `INSERT INTO refill (user, credit, description, add_delete, date, del_status) 
       VALUES (?, ?, ?, ?, NOW(), 0)`,
      [user, amount, finalDescription, add_delete]
    );

    // ✅ ONLY KEEP ONE UPDATE (duplicate removed)
    await billingDb.query(
      `UPDATE user SET ${updateColumn} = ? WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
      [newValue, account.id]
    );
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "REFILL",
      event_type: add_delete.toUpperCase(),
      record_id: result.insertId,
      event_code: "REFILL_UPDATE",
      event_sql: `
        UPDATE user SET ${updateColumn} = ${newValue} WHERE id = ${account.id};
        INSERT INTO refill (user, credit, description, add_delete)
        VALUES ('${user}', ${amount}, '${finalDescription}', '${add_delete}');
      `,
      event_notes: finalDescription,
      user_group: req.user.user_group || "UNKNOWN",
    });
    const emailHtml = `
<div style="
    max-width: 650px;
    margin: auto;
    background: #ffffff;
    border-radius: 12px;
    padding: 30px;
    font-family: Arial, sans-serif;
    border: 1px solid #e6e6e6;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
">
  <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #eee;">
    <img src="https://next2call.com/assets/img/logo/logo2.png" 
         alt="Next2Call" 
         style="width:150px; margin-bottom:10px;" />
    <h2 style="color:#1a73e8; margin:0;">Credit Update Notification</h2>
  </div>

  <p style="font-size:16px; color:#333; margin-top:25px;">
    Hello <strong>${user}</strong>,
  </p>

  <p style="font-size:15px; color:#555; line-height:1.6;">
    Your account credit has been updated. Please review the details below.
  </p>

  <div style="
      background:#f8f9ff;
      padding:20px;
      margin-top:20px;
      border-radius:10px;
      border-left:4px solid ${add_delete.toLowerCase() === "add" ? "#28a745" : "#d9534f"
      };
  ">
    <h3 style="margin:0 0 10px 0; color:#1a73e8;">Credit Update Details</h3>

    <p style="margin:8px 0; font-size:15px; color:#333;">
      <strong>Type:</strong> 
      <span style="color:${add_delete.toLowerCase() === "add" ? "#28a745" : "#d9534f"
      }; 
                   font-weight:bold;">
        ${add_delete.toUpperCase()}
      </span>
    </p>

    <p style="margin:8px 0; font-size:15px; color:#333;">
      <strong>Amount:</strong> ${amount}
    </p>

    <p style="margin:8px 0; font-size:15px; color:#333;">
      <strong>Old ${updateColumn}:</strong> ${oldValue}
    </p>

    <p style="margin:8px 0; font-size:15px; color:#333;">
      <strong>New ${updateColumn}:</strong> ${newValue}
    </p>

    <p style="margin:8px 0; font-size:15px; color:#333;">
      <strong>Description:</strong> ${description}
    </p>
  </div>

  <p style="font-size:15px; color:#555; line-height:1.6; margin-top:25px;">
    If you did not request this change, please contact our support team immediately.
  </p>

  <div style="text-align:center; margin-top:35px;">
    <a href="https://next2call.com" 
      style="
        background:#1a73e8;
        color:white;
        padding:12px 25px;
        text-decoration:none;
        border-radius:8px;
        font-size:15px;
        display:inline-block;
      ">Visit Dashboard</a>
  </div>

  <hr style="margin-top:40px; border:none; border-top:1px solid #eee;" />

  <p style="font-size:13px; color:#999; text-align:center; margin-top:20px;">
    © ${new Date().getFullYear()} Next2Call. All rights reserved.<br/>
    This is an automated email — please do not reply.
  </p>
</div>
`;
    await sendEmail(
      account.email,
      `Credit ${add_delete === "Add" ? "Succesfully Added" : "Deleted"}`,
      emailHtml
    );

    res.json({
      id: result.insertId,
      user,
      credit: amount,
      description: finalDescription,
      add_delete,
      date: new Date(),
      del_status: 0,
      updatedColumn: updateColumn,
      oldValue,
      updatedValue: newValue,
      email_sent_to: account.email,
    });
  } catch (err) {
    console.error("Failed to add refill:", err);
    res.status(500).json({ message: "Failed to add refill" });
  }
});

//----------------------------------------------------------------------------------------------

// 📌 PUT: Edit refill by ID
bill.put("/refills/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { user, credit, description, add_delete } = req.body;
    const amount = Number(credit);

    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Credit must be a positive number." });
    }

    // Fetch user details
    const [users] = await billingDb.query(
      `SELECT id, Typeofaccount, balance, Creditlimit 
       FROM user 
       WHERE username = ? AND (del_status = 0 OR del_status IS NULL) `,
      [user]
    );

    if (!users.length)
      return res.status(404).json({ message: "User not found" });
    const account = users[0];

    // Determine update column
    let updateColumn, newValue, oldValue;
    if (account.Typeofaccount?.toLowerCase() === "prepaid") {
      updateColumn = "balance";
      oldValue = Number(account.balance);
      if (add_delete.toLowerCase() === "add") {
        newValue = oldValue + amount;
      } else {
        if (amount > oldValue) {
          return res
            .status(400)
            .json({ message: "Delete amount exceeds current balance." });
        }
        newValue = oldValue - amount;
      }
    } else if (account.Typeofaccount?.toLowerCase() === "postpaid") {
      updateColumn = "Creditlimit";
      oldValue = Number(account.Creditlimit);
      if (add_delete.toLowerCase() === "add") {
        newValue = oldValue + amount;
      } else {
        if (amount > oldValue) {
          return res
            .status(400)
            .json({ message: "Delete amount exceeds current credit limit." });
        }
        newValue = oldValue - amount;
      }
    } else {
      return res.status(400).json({ message: "Invalid account type" });
    }

    // Final description with old value
    const finalDescription = `${description} | Old ${updateColumn}: ${oldValue}`;

    // Update refill row
    const [result] = await billingDb.query(
      `UPDATE refill 
       SET user=?, credit=?, description=?, add_delete=? 
       WHERE id=? AND (del_status = 0 OR del_status IS NULL)`,
      [user, amount, finalDescription, add_delete, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Refill not found or deleted" });
    }

    await billingDb.query(
      `UPDATE user SET ${updateColumn} = ? 
       WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
      [newValue, account.id]
    );

    res.json({
      id,
      user,
      credit: amount,
      description: finalDescription,
      add_delete,
      updatedColumn: updateColumn,
      oldValue,
      updatedValue: newValue,
    });
  } catch (err) {
    console.error("❌ Failed to update refill:", err);
    res.status(500).json({ message: "Failed to update refill" });
  }
});

//------------------------------------------------------------------------------------

bill.delete("/refills/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    // First fetch the old refill details for logging
    const [refillData] = await billingDb.query(
      "SELECT * FROM refill WHERE id = ? AND (del_status = 0 OR del_status IS NULL)",
      [id]
    );

    if (!refillData.length) {
      return res.status(404).json({
        message: "Refill not found or already deleted",
      });
    }

    const oldRefill = refillData[0];

    // Delete (soft delete)
    const [result] = await billingDb.query(
      "UPDATE refill SET del_status = 1 WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Refill not found or already deleted",
      });
    }

    // 🔥🔥🔥 LOG ACTIVITY ENTRY 🔥🔥🔥
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "REFILL",
      event_type: "DELETE",
      record_id: id,
      event_code: "REFILL_DELETE",
      event_sql: `UPDATE refill SET del_status = 1 WHERE id = ${id};`,
      event_notes: `Deleted refill of ${oldRefill.credit} for user ${oldRefill.user}`,
      user_group: req.user.user_group || "UNKNOWN",
    });

    res.json({ message: "Refill deleted successfully" });
  } catch (err) {
    console.error("❌ Failed to delete refill:", err);
    res.status(500).json({ message: "Failed to delete refill" });
  }
});

//------------------------------------------------------------------------------------

bill.get("/trunks", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      `SELECT id, routeid, trunkname, type, username, password, host, addprefix, codec, status, port
       FROM trunk
       WHERE del_status = 0 OR del_status IS NULL
        ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    Route;
    console.error("Failed to fetch trunks:", err);
    res.status(500).json({ message: "Failed to fetch trunks" });
  }
});
//--------------------------------------------------------------------------------

bill.get("/trunks/check-name/:name", authenticate(), async (req, res) => {
  try {
    const { name } = req.params;
    const excludeId = req.query.excludeId;

    let sql = "SELECT id FROM trunk WHERE trunkname = ? AND del_status != 1";
    const params = [name];

    if (excludeId) {
      sql += " AND id != ?";
      params.push(excludeId);
    }

    const [rows] = await billingDb.query(sql, params);

    if (rows.length > 0) {
      res.json({ exists: true, id: rows[0].id });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error("Failed to check trunk name:", err);
    res.status(500).json({ message: "Failed to check trunk name" });
  }
});

//--------------------------------------------------------------------------------

bill.get(
  "/trunks/check-username/:username",
  authenticate(),
  async (req, res) => {
    try {
      const { username } = req.params;
      const { excludeId } = req.query;

      let query = `SELECT id FROM trunk WHERE username = ? AND del_status != 1`;
      let params = [username];

      if (excludeId) {
        query += " AND id != ?";
        params.push(excludeId);
      }

      const [rows] = await billingDb.query(query, params);

      res.json({ exists: rows.length > 0 });
    } catch (err) {
      console.error("USERNAME check failed:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

//--------------------------------------------------------------------------------

bill.get("/trunks/check-host-prefix", async (req, res) => {
  const { host, addprefix, excludeId = 0 } = req.query;

  try {
    let query = `SELECT * FROM trunk WHERE host = ? AND del_status != 1 AND id != ?`;
    const params = [host, excludeId];

    const [rows] = await billingDb.query(query, params);

    if (rows.length > 0) {
      let conflictMsg = "";

      // Check if any row has the same prefix
      if (!addprefix || addprefix === "") {
        // Host exists with blank prefix
        const hostOnly = rows.find((r) => !r.addprefix || r.addprefix === "");
        if (hostOnly) conflictMsg = "❌ Same Host not allowed!";
      } else {
        // Host exists with same prefix
        const samePrefix = rows.find((r) => r.addprefix === addprefix);
        if (samePrefix) conflictMsg = "❌ Same Host + Same Prefix not allowed!";
      }

      return res.json({ exists: !!conflictMsg, message: conflictMsg });
    }

    res.json({ exists: false });
  } catch (err) {
    console.error("Error checking host + prefix:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//--------------------------------------------------------------------------------

bill.post("/trunks", authenticate(), async (req, res) => {
  try {
    const {
      routeid,
      trunkname,
      type,
      username,
      password,
      host,
      addprefix,
      codec,
      status,
      port,
    } = req.body;

    const safeCodec = Array.isArray(codec) ? codec.join(",") : codec;

    const [result] = await billingDb.query(
      `INSERT INTO trunk 
      (routeid, trunkname, type, username, password, host, addprefix, codec, status, port, del_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        routeid,
        trunkname,
        type,
        username,
        password,
        host,
        addprefix,
        safeCodec,
        status,
        port,
      ]
    );

    const trunkId = result.insertId;

    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TRUNK",
      event_type: "ADD",
      record_id: trunkId,
      event_code: "ADD_TRUNK",
      event_sql: `INSERT INTO trunk (trunkname, host, routeid) VALUES ('${trunkname}', '${host}', '${routeid}')`,
      event_notes: `Trunk added (${trunkname})`,
      user_group: req.user.role || "UNKNOWN",
    });

    /* ---------------- Asterisk Config ---------------- */
    const fs = require("fs");
    const confFile = "/etc/asterisk/billingtrunk.conf";

    let confEntry = `
[${trunkname}]
type=endpoint
context=incomingbilling
disallow=all
allow=${safeCodec}
aors=${trunkname}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
`;

    if (type === "User") {
      confEntry += `
[${trunkname}-auth]
type=auth
auth_type=userpass
username=${username}
password=${password}
`;
    }

    confEntry += `
[${trunkname}-aor]
type=aor
max_contacts=1
contact=sip:${host}
qualify_frequency=60
`;

    confEntry += `
[${trunkname}-identify]
type=identify
endpoint=${trunkname}
match=${host}
`;

    fs.appendFileSync(confFile, confEntry);

    await billingDb.query(
      `UPDATE reload_status SET status=1, last_updated=NOW() WHERE reload_type='pjsip_reload'`
    );

    res.status(201).json({ id: trunkId, ...req.body });
  } catch (err) {
    console.error("Failed to add trunk:", err);
    res.status(500).json({ message: "Failed to add trunk" });
  }
});

//--------------------------------------------------------------------------------

bill.put("/trunks/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      routeid,
      trunkname,
      type,
      username,
      password,
      host,
      addprefix,
      codec,
      status,
      port,
    } = req.body;

    // 🔍 Check existing trunk
    const [existingRows] = await billingDb.query(
      `SELECT * FROM trunk WHERE id=? AND del_status != 1`,
      [id]
    );

    if (existingRows.length === 0) {
      return res
        .status(404)
        .json({ message: "Trunk not found or already deleted" });
    }

    const oldTrunk = existingRows[0];
    const safeCodec = Array.isArray(codec) ? codec.join(",") : codec;

    // ✅ Update DB
    await billingDb.query(
      `UPDATE trunk 
       SET routeid=?, type=?, username=?, password=?, host=?, 
           addprefix=?, codec=?, status=?, port=? 
       WHERE id=? AND del_status != 1`,
      [
        routeid,
        type,
        username,
        password,
        host,
        addprefix,
        safeCodec,
        status,
        port,
        id,
      ]
    );

    // 🔥 LOG ACTIVITY (UPDATE)
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TRUNK",
      event_type: "MODIFY",
      record_id: id,
      event_code: "UPDATE_TRUNK",
      event_sql: `UPDATE trunk SET trunkname='${trunkname}', host='${host}' WHERE id=${id}`,
      event_notes: `Trunk updated (${oldTrunk.trunkname} → ${trunkname})`,
      user_group: req.user.role || "UNKNOWN",
    });

    // ---------------- ASTERISK CONFIG UPDATE ----------------
    const fs = require("fs");
    const confFile = "/etc/asterisk/billingtrunk.conf";
    let confData = fs.readFileSync(confFile, "utf-8");

    const removeOldTrunkBlocks = (data, trunk) => {
      const patterns = [
        `${trunk}`,
        `${trunk}-auth`,
        `${trunk}-aor`,
        `${trunk}-identify`,
      ];
      patterns.forEach((pat) => {
        const regex = new RegExp(`\\[${pat}\\][\\s\\S]*?(?=\\n\\[|$)`, "gi");
        data = data.replace(regex, "");
      });
      return data;
    };

    confData = removeOldTrunkBlocks(confData, oldTrunk.trunkname);

    // 🔄 New trunk config
    let confEntry = `
[${trunkname}]
type=endpoint
context=incomingbilling
disallow=all
allow=${safeCodec}
aors=${trunkname}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
 `;

    if (type === "User") {
      confEntry += `
[${trunkname}-auth]
type=auth
auth_type=userpass
username=${username}
password=${password}
`;
    }

    confEntry += `
[${trunkname}-aor]
type=aor
max_contacts=1
contact=sip:${host}
qualify_frequency=60
`;

    confEntry += `
[${trunkname}-identify]
type=identify
endpoint=${trunkname}
match=${host}
`;

    fs.writeFileSync(confFile, confData + confEntry);

    // 🔄 Reload flag
    await billingDb.query(
      `UPDATE reload_status 
       SET status=1, last_updated=NOW() 
       WHERE reload_type='pjsip_reload'`
    );

    // ✅ Return updated row
    const [updatedRows] = await billingDb.query(
      `SELECT * FROM trunk WHERE id=?`,
      [id]
    );

    res.json(updatedRows[0]);
  } catch (err) {
    console.error("Failed to update trunk:", err);
    res.status(500).json({ message: "Failed to update trunk" });
  }
});

//--------------------------------------------------------------------------------

bill.delete("/trunks/:id", authenticate(), async (req, res) => {
  const fs = require("fs");
  const confFile = "/etc/asterisk/billingtrunk.conf";

  try {
    const { id } = req.params;

    // 1️⃣ Trunk exists check
    const [rows] = await billingDb.query(
      "SELECT * FROM trunk WHERE id = ? AND del_status != 1",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Trunk not found" });
    }

    const trunk = rows[0];

    // 2️⃣ DEPENDENCY CHECK → tariff
    const [tariffRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM tariff WHERE TrunkID = ?",
      [trunk.id]   // or trunk.TrunkID if different
    );

    if (tariffRows[0].count > 0) {
      return res.status(400).json({
        message: `Cannot delete trunk "${trunk.trunkname}" because it is assigned to ${tariffRows[0].count} tariff(s). Remove tariff dependency first.`,
      });
    }

    // 3️⃣ Safe delete (soft flag as per your system)
    await billingDb.query(
      "UPDATE trunk SET del_status = 1 WHERE id = ?",
      [id]
    );

    // 4️⃣ Activity log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TRUNK",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_TRUNK",
      event_sql: `UPDATE trunk SET del_status=1 WHERE id=${id}`,
      event_notes: `Trunk deleted (${trunk.trunkname})`,
      user_group: req.user.role || "UNKNOWN",
    });

    // 5️⃣ Remove from Asterisk config
    let confData = fs.readFileSync(confFile, "utf-8");
    const rgx = new RegExp(
      `\\[${trunk.trunkname}(-auth|-aor|-identify)?\\][\\s\\S]*?(?=\\n\\[|$)`,
      "gi"
    );
    confData = confData.replace(rgx, "");
    fs.writeFileSync(confFile, confData);

    await billingDb.query(
      `UPDATE reload_status SET status=1, last_updated=NOW() WHERE reload_type='pjsip_reload'`
    );

    res.json({ message: "Trunk deleted successfully" });
  } catch (err) {
    console.error("Failed to delete trunk:", err);
    res.status(500).json({ message: "Failed to delete trunk" });
  }
});


//--------------------------------------------------------------------------------

bill.get("/dashboard/stats", authenticate(), async (req, res) => {
  try {
    const [activeUsersRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM `user` WHERE LOWER(`status`) = 'active' AND (`del_status` = 0 OR `del_status` IS NULL) AND `group` = 1"
    );
    const [liveCallsRows] = await billingDb.query(
      "SELECT COUNT(*) as count FROM onlinecalls"
    );
    const [totalCallsRows] = await billingDb.query(`
SELECT SUM(total_calls) as count
FROM daywise_calls
WHERE DATE(timestamp) = CURDATE();

    `);

    const [monthlyRechargeRows] = await billingDb.query(`
      SELECT IFNULL(SUM(credit),0) as total 
      FROM refill 
      WHERE (del_status = 0 OR del_status IS NULL) 
        AND LOWER(add_delete) = 'add'
        AND MONTH(date) = MONTH(CURDATE()) 
        AND YEAR(date) = YEAR(CURDATE())
    `);

    // Send JSON response
    res.json({
      activeUsers: activeUsersRows[0]?.count || 0,
      liveCalls: liveCallsRows[0]?.count || 0,
      totalCalls: totalCallsRows[0]?.count || 0,
      monthlyRecharge: monthlyRechargeRows[0]?.total || 0,
    });
  } catch (err) {
    console.error("🔴 Dashboard stats fetch error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});
//---------------------------------------------------------------------------------------------

bill.get("/dashboard/revenue", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;
    const filter = req.query.filter || "month";

    const field = role === "admin" ? "margin" : "sellcost";

    let query = "";
    let params = [];

    // ---------------- MONTHLY ----------------
    if (filter === "month") {
      query = `
        SELECT 
          month,
          SUM(${field}) AS profit
        FROM months_report
        ${role === "client" ? "WHERE username = ?" : ""}
        GROUP BY month
        ORDER BY month ASC
      `;
      if (role === "client") params.push(username);
    }

    // ---------------- WEEKLY ----------------
    else if (filter === "week") {
      query = `
        SELECT 
          DATE(timestamp) AS day,
          SUM(${field}) AS profit
        FROM daywise_calls
        WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ${role === "client" ? "AND username = ?" : ""}
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp) ASC
      `;
      if (role === "client") params.push(username);
    }

    // ---------------- DAILY ----------------
    else if (filter === "day") {
      query = `
        SELECT 
          DATE(timestamp) AS day,
          SUM(${field}) AS profit
        FROM daywise_calls
        WHERE DATE(timestamp) = CURDATE()
        ${role === "client" ? "AND username = ?" : ""}
        GROUP BY DATE(timestamp)
      `;
      if (role === "client") params.push(username);
    } else {
      return res.status(400).json({ message: "Invalid filter" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Revenue fetch error:", err);
    res.status(500).json({ message: "Failed to fetch revenue data" });
  }
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/asr-acr", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;
    const filter = req.query.filter || "month";

    let query = "";
    let params = [];

    // ---------------- MONTH ----------------
    if (filter === "month") {
      query = `
        SELECT 
          month AS label,
          ASR,
          ACR
        FROM months_report
        ${role === "client" ? "WHERE username = ?" : ""}
        ORDER BY month ASC
      `;
      if (role === "client") params.push(username);
    }

    // ---------------- WEEK ----------------
    else if (filter === "week") {
      query = `
        SELECT 
          DATE(timestamp) AS label,
          ASR,
          ACR
        FROM daywise_calls
        WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ${role === "client" ? "AND username = ?" : ""}
        ORDER BY DATE(timestamp) ASC
      `;
      if (role === "client") params.push(username);
    }

    // ---------------- DAY ----------------
    else if (filter === "day") {
      query = `
        SELECT 
          DATE(timestamp) AS label,
          ASR,
          ACR
        FROM daywise_calls
        WHERE DATE(timestamp) = CURDATE()
        ${role === "client" ? "AND username = ?" : ""}
      `;
      if (role === "client") params.push(username);
    } else {
      return res.status(400).json({ message: "Invalid filter" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("ASR/ACR fetch error:", err);
    res.status(500).json({ message: "Failed to fetch ASR/ACR data" });
  }
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/call-distribution", authenticate(), async (req, res) => {
  const { filter = "month" } = req.query;
  const { role, username } = req.user;

  let query = "";
  let params = [];

  if (filter === "month") {
    query = `
      SELECT month AS label, inbound_calls, outbound_calls, missed_call
      FROM months_report
      ${role === "client" ? "WHERE username = ?" : ""}
    `;
    if (role === "client") params.push(username);
  }

  if (filter === "week") {
    query = `
      SELECT DATE(timestamp) AS label, inbound_calls, outbound_calls, missed_call
      FROM daywise_calls
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ${role === "client" ? "AND username = ?" : ""}
    `;
    if (role === "client") params.push(username);
  }

  if (filter === "day") {
    query = `
      SELECT HOUR(timestamp) AS label, inbound_calls, outbound_calls, missed_call
      FROM daywise_calls
      WHERE DATE(timestamp) = CURDATE()
      ${role === "client" ? "AND username = ?" : ""}
    `;
    if (role === "client") params.push(username);
  }

  const [rows] = await billingDb.query(query, params);
  res.json(rows);
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/profit", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT 
        DATE_FORMAT(STR_TO_DATE(CONCAT(month,'-01'), '%Y-%m-%d'), '%b') AS month,
        IFNULL(SUM(sellcost), 0) AS totalRevenue
      FROM months_report
      WHERE month IS NOT NULL AND month != ''
      GROUP BY month
      ORDER BY MIN(updated_at)
    `);

    res.json(rows);
  } catch (err) {
    console.error("🔴 Profit fetch error:", err);
    res.status(500).json({ message: "Failed to fetch profit data" });
  }
});
//---------------------------------------------------------------------------------------------
bill.get("/dashboard/top-callers", authenticate(), async (req, res) => {
  try {
    const { type, date } = req.query;

    let query = "";
    let values = [];

    if (type === "day") {
      query = `
        SELECT username, SUM(total_calls) AS totalCalls
        FROM daywise_calls
        WHERE DATE(timestamp) = ?
        GROUP BY username
        ORDER BY totalCalls DESC
        LIMIT 5
      `;
      values.push(date || new Date().toISOString().slice(0, 10));
    } else {
      query = `
        SELECT username, SUM(total_calls) AS totalCalls
        FROM months_report
        WHERE month = ?
        GROUP BY username
        ORDER BY totalCalls DESC
        LIMIT 5
      `;
      values.push(date || new Date().toISOString().slice(0, 7)); // default current month YYYY-MM
    }

    const [rows] = await billingDb.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error("🔴 Top callers fetch error:", err);
    res.status(500).json({ message: "Failed to fetch top callers" });
  }
});
//---------------------------------------------------------------------------------------------


bill.get("/dashboard/top-trunks", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT 
        trunk, 
        SUM(connected_calls) AS connected_calls
      FROM trunks_performance
      GROUP BY trunk
      ORDER BY connected_calls DESC
      LIMIT 5
    `);

    const total = rows.reduce(
      (sum, r) => sum + Number(r.connected_calls || 0),
      0
    );

    const result = rows.map((r) => ({
      name: r.trunk, // for Pie labels
      value: Number(r.connected_calls || 0), // ensure numeric
      percent:
        total > 0
          ? ((Number(r.connected_calls || 0) / total) * 100).toFixed(2)
          : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("🔴 Fetch top trunks error:", err);
    res.status(500).json({ message: "Failed to fetch top trunks" });
  }
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/top-destinations", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT 
        code,
        SUM(connected_calls) AS connected_calls
      FROM trunks_performance
      GROUP BY code
    `);

    const countryTotals = {};
    const countryCodes = {};

    for (const row of rows) {
      const country = getCountryFromCode(row.code);
      const calls = Number(row.connected_calls || 0);

      if (!countryTotals[country]) {
        countryTotals[country] = 0;
        countryCodes[country] = row.code;
      }

      countryTotals[country] += calls;
    }

    const sorted = Object.entries(countryTotals)
      .map(([name, value]) => ({
        name,
        value,
        code: countryCodes[name],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const total = sorted.reduce((sum, r) => sum + r.value, 0);

    const finalData = sorted.map((r) => ({
      ...r,
      percent: total > 0 ? ((r.value / total) * 100).toFixed(2) : 0,
    }));

    res.json(finalData);
  } catch (err) {
    console.error("🔴 Error fetching top destinations:", err);
    res.status(500).json({ message: "Failed to fetch top destinations" });
  }
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/top-trunkcalls", authenticate(), async (req, res) => {
  try {
    const { code } = req.query;

    const [rows] = await billingDb.query(`
      SELECT trunk, connected_calls 
      FROM trunks_performance
      WHERE code LIKE '${code}%'
      ORDER BY connected_calls DESC
      LIMIT 5
    `);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching trunks:", err);
    res.status(500).json({ message: "Failed to fetch top trunks" });
  }
});
//-------------------------------------------------------------------------------------
bill.get("/dashboard/concurrent-calls", authenticate(), async (req, res) => {
  try {
    const [result] = await billingDb.query(`
      SELECT DATE_FORMAT(date, '%a') AS day, maxcalls 
      FROM con_calls 
      WHERE DATE(date) >= CURDATE() - INTERVAL 7 DAY 
      ORDER BY date ASC
    `);

    res.json(result);
  } catch (error) {
    console.error("Error fetching concurrent calls:", error);
    res.status(500).json({ error: "Failed to fetch concurrent calls data" });
  }
});

//---------------------------------------------------------------------------------------------

bill.get("/dashboard/client/stats", authenticate(), async (req, res) => {
  try {
    const { username } = req.user;
    const [activeUsersRows] = await billingDb.query(
      `
      SELECT COUNT(*) AS count 
      FROM sipaccount
      WHERE (del_status = 0 OR del_status IS NULL) 
        AND accountcode = ?
      `,
      [username]
    );

    const [liveCallsRows] = await billingDb.query(
      `
      SELECT COUNT(*) AS count 
      FROM onlinecalls
      WHERE user = ?
      `,
      [username]
    );
    const [totalCallsRows] = await billingDb.query(
      `
      SELECT SUM(total_calls) AS count
      FROM daywise_calls
      WHERE username = ?
        AND DATE(timestamp) = CURDATE()
      `,
      [username]
    );
    const [monthlyRechargeRows] = await billingDb.query(
      `
      SELECT IFNULL(SUM(credit), 0) AS total
      FROM refill
      WHERE (del_status = 0 OR del_status IS NULL)
        AND LOWER(add_delete) = 'add'
        AND user = ?  
        AND MONTH(date) = MONTH(CURDATE())
        AND YEAR(date) = YEAR(CURDATE())
      `,
      [req.user.username]
    );

    res.json({
      sipUsers: activeUsersRows[0]?.count || 0,
      liveCalls: liveCallsRows[0]?.count || 0,
      totalCalls: totalCallsRows[0]?.count || 0,
      monthlyRecharge: monthlyRechargeRows[0]?.total || 0,
    });
  } catch (err) {
    console.error("🔴 Client dashboard stats fetch error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

//--------------------------------------------------------------------------------------------

bill.get("/profile", authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await billingDb.query(
      "SELECT * FROM user WHERE id = ? AND (del_status IS NULL OR del_status != 1)",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("🔴 Profile fetch error:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.put("/profile", authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body;

    // Check if user exists
    const [existingUser] = await billingDb.query(
      "SELECT id FROM user WHERE id = ? AND (del_status IS NULL OR del_status != 1)",
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const allowedFields = [
      "username",
      "firstname",
      "lastname",
      "email",
      "phoneno",
      "mobileno",
      "country",
      "state",
      "city",
      "address",
      "pincode",
      "companyname",
      "planid",
      "planname",
      "status",
      "Typeofaccount",
      "Recordcall",
      "Creditlimit",
      "balance",
    ];

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        // ❗ ignore fields not sent
        updateFields.push(`${field} = ?`);
        updateValues.push(data[field]);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    updateValues.push(userId);

    const query = `
      UPDATE user 
      SET ${updateFields.join(", ")} 
      WHERE id = ?
    `;

    await billingDb.query(query, updateValues);

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("🔴 Profile update error:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.get("/daywise-calls", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;
    const { user, from, to } = req.query;

    let filters = [];
    let values = [];

    if (role === "admin") {
      if (user) {
        filters.push("username = ?");
        values.push(user);
      }
    } else if (role === "client") {
      filters.push("username = ?");
      values.push(username);
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    if (from) {
      filters.push("DATE(timestamp) >= ?");
      values.push(from);
    }

    if (to) {
      filters.push("DATE(timestamp) <= ?");
      values.push(to);
    }

    let query = `
      SELECT id, username, total_calls, inbound_calls, outbound_calls, missed_call, ASR , ACR,
             answercall, cancelcall, othercalls, buycost, sellcost, margin, timestamp
      FROM daywise_calls
    `;

    if (filters.length) {
      query += " WHERE " + filters.join(" AND ");
    }

    query += " ORDER BY id DESC";

    const [rows] = await billingDb.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching daywise calls:", err);
    res.status(500).json({ message: "Failed to fetch daywise call data" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.get("/monthwise-calls", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;
    const { user, from, to, did } = req.query;

    let query = `
      SELECT 
        m.id, m.username, m.month, m.total_calls, m.inbound_calls, m.outbound_calls,
        m.missed_call, m.answercall, m.cancelcall, m.othercalls,
        m.buycost, m.sellcost, m.margin, m.updated_at, m.ASR , m.ACR
      FROM months_report AS m
    `;

    let filters = [];
    let values = [];

    if (did) {
      query += `
        INNER JOIN did AS d ON m.username = d.user_id
      `;
      filters.push("d.did = ?");
      values.push(did);
    }

    if (role === "admin") {
      if (user) {
        filters.push("m.username = ?");
        values.push(user);
      }
    } else if (role === "client") {
      filters.push("m.username = ?");
      values.push(username);
    } else {
      return res.status(403).json({ message: "Unauthorized Role" });
    }

    if (from) {
      filters.push("DATE_FORMAT(m.updated_at, '%Y-%m') >= ?");
      values.push(from);
    }

    if (to) {
      filters.push("DATE_FORMAT(m.updated_at, '%Y-%m') <= ?");
      values.push(to);
    }

    if (filters.length) {
      query += " WHERE " + filters.join(" AND ");
    }

    query += " ORDER BY m.id DESC";

    const [rows] = await billingDb.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching monthwise data:", err);
    res.status(500).json({ message: "Failed to fetch monthwise data" });
  }
});

//------------------------------------------------------------------------------------------------------

// bill.get("/trunk-summary", authenticate(), async (req, res) => {
//   try {
//     const { trunk, from, to } = req.query;

//     let query = `
//       SELECT id, trunk_id, trunk, code, other_call, connected_calls, timestamp, ASR, ACR
//       FROM trunks_performance
//     `;
//     const filters = [];
//     const values = [];

//     if (trunk) {
//       filters.push("trunk = ?");
//       values.push(trunk);
//     }

//     if (from) {
//       filters.push("DATE(timestamp) >= ?");
//       values.push(from);
//     }

//     if (to) {
//       filters.push("DATE(timestamp) <= ?");
//       values.push(to);
//     }

//     if (filters.length) {
//       query += " WHERE " + filters.join(" AND ");
//     }

//     query += " ORDER BY id DESC";
//     const [rows] = await billingDb.query(query, values);
//     res.json(rows);
//   } catch (err) {
//     console.error("Error fetching trunk summary:", err);
//     res.status(500).json({ message: "Failed to fetch trunk summary" });
//   }
// });

bill.get("/trunk-summary", authenticate(), async (req, res) => {
  try {
    const { trunk, from, to, code } = req.query;

    let query = "";
    const values = [];

    // 🔹 CASE 1: CODE FILTER LAGA HAI → NO MERGE
    if (code) {
      query = `
    SELECT
      DATE(timestamp) AS timestamp,
      trunk_id,
      trunk,
      code,
      other_call,
      connected_calls,
      ASR,
      ACR
    FROM trunks_performance
    WHERE 1=1
  `;

      if (trunk) {
        query += " AND trunk = ?";
        values.push(trunk);
      }

      query += " AND code = ?";
      values.push(code);

      if (from) {
        query += " AND DATE(timestamp) >= ?";
        values.push(from);
      }

      if (to) {
        query += " AND DATE(timestamp) <= ?";
        values.push(to);
      }

      query += " ORDER BY DATE(timestamp) DESC";
    }


    // 🔹 CASE 2: CODE FILTER NAHI HAI → MERGED ROW
    else {
      query = `
    SELECT
      DATE(timestamp) AS timestamp,
      MAX(trunk_id) AS trunk_id,
      trunk,

      CASE
        WHEN COUNT(DISTINCT code) > 1 THEN 'ALL'
        ELSE MAX(code)
      END AS code,

      SUM(other_call) AS other_call,
      SUM(connected_calls) AS connected_calls,
      ROUND(SUM(ASR), 2) AS ASR,
      ROUND(SUM(ACR), 2) AS ACR
    FROM trunks_performance
    WHERE 1=1
  `;

      if (trunk) {
        query += " AND trunk = ?";
        values.push(trunk);
      }

      if (from) {
        query += " AND DATE(timestamp) >= ?";
        values.push(from);
      }

      if (to) {
        query += " AND DATE(timestamp) <= ?";
        values.push(to);
      }

      query += `
    GROUP BY trunk, DATE(timestamp)
    ORDER BY DATE(timestamp) DESC
  `;
    }


    const [rows] = await billingDb.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching trunk summary:", err);
    res.status(500).json({ message: "Failed to fetch trunk summary" });
  }
});



//------------------------------------------------------------------------------------------------------


bill.get("/trunk-codes", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      `
      SELECT DISTINCT code
      FROM trunks_performance
      ORDER BY code
      `
    );

    // sirf code array bhejo
    const codes = rows.map(r => r.code);

    res.json(codes);
  } catch (err) {
    console.error("❌ trunk-codes error:", err);
    res.status(500).json({ message: "Failed to fetch codes" });
  }
});




//------------------------------------------------------------------------------------------------------

bill.get("/block", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      "SELECT * FROM block ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch block list:", err);
    res.status(500).json({ message: "Failed to fetch block numbers" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.post("/block", authenticate(), async (req, res) => {
  try {
    const { callerId } = req.body;

    if (!callerId) {
      return res.status(400).json({ message: "callerId is required" });
    }

    const [insert] = await billingDb.query(
      "INSERT INTO block (callerId, status, created_at) VALUES (?, 1, CONVERT_TZ(NOW(), '+00:00', '+05:30'))",
      [callerId]
    );

    // Insert ke baad real DB time fetch karo
    const [row] = await billingDb.query("SELECT * FROM block WHERE id = ?", [
      insert.insertId,
    ]);

    res.json(row[0]);
  } catch (err) {
    console.error("Failed to add block number:", err);
    res.status(500).json({ message: "Failed to add block number" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.put("/block/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { callerId, status } = req.body;

    const [rows] = await billingDb.query("SELECT * FROM block WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Block record not found" });
    }

    await billingDb.query(
      "UPDATE block SET callerId = ?, status = ? WHERE id = ?",
      [callerId, status, id]
    );

    const [updated] = await billingDb.query(
      "SELECT * FROM block WHERE id = ?",
      [id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error("Failed to update block number:", err);
    res.status(500).json({ message: "Failed to update block number" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.delete("/block/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await billingDb.query("SELECT * FROM block WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }

    await billingDb.query("DELETE FROM block WHERE id = ?", [id]);

    res.json({ message: "Block number deleted successfully" });
  } catch (err) {
    console.error("Failed to delete block number:", err);
    res.status(500).json({ message: "Failed to delete record" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.get("/routemix", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      "SELECT * FROM routmix ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch routemix" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.get("/routemix/lbid/:lbid", authenticate(), async (req, res) => {
  try {
    const { lbid } = req.params;

    const [rows] = await billingDb.query(
      "SELECT * FROM routmix WHERE LBID  = ? ORDER BY id DESC",
      [lbid]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch LBID  percentage info" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.post("/routemix/batch-save", authenticate(), async (req, res) => {
  const conn = await billingDb.getConnection();
  try {
    const { LBID, trunks } = req.body;
    if (!LBID || !Array.isArray(trunks)) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    for (const t of trunks) {
      if (
        !t.route_name ||
        t.percentage === undefined ||
        t.percentage === null
      ) {
        return res
          .status(400)
          .json({ message: "Each trunk must have route_name and percentage" });
      }
      if (!Number.isInteger(Number(t.percentage))) {
        return res
          .status(400)
          .json({ message: "Percentage must be integer (10,20,...100)" });
      }
    }

    const total = trunks.reduce((s, t) => s + Number(t.percentage), 0);
    if (total !== 100) {
      return res
        .status(400)
        .json({ message: "Total percentage must be exactly 100" });
    }

    await conn.beginTransaction();

    await conn.query("DELETE FROM routmix WHERE LBID = ?", [LBID]);

    const insertSql =
      "INSERT INTO routmix (route_name, LBID, percentage, status) VALUES (?,?,?,?)";
    for (const t of trunks) {
      const st = t.status !== undefined ? t.status : 1;
      await conn.query(insertSql, [
        t.route_name,
        LBID,
        Number(t.percentage),
        st,
      ]);
    }

    await conn.commit();
    conn.release();

    res.json({ message: "Saved successfully" });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (e) { }
    conn.release && conn.release();
    console.error("BATCH SAVE ERROR:", err);
    res.status(500).json({ message: "Failed to save batch" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.put("/routemix/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { route_name, LBID, percentage, status } = req.body;

    const percent = Number(percentage);

    const [rows] = await billingDb.query(
      "SELECT percentage FROM routmix WHERE LBID = ? AND id != ?",
      [LBID, id]
    );

    const existingTotal = rows.reduce(
      (sum, r) => sum + Number(r.percentage),
      0
    );

    if (existingTotal + percent !== 100) {
      return res.status(400).json({
        message: `Total must be 100%. Currently: ${existingTotal}, Required: ${100 - existingTotal
          }`,
      });
    }

    await billingDb.query(
      "UPDATE routmix SET route_name=?, LBID=?, percentage=?, status=? WHERE id=?",
      [route_name, LBID, percent, status, id]
    );

    res.json({ id, route_name, LBID, percentage, status });
  } catch (err) {
    res.status(500).json({ message: "Failed to update routemix" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.delete("/routemix/:id", authenticate(), async (req, res) => {
  try {
    await billingDb.query("DELETE FROM routmix WHERE id=?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete routemix" });
  }
});

//------------------------------------------------------------------------------------------------------

bill.get("/did/countries", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      `SELECT 
        id,
        country_name,
        country_code,
        flag
       FROM did_countries
       ORDER BY country_name ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error("Backend Country fetch error:", err);
    res.status(500).json({ message: "Failed to fetch countries" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.get("/did/states/:countryCode", authenticate(), async (req, res) => {
  try {
    const { countryCode } = req.params;

    const [rows] = await billingDb.query(
      `SELECT
        id,
        country_code,
        state_name,
        state_code,
        mrc,
        nrc,
        comment,
        documents
      FROM did_states
      WHERE country_code = ?
      ORDER BY state_name ASC`,
      [countryCode]
    );

    res.json(rows);
  } catch (err) {
    console.error("Backend State fetch error:", err);
    res.status(500).json({ message: "Failed to fetch states" });
  }
});
//------------------------------------------------------------------------------------------------------

bill.post("/did/request", authenticate(), async (req, res) => {
  try {
    const {
      country,
      countryCode,
      state,
      stateCode,
      quantity,
      nrc,
      mrc,
    } = req.body;

    const username = req.user.username;

    // 1️⃣ Get user details
    const [rows] = await billingDb.query(
      "SELECT email, username, firstname, lastname FROM user WHERE username = ?",
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const userEmail = rows[0].email;
    const userName = `${rows[0].firstname} ${rows[0].lastname}`;

    // 2️⃣ Calculations
    const totalNRC = Number(quantity) * Number(nrc);
    const totalMRC = Number(quantity) * Number(mrc);

    // 3️⃣ SAVE DATA INTO DATABASE (NEW TABLE)
    await billingDb.query(
      `INSERT INTO did_purchase_requests
        (user_id, from_email, to_email, country, country_code,
         state, state_code, quantity, nrc, mrc, total_nrc, total_mrc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        userEmail,
        process.env.ADMIN_EMAIL,
        country,
        countryCode,
        state,
        stateCode,
        quantity,
        nrc,
        mrc,
        totalNRC,
        totalMRC,
      ]
    );

    // 4️⃣ EMAIL HTML
    const html = `
      <h2>DID Purchase Request</h2>
      <p><b>Requested By:</b> ${userName} (${userEmail})</p>

      <table border="1" cellpadding="6" cellspacing="0">
        <tr><td><b>Country</b></td><td>${country}</td></tr>
        <tr><td><b>State</b></td><td>${state}</td></tr>
        <tr><td><b>Quantity</b></td><td>${quantity}</td></tr>
        <tr><td><b>NRC (per DID)</b></td><td>$${nrc}</td></tr>
        <tr><td><b>MRC (per DID)</b></td><td>$${mrc}</td></tr>
        <tr><td><b>Total NRC</b></td><td><b>$${totalNRC}</b></td></tr>
        <tr><td><b>Total MRC</b></td><td><b>$${totalMRC}</b></td></tr>
      </table>
    `;

    // 5️⃣ SEND EMAIL TO ADMIN
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "New DID Purchase Request",
      html,
      replyTo: userEmail, // reply goes to user
      fromName: userName, // user name in FROM
    });

    // 6️⃣ RESPONSE FOR FRONTEND POPUP
    res.json({
      message: "Request submitted successfully",
      data: {
        country,
        state,
        quantity,
        nrc,
        mrc,
        totalNRC,
        totalMRC,
      },
    });
  } catch (err) {
    console.error("DID request error:", err);
    res.status(500).json({ message: "Failed to submit DID request" });
  }
});

//------------------------------------------------------------------------------------------------------
bill.get("/did_purchase_requests", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(`
      SELECT 
        id,
        user_id,
        from_email,
        to_email,
        country,
        country_code,
        state,
        state_code,
        quantity,
        nrc,
        mrc,
        total_nrc,
        total_mrc,
        status,
        created_at
      FROM did_purchase_requests
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Backend DID Purchase Requests fetch error:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch DID purchase requests" });
  }
});

//------------------------------------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const options = {
  cert: fs.readFileSync("/etc/apache2/ssl.crt/viciphone.crt"),
  key: fs.readFileSync("/etc/apache2/ssl.key/viciphone.key"),
};

https.createServer(options, bill).listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});
