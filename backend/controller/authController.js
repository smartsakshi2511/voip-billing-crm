const db = require("../models/db");
const fs = require("fs");
const path = require("path");
const net = require("net");

exports.profile = (req, res) => {
  const userId = req.user.userId;

  const userQuery = "SELECT * FROM users WHERE user_id = ?";

  const agentCountQuery =
    "SELECT COUNT(user_id) AS totalAgents FROM users WHERE admin = ? AND user_id != ?";

  db.query(userQuery, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching user data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    let user = results[0];

    db.query(agentCountQuery, [userId, userId], (err, agentResults) => {
      if (err) {
        console.error("Error fetching agent count:", err);
        return res.status(500).json({ message: "Error fetching agent count." });
      }

      user.totalAgents = agentResults[0].totalAgents; // Add total agent count to user data

      console.log(user);

      res.json(user);
    });
  });
};

// //----------------For ADMIN----------------------------------------------

//---------------------------------------------------------------------------------------------------------------

exports.getAgent = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;
  let query;
  let queryParams;

  if (userType == 8) {
    query = `
SELECT u.*, 
  CASE 
    WHEN ll.token IS NOT NULL THEN 'Login' 
    ELSE 'Logout' 
  END AS loginStatus
FROM users u
LEFT JOIN (
  SELECT user_name, MAX(token) AS token 
  FROM login_log 
  WHERE token IS NOT NULL AND DATE(log_in_time) = CURDATE()
  GROUP BY user_name
) ll ON u.user_id = ll.user_name
WHERE u.admin = ? AND u.user_type != 8
ORDER BY u.id DESC
    `;
    queryParams = [userId];
  } else if (userType == 2) {
    query = `
      SELECT u.*, 
        CASE 
          WHEN ll.token IS NOT NULL THEN 'Login' 
          ELSE 'Logout' 
        END AS loginStatus
      FROM users u
LEFT JOIN (
  SELECT user_name, MAX(token) AS token 
  FROM login_log 
  WHERE token IS NOT NULL AND DATE(log_in_time) = CURDATE()
  GROUP BY user_name
) ll ON u.user_id = ll.user_name

      WHERE u.admin = ? AND u.user_type = 1
      ORDER BY u.id DESC
    `;
    queryParams = [adminId];
  } else if (userType == 7) {
    // Manager
    query = `
      SELECT u.*, 
        CASE 
          WHEN ll.token IS NOT NULL THEN 'Login' 
          ELSE 'Logout' 
        END AS loginStatus
      FROM users u
 LEFT JOIN (
  SELECT user_name, MAX(token) AS token 
  FROM login_log 
  WHERE token IS NOT NULL AND DATE(log_in_time) = CURDATE()
  GROUP BY user_name
) ll ON u.user_id = ll.user_name

      WHERE u.admin = ? AND u.user_type IN (1, 2, 5)
      ORDER BY u.id DESC
    `;
    queryParams = [adminId];
  } else if (userType == 9) {
    query = `
SELECT u.*, 
  CASE 
    WHEN ll.token IS NOT NULL THEN 'Login' 
    ELSE 'Logout' 
  END AS loginStatus
FROM users u
LEFT JOIN (
  SELECT user_name, MAX(token) AS token 
  FROM login_log 
  WHERE token IS NOT NULL AND DATE(log_in_time) = CURDATE()
  GROUP BY user_name
) ll ON u.user_id = ll.user_name
WHERE u.admin IN (
  SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8
) 
OR (u.user_id IN (
  SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8
))
ORDER BY u.id DESC

    `;
    queryParams = [userId, userId]; // for subquery and direct admin lookup
  } else {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching user data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No users found." });
    }

    return res.status(200).json(results);
  });
};

exports.generateApiKey = (req, res) => {
  const { userId } = req.params;
  const keyLength = Math.floor(Math.random() * 3) + 10;
  const newApiKey = crypto
    .randomBytes(6)
    .toString("hex")
    .substring(0, keyLength);

  const query = "UPDATE users SET api_key = ? WHERE user_id = ?";
  db.query(query, [newApiKey, userId], (err, result) => {
    if (err) {
      console.error("Error updating API key:", err);
      return res.status(500).json({ message: "Error updating API key." });
    }

    res.json({ api_key: newApiKey });
  });
};

//-------update-------------------------------------------

exports.editAgent = (req, res) => {
  const { userId } = req.params;
  const {
    password,
    full_name,
    status,
    user_type,
    agent_priorty,
    campaigns_id,
    campaign_name,
    use_did,
    ext_number,
  } = req.body;

  const campaignsIdString = Array.isArray(campaigns_id)
    ? campaigns_id.join(",")
    : campaigns_id;

  const campaignNameString = Array.isArray(campaign_name)
    ? campaign_name.join(",")
    : campaign_name;

  const loggedInUserId = req.user?.userId;
  const userType = req.user?.userType;

  // ✅ Basic Validation
  if (!password || !full_name || !user_type) {
    return res.status(400).json({
      message:
        "Please provide all required fields: password, full_name, user_type.",
    });
  }

  // 🔐 Ownership Permission Logic
  let checkQuery = "";
  let checkParams = [];

  if (userType == 9) {
    checkQuery = `
      SELECT * FROM users 
      WHERE user_id = ? 
        AND (
          admin IN (SELECT user_id FROM users WHERE SuperAdmin = ?) 
          OR user_id IN (SELECT user_id FROM users WHERE SuperAdmin = ?)
        )
    `;
    checkParams = [userId, loggedInUserId, loggedInUserId];
  } else if (userType == 8) {
    checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ?`;
    checkParams = [userId, loggedInUserId];
  } else if (userType == 7) {
    checkQuery = `
      SELECT * FROM users 
      WHERE user_id = ? 
        AND admin = (SELECT admin FROM users WHERE user_id = ?) 
        AND user_type IN (1, 2, 5, 6)
    `;
    checkParams = [userId, loggedInUserId];
  } else if (userType == 2) {
    checkQuery = `
      SELECT * FROM users 
      WHERE user_id = ? 
        AND admin = (SELECT user_id FROM users WHERE user_id = ?) 
        AND user_type = 1
    `;
    checkParams = [userId, loggedInUserId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  // ✅ Ownership Check
  db.query(checkQuery, checkParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res
        .status(500)
        .json({ message: "Error verifying user ownership." });
    }

    if (results.length === 0) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this user." });
    }

    // 📝 Update User Query
    const updateQuery = `
      UPDATE users
      SET password = ?, full_name = ?, status = ?, user_type = ?, 
          agent_priorty = ?, campaigns_id = ?, campaign_name = ?, 
          use_did = ?, ext_number = ?
      WHERE user_id = ?
    `;

    db.query(
      updateQuery,
      [
        password,
        full_name,
        status,
        user_type,
        agent_priorty,
        campaignsIdString,
        campaignNameString,
        use_did,
        ext_number,
        userId,
      ],
      (updateErr, result) => {
        if (updateErr) {
          console.error("❌ Update error:", updateErr);
          return res.status(500).json({ message: "Error updating user." });
        }

        if (result.affectedRows === 0) {
          return res
            .status(404)
            .json({ message: "User not found or no changes made." });
        }

        // 🔁 Update SIP Configuration
        try {
          const configPath = "/etc/asterisk/telephonysip.conf";
          let config = fs.readFileSync(configPath, "utf-8");

          // Remove old config blocks
          const endpointRegex = new RegExp(
            `\\[${userId}\\]\\s*type=endpoint[\\s\\S]*?(?=\\n\\[|$)`,
            "g"
          );
          const authRegex = new RegExp(
            `\\[${userId}-auth\\]\\s*type=auth[\\s\\S]*?(?=\\n\\[|$)`,
            "g"
          );
          const aorRegex = new RegExp(
            `\\[${userId}\\]\\s*type=aor[\\s\\S]*?(?=\\n\\[|$)`,
            "g"
          );

          config = config
            .replace(endpointRegex, "")
            .replace(authRegex, "")
            .replace(aorRegex, "");

          // Add new config
          const newConfig = `
[${userId}]
type=endpoint
context=telephony
disallow=all
allow=opus,ulaw,alaw,g722
auth=${userId}-auth
aors=${userId}
webrtc=yes
dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt
dtls_private_key=/etc/apache2/ssl.key/viciphone.key
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[${userId}-auth]
type=auth
auth_type=userpass
username=${userId}
password=${password}

[${userId}]
type=aor
max_contacts=1
          `;

          config += newConfig;
          fs.writeFileSync(configPath, config, "utf-8");
 
          const amiClient = net.createConnection(
            { host: "localhost", port: 5038 },
            () => {
              amiClient.write(
                `Action: Login\r\nUsername: cron\r\nSecret: 1234\r\nEvents: off\r\n\r\n`
              );
              amiClient.write(
                `Action: Command\r\nCommand: pjsip reload\r\n\r\n`
              );
              amiClient.write(`Action: Logoff\r\n\r\n`);
            }
          );

          let responseData = "";
          amiClient.on("data", (chunk) => (responseData += chunk.toString()));
          amiClient.on("end", () =>
            res.status(200).json({
              message: "User updated successfully .",
              updatedUser: {
                user_id: userId,
                full_name,
                user_type,
                agent_priorty,
                status,
              },
              amiResponse: responseData,
            })
          );
          amiClient.on("error", (amiErr) => {
            console.error("AMI error:", amiErr);
            return res
              .status(500)
              .json({ message: "User updated, but failed to reload." });
          });
        } catch (e) {
          console.error("File error:", e);
          return res.status(500).json({
            message: "User updated but failed to update PJSIP config.",
          });
        }
      }
    );
  });
};

const userTypeMapping = {
  Agent: 1,
  Admin: 8,
  "Quality Analyst": 6,
  "Team Leader": 2,
  Manager: 7,
  IT: 5,
};

exports.addAgent = async (req, res) => {
  const { userType, admin } = req.user;
  const {
    user_id,
    password,
    user_type,
    full_name,
    campaigns_id,
    campaign_name,
    use_did,
  } = req.body;

  const mappedUserType = userTypeMapping[user_type];
  if (!mappedUserType) {
    return res.status(400).json({ message: "Invalid user type provided." });
  }

  if (userType == 2 && mappedUserType === 2) {
    return res
      .status(403)
      .json({ message: "Team Leaders can only add Agents." });
  }

  const adminId = userType == 8 ? req.user.userId : admin;

  const campaignsIdString = Array.isArray(campaigns_id)
    ? campaigns_id.join(",")
    : campaigns_id;
  const campaignNameString = Array.isArray(campaign_name)
    ? campaign_name.join(",")
    : campaign_name;

  try {
    // ✅ 1. Check duplicate user_id
    const [existingUser] = await new Promise((resolve, reject) => {
      db.query(`SELECT user_id FROM users WHERE user_id = ? LIMIT 1`, [user_id], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
    if (existingUser) {
      return res.status(409).json({ message: "User ID already exists." });
    }

    // ✅ 2. Get all existing priorities for this admin
    const existingPriorities = await new Promise((resolve, reject) => {
      db.query(
        `SELECT agent_priorty FROM users WHERE admin = ? ORDER BY agent_priorty ASC`,
        [adminId],
        (err, results) => (err ? reject(err) : resolve(results))
      );
    });

    // ✅ 3. Find smallest missing priority number
    let priority = 1;
    for (const row of existingPriorities) {
      if (row.agent_priorty == priority) {
        priority++;
      } else if (row.agent_priorty > priority) {
        break;
      }
    }

    // ✅ 4. Insert new agent
    const insertQuery = `
      INSERT INTO users (
        user_id, password, user_type, full_name,
        campaigns_id, campaign_name, use_did, admin,
        user_timezone, agent_priorty
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await new Promise((resolve, reject) => {
      db.query(
        insertQuery,
        [
          user_id,
          password,
          mappedUserType,
          full_name,
          campaignsIdString,
          campaignNameString,
          use_did,
          adminId,
          "Asia/Kolkata",
          priority,
        ],
        (err, results) => (err ? reject(err) : resolve(results))
      );
    });

    // ✅ 5. SIP config update (same as before)
    const configPath = "/etc/asterisk/telephonysip.conf";
    let config = fs.readFileSync(configPath, "utf-8");

    const endpointRegex = new RegExp(`\\[${user_id}\\]\\s*type=endpoint`, "g");
    if (endpointRegex.test(config)) {
      config = config.replace(
        new RegExp(`(\\[${user_id}\\][^\\[]*?)secret=.*`, "s"),
        `$1secret=${password}`
      );
    } else {
      const newConfig = `
[${user_id}]
type=endpoint
context=telephony
disallow=all
allow=opus,ulaw,alaw,g722
auth=${user_id}-auth
aors=${user_id}
webrtc=yes
dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt
dtls_private_key=/etc/apache2/ssl.key/viciphone.key
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[${user_id}-auth]
type=auth
auth_type=userpass
username=${user_id}
password=${password}

[${user_id}]
type=aor
max_contacts=1
`;
      config += newConfig;
    }

    fs.writeFileSync(configPath, config, "utf-8");

    const amiReload = await reloadSIPViaAMI();
    if (amiReload.success) {
      return res.status(201).json({
        message: "Agent added successfully.",
        priority,
        amiResponse: amiReload.response,
      });
    } else {
      return res.status(500).json({
        message: "Agent added, but SIP reload failed.",
        priority,
      });
    }
  } catch (err) {
    console.error("Error adding agent:", err);
    return res.status(500).json({
      message: "Failed to add agent.",
      error: err.message,
    });
  }
};


function reloadSIPViaAMI() {
  return new Promise((resolve) => {
    const amiClient = net.createConnection(
      { host: "localhost", port: 5038 },
      () => {
        // console.log("✅ Connected to AMI on port 5038");
        amiClient.write(
          `Action: Login\r\nUsername: cron\r\nSecret: 1234\r\nEvents: off\r\n\r\n`
        );
        setTimeout(() => {
          amiClient.write(`Action: Command\r\nCommand: pjsip reload\r\n\r\n`);
          amiClient.write(`Action: Logoff\r\n\r\n`);
        }, 1000); // small delay after login
      }
    );

    let responseData = "";
    let resolved = false;

    amiClient.on("data", (chunk) => {
      const data = chunk.toString();
      responseData += data;
      console.log("📡 AMI Response Chunk:", data);
    });

    amiClient.on("end", () => {
      if (!resolved) {
        resolved = true;
        console.log("🔚 AMI connection ended, full response:");
        console.log(responseData);
        resolve({ success: true, response: responseData });
      }
    });

    amiClient.on("error", (err) => {
      console.error("❌ AMI error:", err);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, response: err.message });
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log("⏰ AMI timeout");
        resolve({ success: false, response: "Timeout while reloading SIP." });
      }
    }, 3000);
  });
}

//----------------------------------------------------------------------------------------------------------

exports.superUser = async (req, res) => {
  const { userType } = req.user;
  const {
    user_id,
    password,
    user_type,
    full_name,
    campaigns_id,
    campaign_name,
    use_did,
    admin,
  } = req.body;

  const mappedUserType = userTypeMapping[user_type];
  if (!mappedUserType) {
    return res.status(400).json({ message: "Invalid user type provided." });
  }

  if (userType == 2 && mappedUserType === 2) {
    return res
      .status(403)
      .json({ message: "Team Leaders can only add Agents." });
  }

  const campaignsIdString = Array.isArray(campaigns_id)
    ? campaigns_id.join(",")
    : campaigns_id;
  const campaignNameString = Array.isArray(campaign_name)
    ? campaign_name.join(",")
    : campaign_name;

  const insertQuery = `
    INSERT INTO users (
      user_id, password, user_type, full_name, 
      campaigns_id, campaign_name, use_did, admin
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    // Insert user into DB
    await new Promise((resolve, reject) => {
      db.query(
        insertQuery,
        [
          user_id,
          password,
          mappedUserType,
          full_name,
          campaignsIdString,
          campaignNameString,
          use_did,
          admin,
        ],
        (err, results) => (err ? reject(err) : resolve(results))
      );
    });
 
    const configPath = "/etc/asterisk/telephonysip.conf";
    let config = fs.readFileSync(configPath, "utf-8");

    const endpointRegex = new RegExp(`\\[${user_id}\\]\\s*type=endpoint`);
    const authRegex = new RegExp(`\\[${user_id}-auth\\]\\s*type=auth`);
    const aorRegex = new RegExp(`\\[${user_id}\\]\\s*type=aor`);

    const hasEndpoint = endpointRegex.test(config);
    const hasAuth = authRegex.test(config);
    const hasAor = aorRegex.test(config);

    // Build new config block
    const newConfig = `
[${user_id}]
type=endpoint
context=telephony
disallow=all
allow=opus,ulaw,alaw,g722
auth=${user_id}-auth
aors=${user_id}
webrtc=yes
dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt
dtls_private_key=/etc/apache2/ssl.key/viciphone.key
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[${user_id}-auth]
type=auth
auth_type=userpass
username=${user_id}
password=${password}

[${user_id}]
type=aor
max_contacts=1
`;

    if (!hasEndpoint && !hasAuth && !hasAor) {
      config += newConfig;
    } else {
      // Replace existing blocks (if any)
      config = config.replace(
        new RegExp(
          `\\[${user_id}\\][\\s\\S]*?type=endpoint[\\s\\S]*?(?=\\n\\[|$)`
        ),
        newConfig
      );
    }

    fs.writeFileSync(configPath, config, "utf-8");

    // Reload SIP config via AMI
    const amiReload = await reloadSIPViaAMI();
    if (amiReload.success) {
      return res.status(201).json({
        message: "Agent added successfully and PJSIP updated.",
        amiResponse: amiReload.response,
      });
    } else {
      return res.status(500).json({
        message: "Agent added, but PJSIP reload failed.",
        error: "SIP reload failed via AMI.",
      });
    }
  } catch (err) {
    console.error("Error adding agent:", err);
    return res
      .status(500)
      .json({ message: "Failed to add agent.", error: err.message });
  }
};

exports.deleteAgent = (req, res) => {
  const { userId, userType } = req.user;
  const agentId = req.params.id;

  let checkQuery = "";
  let checkParams = [];

  switch (userType) {
    case "9":
      checkQuery = `
        SELECT * FROM users 
        WHERE user_id = ? 
          AND (
            admin IN (SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8)
            OR user_id IN (SELECT user_id FROM users WHERE SuperAdmin = ? AND user_type = 8)
          )`;
      checkParams = [agentId, userId, userId];
      break;

    case "8":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ?`;
      checkParams = [agentId, userId];
      break;

    case "7":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? AND user_type IN (1, 2, 6)`;
      checkParams = [agentId, userId];
      break;

    case "2":
      checkQuery = `SELECT * FROM users WHERE user_id = ? AND admin = ? AND user_type = 1`;
      checkParams = [agentId, userId];
      break;

    default:
      return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(checkQuery, checkParams, (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Error verifying ownership." });
    }

    if (results.length === 0) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this agent." });
    }

    // ✅ Get admin ID before deletion
    const adminId = results[0].admin;

    // ✅ Delete the agent first
    db.query(`DELETE FROM users WHERE user_id = ?`, [agentId], (deleteErr) => {
      if (deleteErr) {
        console.error("Delete DB error:", deleteErr);
        return res.status(500).json({ message: "Failed to delete user." });
      }

      // ✅ Reorder remaining priorities for this admin
      const reorderQuery = `
        SET @rownum = 0;
        UPDATE users
        SET agent_priorty = (@rownum := @rownum + 1)
        WHERE admin = ?
        ORDER BY agent_priorty ASC;
      `;

      db.query(reorderQuery, [adminId], (reorderErr) => {
        if (reorderErr) {
          console.error("Reorder error:", reorderErr);
          return res.status(500).json({
            message: "User deleted, but failed to reorder priorities.",
            error: reorderErr.message,
          });
        }

        try {
          // ✅ SIP config cleanup
          const configPath = "/etc/asterisk/telephonysip.conf";
          let config = fs.readFileSync(configPath, "utf-8");

          const regex = new RegExp(
            `(\\[${agentId}\\][\\s\\S]*?(?=\\n\\[|$))|` +
              `(\\[${agentId}-auth\\][\\s\\S]*?(?=\\n\\[|$))`,
            "g"
          );
          config = config.replace(regex, "");

          fs.writeFileSync(configPath, config, "utf-8");

          // ✅ AMI SIP Reload
          const amiClient = net.createConnection(
            { host: "localhost", port: 5038 },
            () => {
              console.log("✅ Connected to AMI for deleteAgent");
              amiClient.write(
                `Action: Login\r\nUsername: cron\r\nSecret: 1234\r\nEvents: off\r\n\r\n`
              );
            }
          );

          let responseData = "";
          let resolved = false;
          let loggedIn = false;

          amiClient.on("data", (chunk) => {
            const data = chunk.toString();
            console.log("📡 AMI Response:", data);
            responseData += data;

            if (!loggedIn && data.includes("Success")) {
              loggedIn = true;
              amiClient.write(`Action: Command\r\nCommand: pjsip reload\r\n\r\n`);
              amiClient.write(`Action: Logoff\r\n\r\n`);
            }
          });

          amiClient.on("end", () => {
            if (!resolved) {
              resolved = true;
              console.log("🔚 AMI connection ended");
              return res.status(200).json({
                message: "Agent deleted, priorities updated, and SIP reloaded.",
                amiResponse: responseData,
              });
            }
          });

          amiClient.on("error", (err) => {
            console.error("❌ AMI error:", err);
            if (!resolved) {
              resolved = true;
              return res.status(500).json({
                message: "Agent deleted and reordered, but SIP reload failed.",
                error: err.message,
              });
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              amiClient.end();
              console.warn("⏰ AMI timeout during delete");
              return res.status(200).json({
                message:
                  "Agent deleted and reordered, but SIP reload timed out.",
                amiResponse: "Timeout waiting for AMI response",
              });
            }
          }, 5000);
        } catch (fsErr) {
          console.error("FS error during SIP config update:", fsErr);
          return res.status(500).json({
            message: "Agent deleted, but failed to update SIP config.",
            error: fsErr.message,
          });
        }
      });
    });
  });
};

exports.getAgentBreak = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType; // user_type from token

  let query = "";
  let queryParams = [];

  if (userType == 8) {
    // Admin can see breaks of both team leaders (2) and agents (1) under them
    query = `
      SELECT 
        u.user_id,
        u.full_name,
        u.admin,
        u.agent_priorty,
        b.break_name,
        b.start_time,
        b.break_duration,
        b.end_time,
        b.break_status,
        b.status AS break_status
      FROM users u
      JOIN break_time b ON u.user_id = b.user_name
      WHERE u.admin = ? AND u.user_type IN (1, 2)
      ORDER BY u.id DESC
    `;
    queryParams = [userId];
  } else if (userType == 2) {
    // Team Leaders can only see their own agents (1) breaks
    query = `
      SELECT 
        u.user_id,
        u.full_name,
        u.admin,
        u.agent_priorty,
        b.break_name,
        b.start_time,
        b.break_duration,
        b.end_time,
        b.break_status,
        b.status AS break_status
      FROM users u
      JOIN break_time b ON u.user_id = b.user_name
      WHERE u.admin = (SELECT admin FROM users WHERE user_id = ?) AND u.user_type = 1
      ORDER BY u.id DESC
    `;
    queryParams = [userId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching break times." });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "No break times found for agents." });
    }

    res.status(200).json(results);
  });
};

exports.getAgentLoginReport = (req, res) => {
  const adminOrTeamLeaderId = req.user.userId;
  const userType = req.user.userType; // Get user_type from token

  let agentQuery = "";
  let queryParams = [];

  if (userType == 8) {
    // Admin can see login reports of Team Leaders (2) & Agents (1)
    agentQuery = `
      SELECT user_id, full_name 
      FROM users 
      WHERE admin = ? AND user_type IN (1, 2) 
      ORDER BY id DESC
    `;
    queryParams = [adminOrTeamLeaderId];
  } else if (userType == 2) {
    // Team Leaders can only see login reports of their agents (1)
    agentQuery = `
      SELECT user_id, full_name 
      FROM users 
      WHERE admin = (SELECT admin FROM users WHERE user_id = ?) AND user_type = 1 
      ORDER BY id DESC
    `;
    queryParams = [adminOrTeamLeaderId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(agentQuery, queryParams, (err, agentResults) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching agents." });
    }

    if (agentResults.length === 0) {
      return res
        .status(404)
        .json({ message: "No agents found for this user." });
    }

    const agentUserNames = agentResults.map((agent) => agent.user_id);

    const loginQuery = `
      SELECT id, user_name, log_in_time, log_out_time, status 
      FROM login_log 
      WHERE user_name IN (?) 
      ORDER BY log_in_time DESC
    `;

    db.query(loginQuery, [agentUserNames], (err, loginResults) => {
      if (err) {
        console.error("❌ Database error:", err);
        return res
          .status(500)
          .json({ message: "Error fetching login report." });
      }

      return res.status(200).json(loginResults);
    });
  });
};

exports.viewAgentDetails = (req, res) => {
  const userId = req.params.userid;

  const sql = "SELECT * FROM users WHERE user_id = ?";
  db.query(sql, [userId], (err, data) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (data.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given ID" });
    }

    return res.json(data[0]); // Return user details
  });
};

exports.getAllAgentReport = (req, res) => {
  const adminOrTeamLeaderId = req.user.userId;
  const userType = req.user.userType; // Get user_type from token

  let query = "";
  let queryParams = [];

  if (userType == 8) {
    query = `
    SELECT 
      u.user_id,
      ANY_VALUE(u.status) AS status,  
      COUNT(DISTINCT bt.break_name) AS no_of_breaks,
      GROUP_CONCAT(DISTINCT bt.break_name SEPARATOR ', ') AS break_names,
      ANY_VALUE(ll.log_in_time) AS login_time,  
      COALESCE(call_data.no_of_ans, 0) AS no_of_ans,
      COALESCE(call_data.no_of_can, 0) AS no_of_can,
      COALESCE(call_data.no_of_tot, 0) AS no_of_tot
    FROM users u
    LEFT JOIN break_time bt ON u.user_id = bt.user_name
    LEFT JOIN login_log ll ON u.user_id = ll.user_name
    LEFT JOIN (
        SELECT 
          call_from AS user_id,
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS no_of_ans,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS no_of_can,
          COUNT(*) AS no_of_tot
        FROM cdr
        GROUP BY call_from
    ) AS call_data ON u.user_id = call_data.user_id
    WHERE 
      u.admin = ? 
      AND u.user_type IN (1, 2) 
    GROUP BY 
      u.user_id
    ORDER BY 
      ANY_VALUE(u.id) DESC;
    `;
    queryParams = [adminOrTeamLeaderId];
  } else if (userType == 2) {
    // Team Leaders can only see reports of their Agents (1)
    query = `
    SELECT 
      u.user_id,
      ANY_VALUE(u.status) AS status,
      COUNT(DISTINCT bt.break_name) AS no_of_breaks,
      GROUP_CONCAT(DISTINCT bt.break_name SEPARATOR ', ') AS break_names,
      ANY_VALUE(ll.log_in_time) AS login_time,
      COALESCE(call_data.no_of_ans, 0) AS no_of_ans,
      COALESCE(call_data.no_of_can, 0) AS no_of_can,
      COALESCE(call_data.no_of_tot, 0) AS no_of_tot
    FROM users u
    LEFT JOIN break_time bt ON u.user_id = bt.user_name
    LEFT JOIN login_log ll ON u.user_id = ll.user_name
    LEFT JOIN (
        SELECT 
          call_from AS user_id,
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS no_of_ans,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS no_of_can,
          COUNT(*) AS no_of_tot
        FROM cdr
        GROUP BY call_from
    ) AS call_data ON u.user_id = call_data.user_id
    WHERE 
      u.admin = (SELECT admin FROM users WHERE user_id = ?) 
      AND u.user_type = 1 
    GROUP BY 
      u.user_id
    ORDER BY 
      ANY_VALUE(u.id) DESC;
    `;
    queryParams = [adminOrTeamLeaderId];
  } else {
    return res.status(403).json({ message: "Unauthorized request." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching agent reports." });
    }

    console.log("✅ Query executed successfully. Results:", results);

    // Check if any user has call counts
    results.forEach((row) => {
      console.log(
        `User ID: ${row.user_id}, Answered: ${row.no_of_ans}, Canceled: ${row.no_of_can}, Total Calls: ${row.no_of_tot}`
      );
    });

    if (results.length === 0) {
      console.warn("⚠️ No data found for this user.");
      return res.status(404).json({ message: "No data found for this user." });
    }

    res.status(200).json(results);
  });
};

exports.AgentDetailFeature = (req, res) => {
  const { user_id, filter } = req.params;

  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  let dateCondition = "";

  if (filter === "today") {
    dateCondition = "AND DATE(start_time) = CURDATE()";
  } else if (filter === "weekly") {
    dateCondition = "AND WEEK(start_time) = WEEK(CURDATE())";
  } else if (filter === "monthly") {
    dateCondition = "AND MONTH(start_time) = MONTH(CURDATE())";
  }
  const query1 = `
    SELECT 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
      COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
      COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
      COUNT(*) AS totalCall
    FROM cdr 
    WHERE (call_from = ? OR call_to = ?) AND admin = ? ${dateCondition}
  `;

  db.query(query1, [user_id, user_id, user_id], (err, results) => {
    if (err) {
      console.error("Error fetching call counts:", err);
      return res.status(500).json({ error: "Failed to fetch call counts" });
    }

    if (results[0].totalCall > 0) {
      console.log("User ID found in cdr:", results[0]);
      return res.json(results[0]);
    } else {
      const query2 = `
        SELECT 
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
          COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
          COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
          COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
          COUNT(*) AS totalCall
        FROM cdr 
        WHERE (call_from = ? OR call_to = ?) ${dateCondition}
      `;

      db.query(query2, [user_id, user_id], (err, results2) => {
        if (err) {
          console.error(
            "Error fetching call counts from call_from or call_to:",
            err
          );
          return res.status(500).json({ error: "Failed to fetch call counts" });
        }

        return res.json(results2[0]); // Return the data when matching `call_from` or `call_to`
      });
    }
  });
};

//=============================================================================================

exports.ViewAgentDetailChart = (req, res) => {
  const adminId = req.user.userId;
  const { userId } = req.params;

  const query = `
    SELECT 
      DATE_FORMAT(start_time, '%Y-%m') AS month, 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
      COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
      COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
      COUNT(*) AS totalCall
    FROM cdr
    WHERE admin = ? 
      AND (call_from = ? OR call_to = ?)
      AND start_time >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY month
    ORDER BY month;
  `;

  db.query(query, [adminId, userId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching agent chart data:", err);
      return res
        .status(500)
        .json({ error: "Database query error", details: err });
    }

    if (!results.length) {
      return res.status(404).json({ error: "No data found for this agent." });
    }

    const formattedResults = results.map((row) => ({
      name: row.month,
      answerCall: row.answerCall || 0,
      cancelCall: row.cancelCall || 0,
      otherCall: row.otherCall || 0,
      outboundCall: row.outboundCall || 0,
      inboundCall: row.inboundCall || 0,
      totalCall: row.totalCall || 0,
    }));

    res.json(formattedResults);
  });
};

//=============================================================================================

exports.toggleUserStatus = (req, res) => {
  const userId = req.params.user_id; // User ID to be updated
  const userType = req.user.userType; // Logged-in user type
  const adminId = req.user.admin; // Admin ID (if Team Leader)

  let query;
  let queryParams;

  if (userType == 8 || userType == 9) {
    // Admin can update any user's status (except admins)
    query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE User_id = ?`;
    queryParams = [userId];
  } else if (userType == 2 || userType == 7) {
    // Team Leader can update only their agents
    query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE user_id = ? AND admin = ? AND user_type = 1`;
    //  query = `UPDATE users SET status = IF(status = 'active', 'inactive', 'active') WHERE user_id = ? AND admin = ? AND user_type = 1`;
    queryParams = [userId, adminId];
  } else {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error updating user status." });
    }

    if (results.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "User not found or unauthorized." });
    }

    return res
      .status(200)
      .json({ message: "User status updated successfully." });
  });
};

//=============================================================================================
exports.AgentSummary = (req, res) => {
  const adminId = req.user.userId; 
  const userId = req.params.user_id; 

  // console.log(`Executing query with adminId: ${adminId} and userId: ${userId}`);
  const query = `
    SELECT admin, call_from, call_to, start_time, dur, direction, status, record_url
    FROM cdr
    WHERE admin = ? AND (call_from = ? OR call_to = ?) 
    ORDER BY id DESC
  `;

  db.query(query, [adminId, userId], (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Database query failed" });
    }

    if (data.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given ID" });
    }

    return res.json(data); 
  });
};

exports.createAdmin = (req, res) => {
  const superAdminId = req.user.userId;
  const {
  user_id,
  password,
  full_name,
  ext_number,
  use_did,
  admin_mobile,
  admin_email
} = req.body;

const newAdmin = {
  SuperAdmin: superAdminId,
  admin: user_id,
  user_id,
  password,
  full_name,
  ext_number,
  use_did,
  admin_mobile: admin_mobile || "",
  admin_email: admin_email || "",
  user_type: 8,
  status: "active",
  ins_date: new Date(),
  user_timezone: "Asia/Kolkata",
};

  const query = "INSERT INTO users SET ?";

  db.query(query, newAdmin, async (err, result) => {
    if (err) {
      console.error("❌ DB Error:", err);
      return res.status(500).json({ message: "Failed to create admin." });
    }

    try {
      const configPath = "/etc/asterisk/telephonysip.conf";
      let config = fs.readFileSync(configPath, "utf-8");

      const userId = user_id;

      const endpointRegex = new RegExp(`\\[${userId}\\]\\s*type=endpoint`);
      const authRegex = new RegExp(`\\[${userId}-auth\\]\\s*type=auth`);
      const aorRegex = new RegExp(`\\[${userId}\\]\\s*type=aor`);

      const hasEndpoint = endpointRegex.test(config);
      const hasAuth = authRegex.test(config);
      const hasAor = aorRegex.test(config);

      const newConfig = `
[${userId}]
type=endpoint
context=telephony
disallow=all
allow=opus,ulaw,alaw,g722
auth=${userId}-auth
aors=${userId}
webrtc=yes
dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt
dtls_private_key=/etc/apache2/ssl.key/viciphone.key
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[${userId}-auth]
type=auth
auth_type=userpass
username=${userId}
password=${password}

[${userId}]
type=aor
max_contacts=1
`;

      if (!hasEndpoint && !hasAuth && !hasAor) {
        config += newConfig;
        console.log("📄 Appending new PJSIP config.");
      } else {
        console.log("🔄 Replacing existing PJSIP config for user:", userId);
        config = config.replace(
          new RegExp(
            `\\[${userId}\\][\\s\\S]*?type=endpoint[\\s\\S]*?(?=\\n\\[|$)`
          ),
          newConfig
        );
      }

      fs.writeFileSync(configPath, config, "utf-8");
      const amiReload = await reloadSIPViaAMI();
      if (amiReload.success) {
        return res.status(201).json({
          message: "Admin created and Realod.",
          adminId: result.insertId,
          amiResponse: amiReload.response,
        });
      } else {
        return res.status(500).json({
          message: "Admin created, but not reload.",
          error: "SIP reload failed via AMI.",
        });
      }
    } catch (err) {
      console.error("⚠️ PJSIP update error:", err);
      return res.status(500).json({
        message: "Admin created, but failed to update PJSIP config.",
        error: err.message,
      });
    }
  });
};

exports.editAdmin = (req, res) => {
  const userId = req.params.user_id; // from URL
  const superAdminId = req.user.userId;

  const {
    full_name,
    password,
    ext_number,
    use_did,
    admin_mobile,
    admin_email,
  } = req.body;

  const updateData = {
    full_name,
    ext_number,
    use_did,
    admin_mobile,
    admin_email,
    SuperAdmin: superAdminId,
  };

  if (password && password.trim() !== "") {
    updateData.password = password;
  }

  const query = "UPDATE users SET ? WHERE user_id = ?";
  db.query(query, [updateData, userId], (updateErr, result) => {
    if (updateErr) {
      console.error("❌ Update error:", updateErr);
      return res.status(500).json({ message: "Error updating user." });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "User not found or no changes made." });
    }

    // 🔁 Update SIP Configuration
    try {
      const configPath = "/etc/asterisk/telephonysip.conf";
      let config = fs.readFileSync(configPath, "utf-8");

      // Remove old endpoint/auth/aor sections
      const endpointRegex = new RegExp(
        `\\[${userId}\\]\\s*type=endpoint[\\s\\S]*?(?=\\n\\[|$)`,
        "g"
      );
      const authRegex = new RegExp(
        `\\[${userId}-auth\\]\\s*type=auth[\\s\\S]*?(?=\\n\\[|$)`,
        "g"
      );
      const aorRegex = new RegExp(
        `\\[${userId}\\]\\s*type=aor[\\s\\S]*?(?=\\n\\[|$)`,
        "g"
      );

      config = config
        .replace(endpointRegex, "")
        .replace(authRegex, "")
        .replace(aorRegex, "");

      // New SIP config
      const newConfig = `
[${userId}]
type=endpoint
context=telephony
disallow=all
allow=opus,ulaw,alaw,g722
auth=${userId}-auth
aors=${userId}
webrtc=yes
dtls_cert_file=/etc/apache2/ssl.crt/viciphone.crt
dtls_private_key=/etc/apache2/ssl.key/viciphone.key
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[${userId}-auth]
type=auth
auth_type=userpass
username=${userId}
password=${password || "RETAIN_OLD_PASSWORD"}

[${userId}]
type=aor
max_contacts=1
      `;

      config += newConfig;
      fs.writeFileSync(configPath, config, "utf-8");

      // 🔄 Reload Asterisk via AMI
      const amiClient = net.createConnection(
        { host: "localhost", port: 5038 },
        () => {
          amiClient.write(
            `Action: Login\r\nUsername: cron\r\nSecret: 1234\r\nEvents: off\r\n\r\n`
          );
          amiClient.write(
            `Action: Command\r\nCommand: pjsip reload\r\n\r\n`
          );
          amiClient.write(`Action: Logoff\r\n\r\n`);
        }
      );

      let responseData = "";
      amiClient.on("data", (chunk) => (responseData += chunk.toString()));
      amiClient.on("end", () =>
        res.status(200).json({
          message: "User updated .",
          updatedUser: { user_id: userId, full_name, admin_email },
          amiResponse: responseData,
        })
      );
      amiClient.on("error", (amiErr) => {
        console.error("AMI error:", amiErr);
        return res
          .status(500)
          .json({ message: "User updated, but failed." });
      });
    } catch (e) {
      console.error("File error:", e);
      return res.status(500).json({
        message: "User updated but failed to update.",
      });
    }
  });
};




exports.getAdmins = (req, res) => {
  const superAdminId = req.user.userId;
  const query = `
SELECT 
  a.*, 
  IFNULL(agent_counts.agentCount, 0) AS avail_agents,
  CASE 
    WHEN ll.token IS NOT NULL THEN 'Login'
    ELSE 'Logout'
  END AS loginStatus
FROM users a
LEFT JOIN (
  SELECT admin, COUNT(*) AS agentCount 
  FROM users 
  WHERE user_type != 8 
  GROUP BY admin
) agent_counts ON a.user_id = agent_counts.admin
LEFT JOIN (
  SELECT user_name, MAX(token) AS token
  FROM login_log
  WHERE token IS NOT NULL 
    AND DATE(log_in_time) = CURDATE()  
  GROUP BY user_name
) ll ON a.user_id = ll.user_name
WHERE a.SuperAdmin = ?
  AND a.user_type = 8
ORDER BY a.id DESC;
`;

  // console.log("Executing SQL:", query.replace("?", `'${superAdminId}'`));

  db.query(query, [superAdminId], (err, results) => {
    if (err) {
      console.error("Error fetching admins:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No admins found" });
    }

    return res.status(200).json(results);
  });
};

 
