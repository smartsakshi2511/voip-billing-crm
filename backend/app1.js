require("dotenv").config();
const { countryCodes, getCountryFromCode } = require("./middlewares/countryCodes.js");

const express = require("express");
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
    credentials: true
  })
);
bill.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET;
const OTP_EXP_MINUTES = parseInt(process.env.OTP_EXP_MINUTES || "1", 10);
const FROM_SMS_PREFIX = process.env.SMS_FROM || "WINETT";

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


// function sendSms(mobile, text) {
//   console.log("🔍 [SMS] Raw mobile from DB:", mobile);
//   console.log("🔍 [SMS] Text to send:", text);

//   if (!mobile) {
//     console.log("❌ [SMS] Mobile number missing");
//     return;
//   }

//   const to = mobile.replace(/[^0-9]/g, "").slice(-10);
//   console.log("📱 [SMS] Final mobile (10 digit):", to);

//   const smsUrl = `https://pgapi.vispl.in/fe/api/v1/send?username=${process.env.PGAPI_USERNAME}&password=${process.env.PGAPI_PASSWORD}&unicode=false&from=${FROM_SMS_PREFIX}&to=91${to}&text=${encodeURIComponent(text)}&dltContentId=1707167894831608941`;

//   console.log("🌐 [SMS] Final API URL:", smsUrl);

//   https
//     .get(smsUrl, (res) => {
//       let body = "";
//       res.on("data", (chunk) => (body += chunk));

//       res.on("end", () => {
//         console.log("📩 [SMS RESPONSE]:", body);
//       });
//     })
//     .on("error", (err) => {
//       console.error("❌ [SMS SEND ERROR]", err);
//     });
// }



async function sendWhatsappOtp(mobile, otp) {
  try {
    if (!mobile) {
      return;
    }

    const to = "91" + mobile.replace(/[^0-9]/g, "").slice(-10);

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: "billingotp",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: otp }
            ]
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              { type: "text", text: otp }
            ]
          }
        ]
      }
    };

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "701a60c9-c50d-11ef-bb5a-02c8a5e042bd"
      }
    };

    const req = https.request(
      "https://partnersv1.pinbot.ai/v3/517973978061642/messages",
      options,
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
        });
      }
    );

    req.on("error", (err) => {
      console.error("WhatsApp API Error", err);
    });

    req.write(JSON.stringify(payload));
    req.end();

  } catch (err) {
    console.error("WhatsApp Send Error:", err);
  }
}

async function sendEmail(toEmail, subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || transporter.options.auth.user,
      to: toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error("Email send error:", err);
  }
}

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

//------------------------------------------------------------------------------------------------------

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

    if (user.status !== "active" && user.status !== "pending") {
      return res.status(403).json({
        message: "Your account status does not allow login.",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 60 * 1000);
    const now = new Date();

    await billingDb.query(
      `INSERT INTO otp_verification 
      (user_id, username, otp,  otp_email, otp_mobile, expires_at, created_at, attempt, otp_status, used) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [user.id, user.username, otp, user.email || null, user.mobileno || null, expiresAt, now, 1, "sent"]
    );

    if (user.mobileno) {
      await sendWhatsappOtp(user.mobileno, otp);
    }
    if (user.email) {
      sendEmail(user.email, "Login OTP", `Your login OTP is <b>${otp}</b>.`);
    }

    return res.json({ message: "OTP sent", userId: user.id });
  } catch (err) {
    console.error("Login OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

//------------------------------------------------------------------------------------------------------


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
      0
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

//------------------------------------------------------------------------------------------------------

// GET masked email & mobile for OTP screen
bill.get("/auth/otp-reference/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await billingDb.query(
      "SELECT email, mobileno FROM user WHERE id = ?",
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    return res.json({
      email: user.email || "",
      mobile: user.mobileno || ""
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

    const [lastOtp] = await billingDb.query(
      `SELECT * FROM otp_verification
       WHERE user_id = ? AND otp_status IN ('sent','resent')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (!lastOtp.length)
      return res.status(400).json({ message: "OTP not found" });

    const record = lastOtp[0];
    const [lastAttempt] = await billingDb.query(
      "SELECT attempt FROM otp_verification WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    let nextAttempt = lastAttempt.length ? lastAttempt[0].attempt + 1 : 1;
    if (new Date(record.expires_at) < new Date()) {
      await billingDb.query(
        `INSERT INTO otp_verification 
        (user_id, username, otp, expires_at, created_at, attempt, otp_status, used)
         VALUES (?, ?, ?, ?, NOW(), ?, 'expired', 0)`,
        [userId, record.username, otp, record.expires_at, nextAttempt]
      );

      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
      await billingDb.query(
        `INSERT INTO otp_verification 
        (user_id, username, otp, expires_at, created_at, attempt, otp_status, used)
        VALUES (?, ?, ?, ?, NOW(), ?, 'failed', 0)`,
        [userId, record.username, otp, record.expires_at, nextAttempt]
      );

      return res.status(400).json({ message: "Invalid OTP" });
    }
    const created = new Date(record.created_at);
    const now = new Date();
    const diffSec = Math.floor((now - created) / 1000);

    await billingDb.query(
      `INSERT INTO otp_verification 
      (user_id, username, otp, expires_at, created_at, attempt, otp_status, used, verify_time_seconds)
      VALUES (?, ?, ?, ?, NOW(), ?, 'verified', 1, ?)`,
      [userId, record.username, otp, record.expires_at, nextAttempt, diffSec]
    );

    const [userRows] = await billingDb.query("SELECT * FROM user WHERE id = ?", [userId]);
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

    const [userRows] = await billingDb.query("SELECT * FROM user WHERE id = ?", [userId]);
    if (!userRows.length) return res.status(400).json({ message: "User not found" });
    const user = userRows[0];

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);
    const now = new Date();
    const [last] = await billingDb.query(
      "SELECT attempt FROM otp_verification WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );

    const nextAttempt = last.length ? last[0].attempt + 1 : 2;

    await billingDb.query(
      `INSERT INTO otp_verification
   (user_id, username, otp_email, otp_mobile, otp, expires_at, created_at, attempt, otp_status)
   VALUES (?, ?, ?, ?, ?, ?, ? , ?, ?)`,
      [userId, user.username, user.email || null, user.mobileno || null, otp, expiresAt, now, nextAttempt, "resent"]
    );


    if (user.mobileno) {
      await sendWhatsappOtp(user.mobileno, otp);

    } else {
    }
    if (user.email) {
      const html = `<p>Your login OTP is <b>${otp}</b>. It will expire in ${OTP_EXP_MINUTES} minutes.</p>`;
      sendEmail(user.email, "Your Login OTP (Resent)", html);
    }

    return res.json({ message: "OTP resent" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


bill.get("/app", (req, res) => {
  const userAgent = req.headers["user-agent"]?.toLowerCase();

  const appStoreUrl = "https://apps.apple.com/in/app/winet-wani/id6755235059";
  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.winet_pmwani";

  if (userAgent.includes("iphone") || userAgent.includes("ipad")) {
    return res.redirect(appStoreUrl);
  }

  if (userAgent.includes("android")) {
    return res.redirect(playStoreUrl);
  }
  res.send(`
    <h2>Select Your App:</h2>
    <a href="${appStoreUrl}">iPhone App</a><br>
    <a href="${playStoreUrl}">Android App</a>
  `);
});


//------------------------------------------------------------------------------------------------------

bill.get("/auth/check-token", authenticate(), async (req, res) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ valid: false });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await billingDb.query(
      "SELECT token FROM user WHERE id = ? AND (del_status IS NULL OR del_status = 0)",
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ valid: false });
    }

    const dbToken = rows[0].token;

    // ❌ DO NOT logout, just return valid/invalid
    if (dbToken !== token) {
      return res.status(401).json({ valid: false });
    }

    return res.json({ valid: true });

  } catch (err) {
    return res.status(401).json({ valid: false });
  }
});


//------------------------------------------------------------------------------------------------------

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
//--------------------------------------------------------------------------------------------
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
        SELECT id, username, firstname, lastname ,Typeofaccount, Creditlimit, balance
        FROM user 
        WHERE (del_status IS NULL OR del_status != 1)
          AND \`group\` != 0
      `;
    } else if (role === "client") {
      query = `
        SELECT id, username, firstname, lastname,Typeofaccount, Creditlimit, balance
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

//-----------------------------------------------------------------------
bill.get("/users", authenticate(), async (req, res) => {
  try {
    const { id, role, username } = req.user;
    let query, params;
    const baseQuery = `
      SELECT 
        u.*,
        s.id AS sip_id,
        s.username AS sip_username,
        s.password AS sip_password,
        s.callerid AS sip_callerid,
        s.codec AS sip_codec,
        s.host AS sip_host,
        s.select_host AS sip_select_host,
        s.port AS sip_port
      FROM user u
      LEFT JOIN sipaccount s 
        ON s.username = u.username
        AND (s.del_status IS NULL OR s.del_status != 1)
      WHERE (u.del_status IS NULL OR u.del_status != 1)
    `;

    if (role === "admin") {
      query = `
        ${baseQuery}
        AND u.\`group\` != 0
        ORDER BY u.id DESC
      `;
      params = [];
    }

    else if (role === "client") {
      query = `
        ${baseQuery}
        AND u.id = ?
        AND s.accountcode = ?
        ORDER BY u.id DESC
      `;
      params = [id, username];
    }

    else {
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
      email,
      mobileno,
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
        pincode, email, mobileno, Typeofaccount, Recordcall, del_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
      Typeofaccount,
      Recordcall || 0,
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
        // Standard user-based SIP
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
        // IP-based SIP with carrier-style prefix (same as /sipaccounts)
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
    res.status(500).json({ message: "Failed to add user" });
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
      Typeofaccount,
      Recordcall,
      createSip,
      select_host,
      host,
      codec,
      port,
    } = req.body;

    // 🔹 Get existing user
    const [existingUser] = await billingDb.query(
      "SELECT * FROM user WHERE id = ? AND del_status = 0",
      [id]
    );
    if (!existingUser.length) return res.status(404).json({ message: "User not found" });

    const currentUser = existingUser[0];
    const oldUsername = currentUser.username;

    // 🔹 Check if username or password changed
    const usernameChanged = username && username !== oldUsername;
    const passwordChanged = password && password !== currentUser.password;

    // 🔹 Update user table
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
      Typeofaccount || currentUser.Typeofaccount,
      Recordcall ?? currentUser.Recordcall,
      id,
    ]);
    if (createSip && select_host) {
      const codecString = Array.isArray(codec) ? codec.join(",") : codec || "ulaw,alaw,g722";
      const sipUsername = username || oldUsername;
      const sipPassword = password || currentUser.password;

      await billingDb.query(
        `INSERT INTO sipaccount (accountcode, username, password, callerid, codec, host, select_host, port, del_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE username=VALUES(username), password=VALUES(password), codec=VALUES(codec), host=VALUES(host), port=VALUES(port)`,
        [sipUsername, sipUsername, sipPassword, sipUsername, codecString, host || "user", select_host, port || 5060]
      );
      const confPath = path.join("/etc/asterisk", "billingsip.conf");
      let confContent = fs.readFileSync(confPath, "utf8");

      const regex = new RegExp(`\\[${oldUsername}\\][\\s\\S]*?(?=\\n\\[|$)`, "g");
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
        ((usernameChanged || passwordChanged || createSip) ? " (SIP updated and reload triggered)" : ""),
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
    const [userRows] = await billingDb.query(
      "SELECT username, planid FROM user WHERE id = ? AND del_status = 0",
      [id]
    );

    if (!userRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const { username } = userRows[0];
    await billingDb.query(
      "UPDATE user SET del_status = 1, planid = NULL, planname = NULL WHERE id = ?",
      [id]
    );
    await billingDb.query(
      "UPDATE sipaccount SET del_status = 1 WHERE username = ?",
      [username]
    );
    const confPath = path.join("/etc/asterisk", "billingsip.conf");
    if (fs.existsSync(confPath)) {
      let confData = fs.readFileSync(confPath, "utf8");
      const userRegex = new RegExp(
        `\\[${username}\\][\\s\\S]*?max_contacts=1\\n`,
        "g"
      );
      confData = confData.replace(userRegex, "");
      fs.writeFileSync(confPath, confData, "utf8");
    }
    await billingDb.query(
      "UPDATE reload_status SET status = 1, last_updated = NOW() WHERE reload_type = 'pjsip_reload'"
    );

    res.json({
      message: "User, SIP account, and PlanGroup deleted successfully",
    });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

//--------------------------------------------------------------------------------

bill.get("/user_planGroups", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      "SELECT PlanGroupID, Plangroupname FROM planGroup WHERE (del_status IS NULL OR del_status != 1) "
    );
    res.json(rows);
  } catch (err) {
    console.error("Plan groups fetch error:", err);
    res.status(500).json({ message: "Failed to fetch plan groups" });
  }
});

bill.get("/users/low-balance-email", async (req, res) => {
  try {
    const sql = `
      SELECT 
        id, username, email, phoneno, mobileno,
        Typeofaccount, balance, Creditlimit
      FROM user
      WHERE \`group\` = 1
        AND status = 'active'
        AND (del_status IS NULL OR del_status = 0)
    `;

    const [users] = await billingDb.query(sql);

    let notified = [];

    for (const u of users) {
      let isLow = false;
      let value = 0;

      if (u.Typeofaccount === "Prepaid") {
        value = Number(u.balance || 0);
        if (value < 1000) isLow = true;
      } else if (u.Typeofaccount === "Postpaid") {
        value = Number(u.Creditlimit || 0);
        if (value < 1000) isLow = true;
      }

      if (!isLow) continue;

      // If user has email, send low balance warning
      if (u.email) {
        const html = `
          <p>Hello <b>${u.username}</b>,</p>
          <p>Your account balance is low.</p>
          <p><b>Current Value:</b> ${value}</p>
          <p>Please recharge soon.</p>
          <br/>
          <p>Regards,<br/>Billing System</p>
        `;

        await sendEmail(u.email, "Low Balance Warning", html);
      }

      notified.push({
        id: u.id,
        username: u.username,
        email: u.email,
        value,
        Typeofaccount: u.Typeofaccount
      });
    }

    return res.json({
      success: true,
      totalNotified: notified.length,
      notified
    });

  } catch (err) {
    console.error("Low balance email error:", err);
    return res.status(500).json({ message: "Server error" });
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


//-------------------------------------------------------------------------------------
bill.put("/plans/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { PlanID, PlanName, lcr_type } = req.body;

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
      "UPDATE plans SET PlanID = ?, PlanName = ?, lcr_type = ? WHERE id = ?",
      [PlanID, PlanName, lcr_type, id]
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

    // Get plan before deleting (for log)
    const [rows] = await billingDb.query(
      "SELECT * FROM plans WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const plan = rows[0];

    // ✅ Hard delete
    await billingDb.query("DELETE FROM plans WHERE id = ?", [id]);

    // ✅ Activity log
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "PLAN",
      event_type: "DELETE",
      record_id: id,
      event_code: "DELETE_PLAN",
      event_sql: `DELETE FROM plans WHERE id = ${id};`,
      event_notes: `Plan deleted: ${plan.PlanName} (${plan.PlanID})`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.json({ message: "Plan deleted permanently" });

  } catch (err) {
    console.error("❌ Error deleting plan:", err);
    res.status(500).json({ message: "Failed to delete plan" });
  }
});


//================================================================================================

bill.get("/plangroups", authenticate(), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const [planRows] = await billingDb.query(
      "SELECT PlanID, PlanName FROM plans"
    );

    const planMap = {};
    planRows.forEach(p => {
      planMap[p.PlanID] = p.PlanName;
    });
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
    const formatted = rows.map((r) => {
      const memberIDs = typeof r.plangroupmembers === "string"
        ? r.plangroupmembers.split(",").map(id => id.trim())
        : [];

      const memberNames = memberIDs.map(id => planMap[id] || "");

      const types = typeof r.Lcrtype === "string"
        ? r.Lcrtype.split(",").map(t => t.trim())
        : [];

      return {
        ...r,
        plangroupmembers: memberNames,   // ← IDs ko convert karke NAME bhej diya
        plangroupids: memberIDs,         // ← IDs alag se dedo checkbox ke liye
        Lcrtype: types,
        user: usersByGroup[r.PlanGroupID] || []
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
      [
        PlanGroupID,
        Plangroupname,
        memberIDs.join(","),
        finalType.join(","),
      ]
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
        VALUES ('${PlanGroupID}', '${Plangroupname}', '${memberIDs.join(",")}', '${finalType.join(",")}');
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
      [
        PlanGroupID,
        Plangroupname,
        memberIDs.join(","),
        finalType.join(","),
        id,
      ]
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


//-------------------------------------------------------------------------------------------

bill.delete("/plangroups/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await billingDb.query(
      "SELECT * FROM planGroup WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Plan Group not found" });
    }

    const group = rows[0];

    // ✅ Hard delete
    await billingDb.query("DELETE FROM planGroup WHERE id = ?", [id]);

    // ✅ Activity Log
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

    res.status(200).json({ message: "Plan Group deleted permanently" });
  } catch (err) {
    console.error("Failed to delete plan group:", err);
    res.status(500).json({ message: "Failed to delete plan group" });
  }
});


//-------------------------------------------------------------------------------------------

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

      confEntry = `
[${username}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${username}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${username}-aor]
type=aor
max_contacts=1

[${username}-identify]
type=identify
endpoint=${username}
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

    const sql = `
      UPDATE sipaccount 
      SET accountcode=?, username=?, password=?, callerid=?, codec=?, host=?, select_host=?, port=? 
      WHERE id=? AND (del_status IS NULL OR del_status!=1)
    `;

    await billingDb.query(sql, [
      accountcode || old.accountcode,
      username || old.username,
      password || old.password,
      callerid || old.callerid,
      codecString,
      host || old.host,
      newType,
      port || old.port,
      id,
    ]);

    const confPath = path.join("/etc/asterisk", "billingsip.conf");
    const oldConf = fs.readFileSync(confPath, "utf8");
    let newConf = oldConf;
    if (oldType !== newType) {
      const regex = new RegExp(
        `\\[(${old.username}|${old.accountcode}|${old.username}-aor|${old.username}-identify)\\][^\\[]*`,
        "g"
      );
      newConf = oldConf.replace(regex, "");

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
password=${password}
username=${username}

[${username}]
type=aor
max_contacts=1
`;
      } else if (newType === "ip") {
        confEntry = `
[${username}]
type=endpoint
context=outgoingbilling
disallow=all
allow=${codecString}
aors=${username}-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
transport=transport-udp
allow_unauthenticated_options=yes

[${username}-aor]
type=aor
max_contacts=1

[${username}-identify]
type=identify
endpoint=${username}
match=${host}
`;
      }

      newConf += "\n" + confEntry;
    }
    else {
      if (oldType === "user") {
        newConf = newConf
          .replace(
            new RegExp(`(\\[${old.username}\\][^\\[]*password=)(.*)`),
            `$1${password || old.password}`
          )
          .replace(
            new RegExp(`(\\[${old.username}\\][^\\[]*username=)(.*)`),
            `$1${username || old.username}`
          )
          .replace(
            new RegExp(`(\\[${old.username}\\][^\\[]*allow=)(.*)`),
            `$1${codecString}`
          );
      } else if (oldType === "ip") {
        newConf = newConf
          .replace(
            new RegExp(`(\\[${old.username}-identify\\][^\\[]*match=)(.*)`),
            `$1${host || old.host}`
          )
          .replace(
            new RegExp(`(\\[${old.username}\\][^\\[]*allow=)(.*)`),
            `$1${codecString}`
          );
      }
    }

    fs.writeFileSync(confPath, newConf, "utf8");
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

//-------------------------------------------------------------------------------------------


bill.delete("/sipaccounts/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await billingDb.query(
      "SELECT username, accountcode FROM sipaccount WHERE id=? AND (del_status IS NULL OR del_status!=1)",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "SIP account not found" });
    }

    const sip = rows[0];
    await billingDb.query("UPDATE sipaccount SET del_status=1 WHERE id=?", [
      id,
    ]);
    const confPath = path.join("/etc/asterisk", "billingsip.conf");

    if (fs.existsSync(confPath)) {
      const fileData = fs.readFileSync(confPath, "utf8");
      const pattern = new RegExp(
        `\\[${sip.username || sip.accountcode}\\][^\\[]*`,
        "g"
      );

      const updatedData = fileData.replace(pattern, "");

      fs.writeFileSync(confPath, updatedData, "utf8");
    } else {
      console.warn("billingsip.conf not found");
    }
    await billingDb.query(
      "UPDATE reload_status SET status=1, last_updated=NOW() WHERE reload_type='pjsip_reload'"
    );
    res.json({
      message: "🗑 SIP account deleted and removed from config successfully",
    });
  } catch (err) {
    console.error("Delete SIP account error:", err);
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
    const { username, role } = req.user;

    let query = "SELECT * FROM onlinecalls";
    let values = [];

    if (role === "client") {
      query += " WHERE user = ?";
      values.push(username);
    }

    const [rows] = await billingDb.query(query, values);
    const enhancedRows = rows.map((call) => {
      const statusLower = String(call.status || "").toLowerCase();

      if (statusLower === "answer" && call.start_time) {
        const start = new Date(call.start_time).getTime();
        const now = Date.now();
        const durationSec = Math.floor((now - start) / 1000);

        return { ...call, duration: durationSec };
      }

      return { ...call, duration: call.duration || 0 };
    });

    res.json(enhancedRows);
  } catch (err) {
    console.error("Fetch Online Calls Error:", err);
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

      const members = pg[0].plangroupmembers
        .split(",")
        .map((x) => x.trim());
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
    console.error("Backend Trunks fetch error:", err);
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

    // if (!TarrifID) {
    //   let unique = false;
    //   while (!unique) {
    //     const randomId = Math.floor(100000 + Math.random() * 900000).toString();
    //     const [rows] = await billingDb.query(
    //       "SELECT TarrifID FROM tariff WHERE TarrifID = ? LIMIT 1",
    //       [randomId]
    //     );
    //     if (rows.length === 0) {
    //       TarrifID = randomId;
    //       unique = true;
    //     }
    //   }
    // }

    const [dup] = await billingDb.query(
  "SELECT id FROM tariff WHERE TarrifID = ? LIMIT 1",
  [TarrifID]
);

if (dup.length > 0) {
  return res.status(409).json({ message: "Duplicate TarrifID detected" });
}


    if (!PlanName || !TrunkName) {
      return res.status(400).json({ message: "PlanName & TrunkName are required" });
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


//-----------------------------------------------------------------------------------

bill.get("/tariffs/next-id", authenticate(), async (req, res) => {
  try {
    const [rows] = await billingDb.query(
      "SELECT TarrifID FROM tariff ORDER BY TarrifID ASC"
    );

    let nextId = 1;

    for (let i = 0; i < rows.length; i++) {
      const current = parseInt(rows[i].TarrifID, 10);

      if (current !== nextId) {
        break; // 👈 gap mil gaya
      }
      nextId++;
    }

    if (nextId > 99999999) {
      return res.status(400).json({ message: "Tariff ID limit exceeded" });
    }

    const TarrifID = String(nextId).padStart(8, "0");

    res.json({ TarrifID });

  } catch (err) {
    console.error("❌ Error generating TarrifID:", err);
    res.status(500).json({ message: "Failed to generate TarrifID" });
  }
});


//----------------------------------------------------------------------------------------

bill.put("/tariffs/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Allowed columns only (table me jo exist karte hain)
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
      "del_status"
    ];

    // Get old data for logging
    const [oldRows] = await billingDb.query(
      "SELECT * FROM tariff WHERE id = ?",
      [id]
    );

    if (!oldRows.length) {
      return res.status(404).json({ message: "Tariff not found" });
    }

    const fields = [];
    const values = [];

    // Take only allowed fields
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

    // Fetch updated data
    const [updated] = await billingDb.query(
      "SELECT * FROM tariff WHERE id = ?",
      [id]
    );

    // Log Activity
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

    const [rows] = await billingDb.query("SELECT * FROM tariff WHERE id = ?", [id]);
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

bill.post("/tariffs/upload", authenticate(), upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const {
      PlanName: formPlanName,
      TrunkName: formTrunkName,
      Code: formCode,
      Destination: formDestination,
      status = "Active",
    } = req.body;

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    let inserted = [];
    let skippedRows = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const PlanName = row.PlanName || formPlanName;
      const TrunkName = row.TrunkName || formTrunkName;
      const Code = row.Code || formCode;
      const Destination = row.Destination || formDestination;

      let {
        buyprice = 0,
        buyminimum = 1,
        buyincrement = 1,
        sellprice = 0,
        sellminimum = 1,
        sellincrement = 1,
      } = row;

      let currentTarrifID;
      let unique = false;
      while (!unique) {
        const randomId = Math.floor(
          100000 + Math.random() * 900000
        ).toString();
        const [rows] = await billingDb.query(
          "SELECT TarrifID FROM tariff WHERE TarrifID=? LIMIT 1",
          [randomId]
        );
        if (rows.length === 0) {
          currentTarrifID = randomId;
          unique = true;
        }
      }

      let PlanID = null;
      if (PlanName) {
        const [planRow] = await billingDb.query(
          "SELECT PlanID FROM plans WHERE PlanName=? LIMIT 1",
          [PlanName]
        );
        if (planRow.length > 0) PlanID = planRow[0].PlanID;
      }

      let TrunkID = null;
      if (TrunkName) {
        const [trunkRow] = await billingDb.query(
          "SELECT id FROM trunk WHERE trunkname=? LIMIT 1",
          [TrunkName]
        );
        if (trunkRow.length > 0) TrunkID = trunkRow[0].id;
      }

      // Skip invalid row
      if (!PlanID || !TrunkID) {
        skippedRows.push({
          rowNumber: i + 1,
          row,
          reason: "PlanID or TrunkID not found",
        });
        continue;
      }

      const query = `
          INSERT INTO tariff
          (TarrifID, PlanID, PlanName, Code, Destination, TrunkID, TrunkName,
           buyprice, buyminimum, buyincrement, sellprice, sellminimum, sellincrement, status)
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
      inserted.push(result.insertId);
    }

    // 👉 **Add Log Activity — only once**
    await logActivity({
      user: req.user.username,
      ip_address: req.ip,
      event_section: "TARIFF",
      event_type: "UPLOAD",
      record_id: inserted.join(","), // multiple IDs
      event_code: "UPLOAD_TARIFF_EXCEL",
      event_sql: `BULK UPLOAD (${inserted.length} inserted, ${skippedRows.length} skipped)`,
      event_notes: `Tariff Excel uploaded. Inserted: ${inserted.length}, Skipped: ${skippedRows.length}`,
      user_group: req.user.role || "UNKNOWN",
    });

    res.status(201).json({
      message: "Bulk tariffs processed",
      insertedCount: inserted.length,
      skippedRows,
    });
  } catch (err) {
    console.error("Bulk Tariff upload error:", err);
    res.status(500).json({ message: "Failed to upload tariffs" });
  }
}
);

//-------------------------------------------------------------------------------------------

bill.get("/didpurchase", authenticate(), async (req, res) => {
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
        WHERE did.reserved = 'no'
        ORDER BY did.id DESC
      `;
      params = [];
    }

    else if (role === "client") {
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
        AND did.reserved = 'no'
        ORDER BY did.id DESC
      `;
      params = [username];
    }

    else {
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
    }

    else if (role === "client") {
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
    }

    else {
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

    // Insert into DID table
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

bill.put("/dids/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
 
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
        await billingDb.query(
          `UPDATE diddestination SET ? WHERE did_id = ?`,
          [payload, did]
        );
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

    const [rows] = await billingDb.query("SELECT * FROM did WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "DID not found" });
    }

    const didNumber = rows[0].did;

    await billingDb.query("DELETE FROM diddestination WHERE did_id = ?", [
      id,
    ]);
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

//-------------------------------------------------------------------------------------------


bill.post("/dids/import", authenticate(), upload.single("file"), async (req, res) => {
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
 
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
 
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

        // INSERT DID
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

        // Insert destination if reserved
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
    }

    else if (role === "client") {
      query = `
        SELECT ddes.*
        FROM diddestination ddes
        JOIN did d ON ddes.did_id = d.did
        WHERE d.user_id = ?
        ORDER BY ddes.id DESC
      `;
      params = [username];
    }

    else {
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

bill.delete("/diddestination/:id", authenticate(), async (req, res) => {
  const { id } = req.params;

  try {
    // 🔎 Get destination details before delete (for logging)
    const [destRows] = await billingDb.query(
      "SELECT id, did_id, typeofcall FROM diddestination WHERE id = ?",
      [id]
    );

    if (!destRows.length) {
      return res
        .status(404)
        .json({ message: "DID Destination not found" });
    }

    const { did_id, typeofcall } = destRows[0];

    // ❌ Delete destination
    await billingDb.query(
      "DELETE FROM diddestination WHERE id = ?",
      [id]
    );

    // 🔓 Free DID
    await billingDb.query(
      "UPDATE did SET reserved = 'no' WHERE did = ?",
      [did_id]
    );

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
}
);

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
    console.error("Failed to fetch routes:", err);
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

//------------------------------------------------------------------------------------------------------

bill.delete("/routes/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await billingDb.query(
      "SELECT Routeid, routename FROM routes WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Route not found" });
    }

    const { Routeid, routename } = rows[0];

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

bill.get("/refills", authenticate(), async (req, res) => {
  try {
    const { role, username } = req.user;

    let query, params;

    if (role === "admin") {
      query = `
        SELECT * FROM refill
        WHERE del_status = 0 OR del_status IS NULL
        ORDER BY id DESC
      `;
      params = [];
    } else if (role === "client") {
      query = `
        SELECT * FROM refill
        WHERE (user = ?)
          AND (del_status = 0 OR del_status IS NULL)
        ORDER BY id DESC
      `;
      params = [username];
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

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
//       `SELECT id, Typeofaccount, balance, Creditlimit 
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
//       if (add_delete.toLowerCase() === "add") {
//         newValue = oldValue + amount;
//       } else {
//         if (amount > oldValue) {
//           return res
//             .status(400)
//             .json({ message: "Delete amount exceeds current balance." });
//         }
//         newValue = oldValue - amount;
//       }
//     } else if (account.Typeofaccount?.toLowerCase() === "postpaid") {
//       updateColumn = "Creditlimit";
//       oldValue = Number(account.Creditlimit);
//       if (add_delete.toLowerCase() === "add") {
//         newValue = oldValue + amount;
//       } else {
//         if (amount > oldValue) {
//           return res
//             .status(400)
//             .json({ message: "Delete amount exceeds current credit limit." });
//         }
//         newValue = oldValue - amount;
//       }
//     } else {
//       return res.status(400).json({ message: "Invalid account type" });
//     }

//     const finalDescription =
//       `${description} | Old ${updateColumn}: ${oldValue} | New ${updateColumn}: ${newValue}`;


//     const [result] = await billingDb.query(
//       `INSERT INTO refill (user, credit, description, add_delete, date, del_status) 
//        VALUES (?, ?, ?, ?, NOW(), 0)`,
//       [user, amount, finalDescription, add_delete]
//     );

//     await billingDb.query(
//       `UPDATE user SET ${updateColumn} = ? WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
//       [newValue, account.id]
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
//     });
//   } catch (err) {
//     console.error("Failed to add refill:", err);
//     res.status(500).json({ message: "Failed to add refill" });
//   }
// });

bill.post("/refills", authenticate(), async (req, res) => {
  try {
    const { user, credit, description, add_delete } = req.body;

    // 🔒 helper to fix floating precision (6 decimals)
    const round6 = (num) => Number(Number(num).toFixed(6));

    const amount = round6(credit);

    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Credit must be a positive number." });
    }

    // 🔍 fetch user
    const [users] = await billingDb.query(
      `SELECT id, Typeofaccount, balance, Creditlimit 
       FROM user 
       WHERE username = ? AND (del_status = 0 OR del_status IS NULL)`,
      [user]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const account = users[0];

    let updateColumn, oldValue, newValue;

    // 🔁 PREPAID
    if (account.Typeofaccount?.toLowerCase() === "prepaid") {
      updateColumn = "balance";
      oldValue = round6(account.balance);

      if (add_delete.toLowerCase() === "add") {
        newValue = round6(oldValue + amount);
      } else {
        if (amount > oldValue) {
          return res
            .status(400)
            .json({ message: "Delete amount exceeds current balance." });
        }
        newValue = round6(oldValue - amount);
      }
    }

    // 🔁 POSTPAID
    else if (account.Typeofaccount?.toLowerCase() === "postpaid") {
      updateColumn = "Creditlimit";
      oldValue = round6(account.Creditlimit);

      if (add_delete.toLowerCase() === "add") {
        newValue = round6(oldValue + amount);
      } else {
        if (amount > oldValue) {
          return res
            .status(400)
            .json({ message: "Delete amount exceeds current credit limit." });
        }
        newValue = round6(oldValue - amount);
      }
    } 
    else {
      return res.status(400).json({ message: "Invalid account type" });
    }

    // 📝 clean description (6 decimals guaranteed)
    const finalDescription =
      `${description} | Old ${updateColumn}: ${oldValue} | New ${updateColumn}: ${newValue}`;

    // 🧾 insert refill record
    const [result] = await billingDb.query(
      `INSERT INTO refill 
       (user, credit, description, add_delete, date, del_status) 
       VALUES (?, ?, ?, ?, NOW(), 0)`,
      [user, amount, finalDescription, add_delete]
    );

    // 💾 update user balance / credit limit
    await billingDb.query(
      `UPDATE user 
       SET ${updateColumn} = ? 
       WHERE id = ? AND (del_status = 0 OR del_status IS NULL)`,
      [newValue, account.id]
    );

    // ✅ response
    res.json({
      id: result.insertId,
      user,
      credit: amount,
      add_delete,
      description: finalDescription,
      oldValue,
      updatedValue: newValue,
      updatedColumn: updateColumn,
      date: new Date(),
    });

  } catch (err) {
    console.error("❌ Failed to add refill:", err);
    res.status(500).json({ message: "Failed to add refill" });
  }
});


//----------------------------------------------------------------------------------------------

bill.post("/refills/bulk-add", authenticate(), async (req, res) => {
  try {
    const { refills } = req.body;

    if (!Array.isArray(refills) || refills.length === 0) {
      return res.status(400).json({ message: "No refill data provided." });
    }

    const results = [];

    for (const refill of refills) {
      try {
        const { user, credit, description, add_delete } = refill;
        const amount = Number(credit);

        if (isNaN(amount) || amount <= 0) {
          results.push({ user, success: false, error: "Invalid amount" });
          continue;
        }

        const [users] = await billingDb.query(
          `SELECT id, Typeofaccount, balance, Creditlimit 
           FROM user 
           WHERE (username = ? OR id = ?) 
             AND (del_status = 0 OR del_status IS NULL)`,
          [user, user]
        );

        if (!users.length) {
          results.push({ user, success: false, error: "User not found" });
          continue;
        }

        const account = users[0];
        let updateColumn, newValue, oldValue;

        if (account.Typeofaccount?.toLowerCase() === "prepaid") {
          updateColumn = "balance";
          oldValue = Number(account.balance);
          if (add_delete.toLowerCase() === "add") {
            newValue = oldValue + amount;
          } else {
            if (amount > oldValue) {
              results.push({
                user,
                success: false,
                error: "Delete exceeds balance",
              });
              continue;
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
              results.push({
                user,
                success: false,
                error: "Delete exceeds credit limit",
              });
              continue;
            }
            newValue = oldValue - amount;
          }
        } else {
          results.push({ user, success: false, error: "Invalid account type" });
          continue;
        }

        const finalDescription = `${description} | Old ${updateColumn}: ${oldValue}`;

        const [insert] = await billingDb.query(
          `INSERT INTO refill (user, credit, description, add_delete, date, del_status)
           VALUES (?, ?, ?, ?, NOW(), 0)`,
          [user, amount, finalDescription, add_delete]
        );

        await billingDb.query(
          `UPDATE user SET ${updateColumn} = ? WHERE id = ?`,
          [newValue, account.id]
        );

        results.push({
          user,
          success: true,
          id: insert.insertId,
          add_delete,
          updatedColumn: updateColumn,
          oldValue,
          updatedValue: newValue,
        });
      } catch (innerErr) {
        console.error(`Error for user ${refill.user}:`, innerErr);
        results.push({
          user: refill.user,
          success: false,
          error: "Internal processing error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({
      message: `Bulk ${successCount > 0 ? "action" : "operation"} completed`,
      successCount,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("Failed bulk add:", err);
    res.status(500).json({ message: "Failed to perform bulk operation" });
  }
});

//------------------------------------------------------------------------------------

bill.delete("/refills/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await billingDb.query(
      "UPDATE refill SET del_status = 1 WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Refill not found or already deleted" });
    }

    res.json({ message: "Refill deleted successfully" });
  } catch (err) {
    console.error("Failed to delete refill:", err);
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


bill.get("/trunks/check-username/:username", authenticate(), async (req, res) => {
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
});

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
        const hostOnly = rows.find(r => !r.addprefix || r.addprefix === "");
        if (hostOnly) conflictMsg = "❌ Same Host not allowed!";
      } else {
        // Host exists with same prefix
        const samePrefix = rows.find(r => r.addprefix === addprefix);
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

    // 🔥 ACTIVITY LOG
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
from_user=${type === "User" ? username : trunkname}
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
       SET routeid=?, trunkname=?, type=?, username=?, password=?, host=?, 
           addprefix=?, codec=?, status=?, port=? 
       WHERE id=? AND del_status != 1`,
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
        const regex = new RegExp(
          `\\[${pat}\\][\\s\\S]*?(?=\\n\\[|$)`,
          "gi"
        );
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
from_user=${username || trunkname}
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

    const [rows] = await billingDb.query(
      "SELECT * FROM trunk WHERE id = ? AND del_status != 1",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Trunk not found" });
    }

    const trunk = rows[0];

    await billingDb.query("UPDATE trunk SET del_status = 1 WHERE id = ?", [id]);

    // 🔥 ACTIVITY LOG
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
    // 1. Active users (status = active)
    const [activeUsersRows] = await billingDb.query(
      "SELECT COUNT(*) AS count FROM `user` WHERE LOWER(`status`) = 'active' AND (`del_status` = 0 OR `del_status` IS NULL) AND `group` = 1"
    );

    // 2. Live calls (from onlinecalls table)
    const [liveCallsRows] = await billingDb.query(
      "SELECT COUNT(*) as count FROM onlinecalls"
    );

    // 3. Today’s total calls (use latest date if no record for today)
    const [totalCallsRows] = await billingDb.query(`
SELECT SUM(total_calls) as count
FROM daywise_calls
WHERE DATE(timestamp) = CURDATE();

    `);

    // 4. Monthly recharge (sum of credits from refill table for this month)
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

    // ADMIN = margin
    // CLIENT = sellcost
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
    }

    else {
      return res.status(400).json({ message: "Invalid filter" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);

  } catch (err) {
    console.error("Revenue fetch error:", err);
    res.status(500).json({ message: "Failed to fetch revenue data" });
  }
});


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
    }

    else {
      return res.status(400).json({ message: "Invalid filter" });
    }

    const [rows] = await billingDb.query(query, params);
    res.json(rows);

  } catch (err) {
    console.error("ASR/ACR fetch error:", err);
    res.status(500).json({ message: "Failed to fetch ASR/ACR data" });
  }
});

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
    const { type, date } = req.query; // type = "month" | "day", date = optional filter

    let query = "";
    let values = [];

    if (type === "day") {
      // daywise_call table
      query = `
        SELECT username, SUM(total_calls) AS totalCalls
        FROM daywise_calls
        WHERE DATE(timestamp) = ?
        GROUP BY username
        ORDER BY totalCalls DESC
        LIMIT 5
      `;
      values.push(date || new Date().toISOString().slice(0, 10)); // default today
    } else {
      // monthwise, from months_report table
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

// backend/routes/dashboard.js
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
        code: countryCodes[name]
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

    // Allowed fields
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
      "balance"
    ];

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {        // ❗ ignore fields not sent
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
    }

    else if (role === "client") {
      filters.push("username = ?");
      values.push(username);
    }

    else {
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
    }

    else if (role === "client") {
      filters.push("m.username = ?");
      values.push(username);
    }

    else {
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

//------------------------------------------------------------------------------------------------------

bill.get("/trunk-summary", authenticate(), async (req, res) => {
  try {
    const { trunk, from, to } = req.query;

    let query = `
      SELECT id, trunk_id, trunk, code, other_call, connected_calls, timestamp
      FROM trunks_performance
    `;
    const filters = [];
    const values = [];

    if (trunk) {
      filters.push("trunk = ?");
      values.push(trunk);
    }

    if (from) {
      filters.push("DATE(timestamp) >= ?");
      values.push(from);
    }

    if (to) {
      filters.push("DATE(timestamp) <= ?");
      values.push(to);
    }

    if (filters.length) {
      query += " WHERE " + filters.join(" AND ");
    }

    query += " ORDER BY id DESC";
    const [rows] = await billingDb.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching trunk summary:", err);
    res.status(500).json({ message: "Failed to fetch trunk summary" });
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
    const [row] = await billingDb.query(
      "SELECT * FROM block WHERE id = ?",
      [insert.insertId]
    );

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

    const [rows] = await billingDb.query(
      "SELECT * FROM block WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Block record not found" });
    }

    await billingDb.query(
      "UPDATE block SET callerId = ?, status = ? WHERE id = ?",
      [callerId, status, id]
    );

    const [updated] = await billingDb.query(
      "SELECT * FROM block WHERE id = ?", [id]
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

    const [rows] = await billingDb.query(
      "SELECT * FROM block WHERE id = ?",
      [id]
    );

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

bill.get("/routemix/user/:user", authenticate(), async (req, res) => {
  try {
    const { user } = req.params;

    const [rows] = await billingDb.query(
      "SELECT * FROM routmix WHERE user = ? ORDER BY id DESC",
      [user]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user percentage info" });
  }
});


//------------------------------------------------------------------------------------------------------

bill.post("/routemix/batch-save", authenticate(), async (req, res) => {
  const conn = await billingDb.getConnection();
  try {
    const { user, trunks } = req.body;
    if (!user || !Array.isArray(trunks)) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    for (const t of trunks) {
      if (!t.route_name || (t.percentage === undefined || t.percentage === null)) {
        return res.status(400).json({ message: "Each trunk must have route_name and percentage" });
      }
      if (!Number.isInteger(Number(t.percentage))) {
        return res.status(400).json({ message: "Percentage must be integer (10,20,...100)" });
      }
    }

    const total = trunks.reduce((s, t) => s + Number(t.percentage), 0);
    if (total !== 100) {
      return res.status(400).json({ message: "Total percentage must be exactly 100" });
    }

    await conn.beginTransaction();

    await conn.query("DELETE FROM routmix WHERE `user` = ?", [user]);

    const insertSql = "INSERT INTO routmix (route_name, `user`, percentage, status) VALUES (?,?,?,?)";
    for (const t of trunks) {
      const st = t.status !== undefined ? t.status : 1;
      await conn.query(insertSql, [t.route_name, user, Number(t.percentage), st]);
    }

    await conn.commit();
    conn.release();

    res.json({ message: "Saved successfully" });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { }
    conn.release && conn.release();
    console.error("BATCH SAVE ERROR:", err);
    res.status(500).json({ message: "Failed to save batch" });
  }
});


//------------------------------------------------------------------------------------------------------

bill.put("/routemix/:id", authenticate(), async (req, res) => {
  try {
    const { id } = req.params;
    const { route_name, user, percentage, status } = req.body;

    const percent = Number(percentage);

    const [rows] = await billingDb.query(
      "SELECT percentage FROM routmix WHERE user = ? AND id != ?",
      [user, id]
    );

    const existingTotal = rows.reduce((sum, r) => sum + Number(r.percentage), 0);

    if (existingTotal + percent !== 100) {
      return res.status(400).json({
        message: `Total must be 100%. Currently: ${existingTotal}, Required: ${100 - existingTotal}`,
      });
    }

    await billingDb.query(
      "UPDATE routmix SET route_name=?, user=?, percentage=?, status=? WHERE id=?",
      [route_name, user, percent, status, id]
    );

    res.json({ id, route_name, user, percentage, status });
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


//------------------------------------------------------------------------------------------------------


const PORT = process.env.PORT || 5000;
const options = {
  cert: fs.readFileSync("/etc/apache2/ssl.crt/viciphone.crt"),
  key: fs.readFileSync("/etc/apache2/ssl.key/viciphone.key"),
};

https.createServer(options, bill).listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});
