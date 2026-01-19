const jwt = require("jsonwebtoken");
const db = require("../models/db");
const JWT_SECRET = "0987654321";
const nodemailer = require("nodemailer");
const axios = require("axios");

function sendOTPToEmail(admin_email, otp) {
  const transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    logger: true,
    debug: true,
    connectionTimeout: 10000,
  });

  const mailOptions = {
    from: '"Next2Call Support" <ringfy@next2call.com>',
    to: admin_email,
    subject: "Your One-Time Password (OTP) - Next2Call",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2e7d32;">Your OTP Code</h2>
        <p>Hello,</p>
        <p>Your One-Time Password (OTP) for verification is:</p>
        <p style="font-size: 24px; font-weight: bold; color: #000;">${otp}</p>
        <p>This OTP is valid for the next 60 seconds.</p>
        <p>If you did not request this, please ignore this email.</p>
        <br/>
        <p style="color: #777;">Thanks,<br/>Next2Call Team</p>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.error("[EMAIL ❌] Failed to send:", error);
    } else {
    }
  });
}

async function sendOTPToSMS(admin_mobile, otp) {
  const username = process.env.PGAPI_USERNAME;
  const password = process.env.PGAPI_PASSWORD;
  const from = "WINETT";
  const dltContentId = "1707167894831608941";

  const message = `Your login OTP is "${otp}" signature UFFXBQpzr47 team winet.`;

  const url = `https://pgapi.vispl.in/fe/api/v1/send?username=${username}&password=${password}&unicode=false&from=${from}&to=${admin_mobile}&text=${encodeURIComponent(
    message
  )}&dltContentId=${dltContentId}`;

  try {
    const response = await axios.get(url);
  } catch (error) {
    console.error(
      "❌ SMS sending failed:",
      error.response?.data || error.message
    );
  }
}

function formatMySQLDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

exports.login = (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password) {
    return res
      .status(400)
      .json({ message: "User ID and password are required." });
  }

  const query = "SELECT * FROM users WHERE user_id = ?";
  db.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = results[0];

    if (user.status === "inactive") {
      return res
        .status(403)
        .json({ message: "Account is inactive. Contact administrator." });
    }

    if (password !== user.password) {
      return res.status(401).json({ message: "Invalid password." });
    }

    // ------------------- OTP Logic (unchanged) -------------------
    if (user.user_type == 8 || user.user_type == 9) {
      const now = formatMySQLDateTime(new Date());

      if (!user.otp || new Date(user.otp_expiry) < now) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);
        const expiryFormatted = formatMySQLDateTime(expiry);

        console.log(
          `[OTP] Generating new OTP for user_id=${user_id}, OTP=${otp}`
        );

        const updateQuery =
          "UPDATE users SET otp = ?, otp_expiry = ? WHERE user_id = ?";
        db.query(
          updateQuery,
          [otp, expiryFormatted, user.user_id],
          (updateErr) => {
            if (updateErr) {
              console.error("Failed to save OTP:", updateErr);
              return res
                .status(500)
                .json({ message: "Failed to generate OTP." });
            }

            const channel = "email,sms";
            const destination = `${user.admin_email},${user.admin_mobile}`;
            const logQuery = `
              INSERT INTO otp_logs 
                (user_id, otp_code, channel, destination, request_time, expire_time, resend_count, attempts, status)
              VALUES (?, ?, ?, ?, NOW(), ?, 0, 0, 'sent')
            `;
            db.query(
              logQuery,
              [user.user_id, otp, channel, destination, expiryFormatted],
              (logErr) => {
                if (logErr) {
                  console.error("OTP log insert error:", logErr);
                }
              }
            );

            sendOTPToEmail(user.admin_email, otp);
            sendOTPToSMS(user.admin_mobile, otp);

            const role = user.user_type == 8 ? "admin" : "superadmin";

            const token = jwt.sign(
              {
                userId: user.user_id,
                userType: user.user_type,
                role,
                admin: user.admin,
                password: user.password,
              },
              JWT_SECRET
            );

            const campaigns = user.campaigns_id
              ? user.campaigns_id.split(",")
              : [];

            return res.status(200).json({
              message: "OTP sent to email and phone.",
              otpRequired: true,
              token,
              user: {
                id: user.id,
                user_id: user.user_id,
                full_name: user.full_name,
                user_type: user.user_type,
                admin: user.admin,
                password: user.password,
                campaign_id: user.campaigns_id,
                admin_logo: user.admin_logo,
                role,
              },
              campaigns,
            });
          }
        );
        return;
      } else {
        const role = user.user_type == 8 ? "admin" : "superadmin";
        const token = jwt.sign(
          {
            userId: user.user_id,
            userType: user.user_type,
            role,
            admin: user.admin,
            password: user.password,
          },
          JWT_SECRET
        );

        const campaigns = user.campaigns_id ? user.campaigns_id.split(",") : [];

        return res.status(200).json({
          message: "OTP already sent, please use the existing OTP.",
          otpRequired: true,
          token,
          user: {
            id: user.id,
            user_id: user.user_id,
            full_name: user.full_name,
            user_type: user.user_type,
            admin: user.admin,
            password: user.password,
            campaign_id: user.campaigns_id,
            admin_logo: user.admin_logo,
            role,
          },
          campaigns,
        });
      }
    }

    // ------------------- Role Handling -------------------
    const role =
      user.user_type == 8
        ? "admin"
        : user.user_type == 9
        ? "superadmin"
        : user.user_type == 7
        ? "manager"
        : user.user_type == 6
        ? "quality_analyst"
        : user.user_type == 5
        ? "it"
        : user.user_type == 2
        ? "team_leader"
        : "agent";

    const token = jwt.sign(
      {
        userId: user.user_id,
        userType: user.user_type,
        role,
        admin: user.admin,
        password: user.password,
      },
      JWT_SECRET
    );

    const campaigns = user.campaigns_id ? user.campaigns_id.split(",") : [];
    const logInTime = formatMySQLDateTime(new Date());

    const logQuery = `
      INSERT INTO login_log (user_name, log_in_time, status, campaign_name, admin, user_type, token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        log_out_time = NULL, 
        status = 1, 
        log_in_time = VALUES(log_in_time),
        token = VALUES(token)
    `;

    const permissionUserTypes = [8, 7, 2, 1];
    const getPermissions = (callback) => {
      if (!permissionUserTypes.includes(user.user_type)) {
        return callback(null, {});
      }

      const permQuery = `SELECT * FROM admin_permissions WHERE admin_id = ?`;
      db.query(permQuery, [user.user_id], (permErr, permResults) => {
        if (permErr) return callback(permErr);
        callback(null, permResults[0] || {});
      });
    };

    getPermissions((permErr, permissions) => {
      if (permErr) {
        console.error("Permission fetch error:", permErr);
        return res.status(500).json({ message: "Error loading permissions." });
      }

      db.query(
        logQuery,
        [
          user_id,
          logInTime,
          1,
          campaigns.join(","),
          user.admin,
          user.user_type,
          token,
        ],
        (logErr) => {
          if (logErr) {
            console.error("Error inserting into login_log:", logErr);
            return res
              .status(500)
              .json({ message: "Error logging user login." });
          }

          const now = formatMySQLDateTime(new Date());

          // ✅ Step 1: Delete yesterday's records
          const deleteOldQuery = `
            DELETE FROM agent_live_report 
            WHERE agent_id = ? AND DATE(login_time) < CURDATE()
          `;
          db.query(deleteOldQuery, [user.user_id], (deleteErr) => {
            if (deleteErr) {
              console.error("Error deleting old agent_live_report:", deleteErr);
            }

            // ✅ Step 2: Check if logged in today
            const checkLiveReportQuery = `
              SELECT * FROM agent_live_report 
              WHERE agent_id = ? AND DATE(login_time) = CURDATE()
            `;
            db.query(checkLiveReportQuery, [user.user_id], (err, rows) => {
              if (err) {
                console.error("Error checking agent_live_report:", err);
              } else if (rows.length === 0) {
                // First login today → insert new row
                const insertLiveReportQuery = `
INSERT INTO agent_live_report (
  admin_id, agent_id, login_time, wait_for_next_call, No_of_login, login_hour, 
  agent_status, login_campaignid, login_network_ip, login_place, agent_break_no,
  agent_break_name, agent_every_break_duration,
  today_total_calls, today_busy_calls, today_answered_calls, today_cancelled_calls, 
  today_noanswer_calls, today_other_calls, today_outbound_calls, today_inbound_calls, 
  today_answered_duration, take_call_mobile, mobile_no, agent_priorty, call_record_status,
  wrapup
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
                db.query(
                  insertLiveReportQuery,
                  [
                    user.admin, // 1
                    user.user_id, // 2
                    now, // 3
                    now, // 4
                    1, // 5
                    0, // 6
                    1, // 7
                    user.campaigns_id || "", // 8
                    req.ip || "", // 9
                    "", // 10 login_place
                    0, // 11 agent_break_no
                    "", // 12 agent_break_name
                    0, // 13 agent_every_break_duration
                    0, // 14 today_total_calls
                    0, // 15 today_busy_calls
                    0, // 16 today_answered_calls
                    0, // 17 today_cancelled_calls
                    0, // 18 today_noanswer_calls
                    0, // 19 today_other_calls
                    0, // 20 today_outbound_calls
                    0, // 21 today_inbound_calls
                    0, // 22 today_answered_duration
                    "", // 23 take_call_mobile
                    "", // 24 mobile_no
                    "", // 25 agent_priorty
                    0, // 26 call_record_status
                    0, // 27 wrapup ✅ added here
                  ],
                  (insertErr) => {
                    if (insertErr) {
                      console.error(
                        "Error inserting into agent_live_report:",
                        insertErr
                      );
                    }
                  }
                );
              } else {
                // Already logged in today → update row
                const updateLiveReportQuery = `
                  UPDATE agent_live_report
                  SET No_of_login = No_of_login + 1,
                      agent_status = 1,
                      wait_for_next_call = ?,
                      wrapup = 0
                  WHERE agent_id = ? AND DATE(login_time) = CURDATE()
                `;
                db.query(
                  updateLiveReportQuery,
                  [now, user.user_id],
                  (updateErr) => {
                    if (updateErr) {
                      console.error(
                        "Error updating agent_live_report:",
                        updateErr
                      );
                    }
                  }
                );
              }
            });
          });

          return res.json({
            message: "Login successful.",
            token,
            user: {
              id: user.id,
              user_id: user.user_id,
              full_name: user.full_name,
              user_type: user.user_type,
              admin: user.admin,
              password: user.password,
              campaign_id: user.campaigns_id,
              admin_logo: user.admin_logo,
              role,
            },
            campaigns,
            permissions,
          });
        }
      );
    });
  });
};

exports.verifyAdminOTP = (req, res) => {
  const { user_id, otp } = req.body;

  if (!user_id || !otp) {
    return res.status(400).json({ message: "User ID and OTP are required." });
  }

  const query = "SELECT * FROM users WHERE user_id = ? AND user_type IN (8, 9)";
  db.query(query, [user_id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(400).json({ message: "Invalid admin." });
    }

    const user = results[0];
    const channel = "email,sms";
    const destination = `${user.admin_email},${user.admin_mobile}`;

    // ✅ Get last OTP log for attempt counting
    const getLastLog = `
      SELECT id, attempts 
      FROM otp_logs 
      WHERE user_id = ? 
      ORDER BY id DESC LIMIT 1
    `;
    db.query(getLastLog, [user_id], (logErr, logRows) => {
      let attempts = 1;

      if (logErr) {
        console.error("Error fetching OTP logs:", logErr);
      }

      if (logRows && logRows.length > 0) {
        attempts = logRows[0].attempts + 1;
      }

      // ---- Expired or not generated ----
      if (
        !user.otp ||
        !user.otp_expiry ||
        new Date(user.otp_expiry) < new Date()
      ) {
        if (logRows.length > 0) {
          db.query("UPDATE otp_logs SET status = 'expired' WHERE id = ?", [
            logRows[0].id,
          ]);
        }

        const insertExpire = `
          INSERT INTO otp_logs 
            (user_id, otp_code, channel, destination, request_time, expire_time, resend_count, attempts, status, last_attempt_time)
          VALUES (?, ?, ?, ?, NOW(), NOW(), 0, ?, 'expired', NOW())
        `;
        db.query(insertExpire, [user_id, otp, channel, destination, attempts]);

        return res
          .status(401)
          .json({ message: "OTP expired or not generated." });
      }

      // ---- Wrong OTP ----
      if (user.otp !== otp) {
        if (logRows.length > 0) {
          db.query("UPDATE otp_logs SET status = 'failed' WHERE id = ?", [
            logRows[0].id,
          ]);
        }

        const insertFail = `
          INSERT INTO otp_logs 
            (user_id, otp_code, channel, destination, request_time, expire_time, resend_count, attempts, status, last_attempt_time)
          VALUES (?, ?, ?, ?, NOW(), ?, 0, ?, 'failed', NOW())
        `;
        db.query(insertFail, [
          user_id,
          otp,
          channel,
          destination,
          formatMySQLDateTime(user.otp_expiry),
          attempts,
        ]);

        return res.status(401).json({ message: "Invalid OTP." });
      }

      // ---- Correct OTP ----
      db.query(
        "UPDATE users SET otp = NULL, otp_expiry = NULL WHERE user_id = ?",
        [user_id]
      );

      if (logRows.length > 0) {
        db.query("UPDATE otp_logs SET status = 'verified' WHERE id = ?", [
          logRows[0].id,
        ]);
      }

      const insertVerify = `
        INSERT INTO otp_logs 
          (user_id, otp_code, channel, destination, request_time, expire_time, resend_count, attempts, status, verified_at, last_attempt_time)
        VALUES (?, ?, ?, ?, NOW(), NOW(), 0, ?, 'verified', NOW(), NOW())
      `;
      db.query(insertVerify, [user_id, otp, channel, destination, attempts]);

      // ---- JWT + login log ----
      const role = user.user_type == 8 ? "admin" : "superadmin";
      const token = jwt.sign(
        {
          userId: user.user_id,
          userType: user.user_type,
          role,
          admin: user.admin,
          password: user.password,
        },
        JWT_SECRET
      );

      const logInTime = new Date();
      const logQuery = `
        INSERT INTO login_log (user_name, log_in_time, status, campaign_name, admin, user_type, token)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          log_out_time = NULL, 
          status = 1, 
          log_in_time = VALUES(log_in_time),
          token = VALUES(token)
      `;

      db.query(
        logQuery,
        [
          user_id,
          logInTime,
          1,
          user.campaigns_id || "",
          user.admin,
          user.user_type,
          token,
        ],
        (logErr) => {
          if (logErr) {
            console.error("Login log insert error:", logErr);
            return res.status(500).json({ message: "Login failed after OTP." });
          }

          return res.json({
            message: "Login successful.",
            token,
            user: {
              id: user.id,
              user_id: user.user_id,
              full_name: user.full_name,
              user_type: user.user_type,
              admin: user.admin,
              password: user.password,
              campaign_id: user.campaigns_id,
              role,
            },
            campaigns: user.campaigns_id ? user.campaigns_id.split(",") : [],
          });
        }
      );
    });
  });
};

// ✅ Helper function for MySQL datetime
function formatMySQLDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

exports.resendOtp = (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res
      .status(400)
      .json({ success: false, message: "User ID is required." });
  }

  // ✅ Only allow Admin (8) & Superadmin (9)
  const query = "SELECT * FROM users WHERE user_id = ? AND user_type IN (8, 9)";
  db.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }

    if (results.length === 0) {
      return res.status(403).json({
        success: false,
        message: "OTP resend allowed only for Admin and Superadmin.",
      });
    }

    const user = results[0];

    // ✅ Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
    const expiryFormatted = formatMySQLDateTime(expiry);

    // ✅ Update OTP in users table
    const updateQuery =
      "UPDATE users SET otp = ?, otp_expiry = ? WHERE user_id = ?";
    db.query(updateQuery, [otp, expiryFormatted, user_id], (updateErr) => {
      if (updateErr) {
        console.error("Failed to update OTP:", updateErr);
        return res
          .status(500)
          .json({ success: false, message: "Failed to update OTP." });
      }
      const getLastLog = `
        SELECT resend_count, id 
        FROM otp_logs 
        WHERE user_id = ? 
        ORDER BY id DESC LIMIT 1
      `;
      db.query(getLastLog, [user_id], (logErr, logRows) => {
        let resendCount = 1;

        if (logErr) {
          console.error("Error fetching last OTP log:", logErr);
        }

        if (logRows && logRows.length > 0) {
          resendCount = logRows[0].resend_count + 1;

          // Mark previous OTP as expired
          db.query("UPDATE otp_logs SET status = 'expired' WHERE id = ?", [
            logRows[0].id,
          ]);
        }

        const channel = "email,sms";
        const destination = `${user.admin_email},${user.admin_mobile}`;

        const insertLog = `
          INSERT INTO otp_logs 
            (user_id, otp_code, channel, destination, request_time, expire_time, resend_count, attempts, status)
          VALUES (?, ?, ?, ?, NOW(), ?, ?, 0, 'resent')
        `;
        db.query(
          insertLog,
          [user_id, otp, channel, destination, expiryFormatted, resendCount],
          (insErr) => {
            if (insErr) {
              console.error("Failed to insert OTP log:", insErr);
            }
          }
        );

        // ✅ Send OTP
        sendOTPToEmail(user.admin_email, otp);
        sendOTPToSMS(user.admin_mobile, otp);

        return res.json({
          success: true,
          message: "OTP resent successfully.",
          resendCount,
          otpSentTo: {
            email: user.admin_email,
            mobile: user.admin_mobile,
          },
        });
      });
      // =========================
      // 🔥 MODIFIED PART END
      // =========================
    });
  });
};

exports.selectCampaign = (req, res) => {
  const { user_id, campaign_id } = req.body;

  if (!user_id || !campaign_id) {
    return res
      .status(400)
      .json({ message: "User ID and campaign ID are required." });
  }

  const logInTime = new Date();

  const updateBreakQuery = `
    INSERT INTO break_time (user_name, break_name, start_time, break_status, status, campaign_id)
    VALUES (?, 'Ready', ?, '2', '2', ?)
    ON DUPLICATE KEY UPDATE 
      campaign_id = VALUES(campaign_id), 
      status = '2', 
      start_time = VALUES(start_time)
  `;

  const updateLoginLogQuery = `
    UPDATE login_log 
    SET campaign_name = ?, log_in_time = ?
    WHERE id = (
      SELECT id FROM (
        SELECT id 
        FROM login_log 
        WHERE user_name = ? AND status = 1 
        ORDER BY log_in_time DESC 
        LIMIT 1
      ) AS latest
    )
  `;

  db.query(updateBreakQuery, [user_id, logInTime, campaign_id], (err) => {
    if (err) {
      console.error("Error updating break_time:", err);
      return res
        .status(500)
        .json({ message: "Error updating campaign selection." });
    }

    db.query(
      updateLoginLogQuery,
      [campaign_id, logInTime, user_id],
      (logErr) => {
        if (logErr) {
          console.error("Error updating login_log with campaign:", logErr);
          return res
            .status(500)
            .json({ message: "Campaign update failed in login_log." });
        }

        res.json({ success: true, message: "Campaign updated successfully." });
      }
    );
  });
};

exports.updateBreak = (req, res) => {
  const {
    user_id,
    break_type,
    campaign_id,
    press_key = "",
    agent_priority = "",
    take_call_mobile = "",
  } = req.body;

  if (!user_id || !break_type) {
    return res.status(400).json({ message: "Missing parameters." });
  }

  const date_time = new Date();
  const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const selectQuery = `
    SELECT * FROM break_time 
    WHERE user_name = ? 
    ORDER BY id DESC LIMIT 1`;

  db.query(selectQuery, [user_id], (err, result) => {
    if (err) {
      console.error("Error fetching break time:", err);
      return res.status(500).json({ message: "Database error." });
    }

    let lastCampaignId = campaign_id;

    if (result.length > 0) {
      const lastBreak = result[0];
      lastCampaignId = lastBreak.campaign_id;

      const startTime = new Date(lastBreak.start_time);
      const breakDuration = Math.abs(date_time - startTime) / 1000;
      const hours = Math.floor(breakDuration / 3600);
      const minutes = Math.floor((breakDuration % 3600) / 60);
      const seconds = Math.floor(breakDuration % 60);
      const formattedDuration = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

      const updateQuery = `
        UPDATE break_time 
        SET break_duration = ?, end_time = ?, break_status = '2', status = '1' 
        WHERE id = ?`;

      db.query(
        updateQuery,
        [formattedDuration, date_time, lastBreak.id],
        (updateErr) => {
          if (updateErr) {
            console.error("Error updating break time:", updateErr);
            return res
              .status(500)
              .json({ message: "Error updating break time." });
          }

          // ✅ Update agent_live_report for TODAY only
          const selectAgentQuery = `
            SELECT agent_break_no, agent_break_name, agent_every_break_duration
            FROM agent_live_report
            WHERE agent_id = ? AND DATE(login_time) = ?`;

          db.query(
            selectAgentQuery,
            [user_id, todayDate],
            (selectAgentErr, agentResult) => {
              if (selectAgentErr) {
                console.error(
                  "Error fetching agent_live_report:",
                  selectAgentErr
                );
                return res
                  .status(500)
                  .json({ message: "Error fetching agent live report." });
              }

              if (agentResult.length > 0) {
                const agentData = agentResult[0];
                const currentBreakNo = Number(agentData.agent_break_no) || 0;
                const currentBreakName = agentData.agent_break_name || "";
                const currentBreakDuration =
                  agentData.agent_every_break_duration || "";

                const newBreakNo = currentBreakNo + 1;
                const newBreakName = currentBreakName
                  ? `${currentBreakName},${break_type}`
                  : break_type;
                const newBreakDuration = currentBreakDuration
                  ? `${currentBreakDuration},${formattedDuration}`
                  : formattedDuration;

                // ✅ Decide agent_status (1 = Ready, 2 = Break)
                const newAgentStatus = break_type === "Ready" ? 1 : 2;

                const updateAgentQuery = `
                  UPDATE agent_live_report
                  SET 
                    agent_break_no = ?,
                    agent_break_name = ?,
                    agent_every_break_duration = ?,
                    agent_status = ?
                  WHERE agent_id = ? AND DATE(login_time) = ?`;

                db.query(
                  updateAgentQuery,
                  [
                    newBreakNo,
                    newBreakName,
                    newBreakDuration,
                    newAgentStatus,
                    user_id,
                    todayDate,
                  ],
                  (agentUpdateErr) => {
                    if (agentUpdateErr) {
                      console.error(
                        "Error updating agent_live_report:",
                        agentUpdateErr
                      );
                      return res.status(500).json({
                        message: "Error updating agent live report.",
                      });
                    }

                    // ✅ Insert new break_time row
                    const insertQuery = `
                      INSERT INTO break_time 
                      (user_name, break_name, start_time, break_status, status, campaign_id, press_key, agent_priorty, take_call_mobile)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                    db.query(
                      insertQuery,
                      [
                        user_id,
                        break_type,
                        date_time,
                        "2", // break_status fixed as 2
                        break_type === "Ready" ? "2" : "1", // status changes
                        lastCampaignId,
                        press_key,
                        agent_priority,
                        take_call_mobile,
                      ],
                      (insertErr) => {
                        if (insertErr) {
                          console.error(
                            "Error inserting break time:",
                            insertErr
                          );
                          return res.status(500).json({
                            message: "Error inserting new break time.",
                          });
                        }

                        res.json({
                          message: `Break (${break_type}) started. Agent report updated for today.`,
                        });
                      }
                    );
                  }
                );
              } else {
                return res
                  .status(404)
                  .json({ message: "No agent_live_report found for today." });
              }
            }
          );
        }
      );
    } else {
      return res
        .status(404)
        .json({ message: "No previous break entry found." });
    }
  });
};

exports.getBreakStatus = (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  const query = `
      SELECT break_name FROM break_time 
      WHERE user_name = ? 
      ORDER BY id DESC LIMIT 1`;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ message: "Internal server error." });
    }

    if (results.length > 0) {
      res.json({ break_type: results[0].break_name });
    } else {
      res.json({ break_type: null });
    }
  });
};
//------------------------------------------------ LOGOUT API ---------------------------------------------------------------------

exports.logout = (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: "User ID is required." });
  }

  const logOutTime = new Date();
  const formattedLogout = formatMySQLDateTime(logOutTime); // YYYY-MM-DD HH:MM:SS

  // 1️⃣ Close active login_log session
  const updateLogQuery = `
    UPDATE login_log 
    SET log_out_time = ?, status = 2, token = NULL
    WHERE user_name = ? AND status = 1
  `;

  db.query(updateLogQuery, [formattedLogout, user_id], (logErr, logResult) => {
    if (logErr) {
      console.error("Error updating logout in login_log:", logErr);
      return res.status(500).json({ message: "Error logging out user." });
    }

    // 2️⃣ Update any pending break_time entries
    const updateBreakQuery = `
      UPDATE break_time 
      SET break_status = 1, status = 1
      WHERE user_name = ? AND break_status != 1
    `;
    db.query(updateBreakQuery, [user_id], (breakErr) => {
      if (breakErr) {
        console.error("Error updating break status:", breakErr);
      }
    });

    // 3️⃣ Update agent_live_report (calculate login hours + mark logged out)
    const checkLiveReportQuery = `
      SELECT * FROM agent_live_report 
      WHERE agent_id = ? AND DATE(login_time) = CURDATE()
      ORDER BY login_time DESC LIMIT 1
    `;
    db.query(checkLiveReportQuery, [user_id], (err, rows) => {
      if (err) {
        console.error("Error checking agent_live_report:", err);
        return res.status(500).json({ message: "Error during logout check." });
      }

      if (rows.length === 0) {
        // No session today, safe fallback
        return res.json({ message: "Logout recorded. No live session found." });
      }

      const loginRow = rows[0];
      const loginTime = new Date(loginRow.login_time);
      const existingHour = parseFloat(loginRow.login_hour || 0);

      const sessionHours = Math.abs(logOutTime - loginTime) / (1000 * 60 * 60);
      const totalHours = +(existingHour + sessionHours).toFixed(2);

      const updateLiveReportQuery = `
        UPDATE agent_live_report
        SET agent_status = 0, 
            login_hour = ?, 
            logout_time = ?
        WHERE id = ?
      `;
      db.query(
        updateLiveReportQuery,
        [totalHours, formattedLogout, loginRow.id],
        (updateErr) => {
          if (updateErr) {
            console.error("Error updating agent_live_report:", updateErr);
            return res.status(500).json({ message: "Logout update failed." });
          }

          return res.json({
            message: "Logout successful and agent live report updated.",
            sessionHours: sessionHours.toFixed(2),
            totalHours,
            logoutTime: formattedLogout, // return clean format
          });
        }
      );
    });
  });
};

exports.adminLogoutUser = (req, res) => {
  const { admin_id, user_id } = req.body;

  if (!admin_id || !user_id) {
    return res
      .status(400)
      .json({ message: "Admin ID and User ID are required." });
  }

  const logOutTime = new Date();
  const formattedLogout = formatMySQLDateTime(logOutTime);

  const getUserTypeQuery = `SELECT user_type FROM users WHERE user_id = ?`;

  db.query(getUserTypeQuery, [admin_id], (err, result) => {
    if (err) {
      console.error("Error fetching user type:", err);
      return res
        .status(500)
        .json({ message: "Server error while checking user role." });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Initiating user not found." });
    }

    const userType = result[0].user_type;

    let updateLogQuery = `
      UPDATE login_log 
      SET log_out_time = ?, status = 2, emg_log_out = 1, emg_log_out_time = ?, token = NULL
      WHERE status = 1 AND user_name = ?
    `;
    const params = [formattedLogout, formattedLogout, user_id];

    if (userType === "8" || userType === "9") {
      updateLogQuery += ` AND admin = ?`;
      params.push(admin_id);
    } else if (userType === "7" || userType === "2") {
      updateLogQuery += ` AND admin = (SELECT admin FROM users WHERE user_id = ? )`;
      params.push(admin_id);
    } else {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action." });
    }

    db.query(updateLogQuery, params, (err, result) => {
      if (err) {
        console.error("Error logging out user:", err);
        return res.status(500).json({ message: "Error logging out user." });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ message: "User not found or already logged out." });
      }

      // ✅ Now update agent_live_report with login_hour calculation
      const checkLiveReportQuery = `
        SELECT * FROM agent_live_report 
        WHERE agent_id = ? AND DATE(login_time) = CURDATE()
        ORDER BY login_time DESC LIMIT 1
      `;
      db.query(checkLiveReportQuery, [user_id], (err, rows) => {
        if (err) {
          console.error("Error checking agent_live_report:", err);
          return res.status(500).json({ message: "Error during logout check." });
        }

        if (rows.length === 0) {
          return res.json({ message: "Logout recorded. No live session found." });
        }

        const loginRow = rows[0];
        const loginTime = new Date(loginRow.login_time);
        const existingHour = parseFloat(loginRow.login_hour || 0);

        const sessionHours = Math.abs(logOutTime - loginTime) / (1000 * 60 * 60);
        const totalHours = +(existingHour + sessionHours).toFixed(2);

        const updateAgentStatusQuery = `
          UPDATE agent_live_report 
          SET agent_status = 0, 
              logout_time = ?, 
              login_hour = ?
          WHERE id = ?
        `;
        db.query(
          updateAgentStatusQuery,
          [formattedLogout, totalHours, loginRow.id],
          (err2) => {
            if (err2) {
              console.error("Error updating agent_live_report:", err2);
            }

            res.json({
              message: `User ${user_id} has been logged out by user ${admin_id}.`,
              sessionHours: sessionHours.toFixed(2),
              totalHours,
            });
          }
        );
      });
    });
  });
};


exports.adminLogoutAllUsers = (req, res) => {
  const { admin_id, admin_username } = req.body;

  if (!admin_id || !admin_username) {
    return res
      .status(400)
      .json({ message: "Admin ID and username are required." });
  }

  const logOutTime = new Date();
  const formattedLogout = formatMySQLDateTime(logOutTime);

  // 1️⃣ Update login_log
  const updateLogQuery = `
    UPDATE login_log 
    SET log_out_time = ?, 
        status = 2, 
        emg_log_out = 1, 
        emg_log_out_time = ?, 
        token = NULL
    WHERE status = 1 AND admin = ? AND user_name != ?
  `;

  db.query(
    updateLogQuery,
    [formattedLogout, formattedLogout, admin_id, admin_username],
    (err, result) => {
      if (err) {
        console.error("Error logging out users:", err);
        return res.status(500).json({ message: "Error logging out users." });
      }

      // 2️⃣ Update agent_live_report for all agents under admin
      const getLiveReportsQuery = `
        SELECT * FROM agent_live_report 
        WHERE admin_id = ? AND DATE(login_time) = CURDATE()
      `;
      db.query(getLiveReportsQuery, [admin_id], (err, rows) => {
        if (err) {
          console.error("Error fetching agent_live_report:", err);
          return res.status(500).json({ message: "Error fetching live reports." });
        }

        rows.forEach((row) => {
          const loginTime = new Date(row.login_time);
          const existingHour = parseFloat(row.login_hour || 0);

          const sessionHours = Math.abs(logOutTime - loginTime) / (1000 * 60 * 60);
          const totalHours = +(existingHour + sessionHours).toFixed(2);

          const updateAgentStatusQuery = `
            UPDATE agent_live_report
            SET agent_status = 0, 
                logout_time = ?, 
                login_hour = ?
            WHERE id = ?
          `;
          db.query(updateAgentStatusQuery, [formattedLogout, totalHours, row.id]);
        });

        res.json({
          message: `All agents under admin ${admin_id} have been logged out.`,
        });
      });
    }
  );
};

exports.emergencyReset = (req, res) => {
  const { superadmin_id } = req.body;

  if (!superadmin_id) {
    return res.status(400).json({ message: "Superadmin ID is required." });
  }

  const logOutTime = new Date();
  const formattedLogout = formatMySQLDateTime(logOutTime);

  // 1️⃣ Logout everyone who is active
  const forceLogoutQuery = `
    UPDATE login_log
    SET log_out_time = ?, status = 2, token = NULL
    WHERE status = 1
  `;

  db.query(forceLogoutQuery, [formattedLogout], (logoutErr) => {
    if (logoutErr) {
      console.error("Error force logging out users:", logoutErr);
      return res
        .status(500)
        .json({ message: "Error force logging out users." });
    }

    // 2️⃣ Update all agent_live_report sessions (set logout + reset status)
    const updateAgentReportQuery = `
      UPDATE agent_live_report
      SET agent_status = 0,
          logout_time = ?,
          login_hour = login_hour
    `;
    db.query(updateAgentReportQuery, [formattedLogout], (updateErr) => {
      if (updateErr) {
        console.error("Error updating agent_live_report:", updateErr);
        return res
          .status(500)
          .json({ message: "Error updating live report during reset." });
      }

      // 3️⃣ Delete all data from agent_live_report
      const deleteQuery = `DELETE FROM agent_live_report`;
      db.query(deleteQuery, (delErr) => {
        if (delErr) {
          console.error("Error deleting agent_live_report:", delErr);
          return res
            .status(500)
            .json({ message: "Error resetting agent live report." });
        }

        return res.json({
          message:
            "✅ Emergency reset complete. All users logged out & live report cleared.",
          resetBy: superadmin_id,
          resetTime: formattedLogout,
        });
      });
    });
  });
};
