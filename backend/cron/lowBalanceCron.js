require("dotenv").config({ path: "/home/ubuntu/Telephony_Backend/.env" });
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");

const billingDb = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  // Enable debug outputs
  debug: true,
  logger: true,
});

async function sendEmail(toEmail, subject, html) {
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

async function checkLowBalance() {
  try {
    console.log("Checking low balance users...");

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

      if (u.email) {
        const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f7f7f7; padding:20px;">
    <div style="max-width:600px; margin:auto; background:white; border-radius:8px; padding:25px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">

      <h2 style="color:#333; margin-bottom:10px;">Account Balance Alert</h2>
      
      <p style="font-size:15px; color:#555;">
        Hello <b>${u.username}</b>,
      </p>

      <p style="font-size:15px; color:#555;">
        We hope you're doing well. This is a friendly reminder that your account balance has dropped below the minimum threshold.
      </p>

      <div style="margin:20px 0; padding:15px; background:#f0f4ff; border-left:4px solid #3b82f6; border-radius:4px;">
        <p style="margin:0; font-size:16px; color:#333;">
          <b>Current Balance:</b> <span style="color:#d32f2f;">${value}</span>
        </p>
      </div>

      <p style="font-size:15px; color:#555;">
        To avoid service interruptions, please recharge or update your credit as soon as possible.
      </p>

      <a href="https://yourbillingportal.com/login"
         style="display:inline-block; margin-top:15px; background:#3b82f6; color:white; padding:12px 20px; 
         text-decoration:none; border-radius:5px; font-size:15px;">
         Recharge Now
      </a>

      <p style="margin-top:25px; font-size:14px; color:#777;">
        If you have already made the payment, please ignore this email.
      </p>

      <hr style="margin:25px 0; border:none; border-top:1px solid #eee;">

      <p style="font-size:13px; color:#888; text-align:center;">
        Regards,<br/> 
        <b>Billing Team</b><br/>
        Next2Call Telephony Systems
      </p>

    </div>
  </div>
`;

        await sendEmail(u.email, "Low Balance Warning", html);
        console.log("Email sent to:", u.email);
      }

      notified.push(u.username);
    }

    console.log("Notified users:", notified);
    process.exit(0);
  } catch (err) {
    console.error("Cron job error:", err);
    process.exit(1);
  }
}

checkLowBalance();
