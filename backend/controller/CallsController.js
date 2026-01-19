const db = require("../models/db");

 
const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error("SQL Error:", err);
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getNumOfCall = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userType = req.user.userType;
    const adminId = req.user.admin;

    let userIds = [userId];

    if (userType == 9) {
      const adminRows = await queryAsync(
        `SELECT user_id FROM users WHERE SuperAdmin = ?`,
        [userId]
      );
      const adminIds = adminRows.map((row) => row.user_id);

      const userRows = await queryAsync(
        `SELECT user_id FROM users WHERE admin IN (?)`,
        [adminIds]
      );
      userIds = userRows.map((row) => row.user_id);
    } else if (userType == 7) {
      const userRows = await queryAsync(
        `SELECT user_id FROM users WHERE admin = ? AND user_type IN (2, 1, 6)`,
        [adminId]
      );
      userIds = userRows.map((row) => row.user_id);
      userIds.push(userId);
    }

    let queryCalls = "";
    let queryParamsCalls = [];

    if (userType == 9 || userType == 7) {
      const placeholders = userIds.map(() => '?').join(',');
      queryCalls = `
        SELECT 
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
          COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
          COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
          COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
          COUNT(CASE WHEN status = 'NOANSWER' THEN 1 END) AS noAnswerCall,
          COUNT(*) AS totalCall
        FROM cdr 
        WHERE (call_from IN (${placeholders}) OR call_to IN (${placeholders}))
        AND DATE(start_time) = CURDATE()
      `;
      queryParamsCalls = [...userIds, ...userIds];
    } else if (userType == 8) {
      queryCalls = `
        SELECT 
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
          COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
          COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
          COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
          COUNT(CASE WHEN status = 'NOANSWER' THEN 1 END) AS noAnswerCall,
          COUNT(*) AS totalCall
        FROM cdr 
        WHERE admin = ?
        AND DATE(start_time) = CURDATE()
      `;
      queryParamsCalls = [userId];
    } else {
      queryCalls = `
        SELECT 
          COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
          COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
          COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
          COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
          COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
          COUNT(CASE WHEN status = 'NOANSWER' THEN 1 END) AS noAnswerCall,
          COUNT(*) AS totalCall
        FROM cdr 
        WHERE (call_from = ? OR call_to = ?)
        AND DATE(start_time) = CURDATE()
      `;
      queryParamsCalls = [userId, userId];
    }

    // --- Agent Status ---
    let queryAgents = "";
    let agentParams = [];

    if (userType == 9) {
      queryAgents = `
        SELECT  
          COUNT(DISTINCT CASE 
            WHEN (break_time.status IN ('1', '2')) 
              AND login_log.status = '1' 
              AND login_log.token IS NOT NULL
              AND DATE(login_log.log_in_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS loginAgent, 

          COUNT(DISTINCT CASE 
            WHEN break_time.break_status = '2' 
              AND break_time.status = '2' 
              AND DATE(break_time.start_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS availableAgent, 

          COUNT(DISTINCT CASE 
            WHEN break_time.break_status = '1' 
              AND break_time.status = '1'
              AND break_time.break_name <> 'Ready'
              AND DATE(break_time.start_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS pauseAgent 
        FROM users 
        JOIN login_log ON users.user_id = login_log.user_name 
        LEFT JOIN break_time ON break_time.user_name = users.user_id 
        WHERE users.admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
      `;
      agentParams = [userId];
    } else {
      queryAgents = `
        SELECT  
          COUNT(DISTINCT CASE 
            WHEN (break_time.status IN ('1', '2')) 
              AND login_log.status = '1' 
              AND login_log.token IS NOT NULL
              AND DATE(login_log.log_in_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS loginAgent, 

          COUNT(DISTINCT CASE 
            WHEN break_time.break_status = '2' 
              AND break_time.status = '2'
              AND DATE(break_time.start_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS availableAgent, 

          COUNT(DISTINCT CASE 
            WHEN break_time.break_status = '1' 
              AND break_time.status = '1'
              AND break_time.break_name <> 'Ready'
              AND DATE(break_time.start_time) = CURDATE()
            THEN break_time.user_name ELSE NULL 
          END) AS pauseAgent 
        FROM users 
        JOIN login_log ON users.user_id = login_log.user_name 
        LEFT JOIN break_time ON break_time.user_name = users.user_id 
        WHERE users.admin = ?
      `;
      agentParams = [adminId];
    }

    const livePlaceholders = userIds.map(() => '?').join(',');
    const queryLive = `
      SELECT 
        SUM(status = 'Answer') AS inCall,
        SUM(CASE WHEN (status = 'Ringing' OR Agent = 'NOAGENT') AND direction = 'inbound' THEN 1 ELSE 0 END) AS callQueue
      FROM live 
      WHERE Agent IN (${livePlaceholders})
      AND DATE(time) = CURDATE()
    `;

    // Execute all queries
    const [callResults, agentResults, liveResults] = await Promise.all([
      queryAsync(queryCalls, queryParamsCalls),
      queryAsync(queryAgents, agentParams),
      queryAsync(queryLive, userIds),
    ]);

    const response = {
      ...callResults[0],
      ...agentResults[0],
      ...liveResults[0],
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Failed to fetch call data" });
  }
};


exports.updateAgentLiveReport = async (req, res) => {
  try {
    const userId = req.user.userId;  // Always use this
 
const query = `
  SELECT
    COUNT(*) AS today_total_calls,
    COUNT(CASE WHEN status = 'NOANSWER' THEN 1 END) AS today_missed_calls,
    COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS today_answered_calls,
    IFNULL(SUM(CASE WHEN status = 'ANSWER' THEN dur ELSE 0 END), 0) AS today_answered_duration
  FROM cdr
  WHERE (call_from = ? OR call_to = ?)
    AND DATE(start_time) = CURDATE()
`;


    const [result] = await queryAsync(query, [userId, userId]);

    // Update agent_live_report for this agent_id and today’s date
    await queryAsync(
      `UPDATE agent_live_report
       SET today_total_calls = ?,
           today_missed_calls = ?,
           today_answered_calls = ?,
           today_answered_duration = ?
       WHERE agent_id = ?
         AND DATE(login_time) = CURDATE()`,
      [
        result.today_total_calls || 0,
        result.today_missed_calls || 0,
        result.today_answered_calls || 0,
        result.today_answered_duration || 0,
        userId
      ]
    );

    res.status(200).json({
      message: "✅ Agent live report updated successfully.",
      data: result
    });

  } catch (error) {
    console.error("❌ Error updating agent_live_report:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};






exports.totalCallGraph = (req, res) => {
  const sql =
    "SELECT DATE_FORMAT(start_time, '%m-%Y') AS month, COUNT(*) AS total_calls FROM  cdr GROUP BY DATE_FORMAT(start_time, '%m-%Y') ORDER BY call_from, month";
  db.query(sql, (err, result) => {
    if (err) return res.json(err);
    return res.json(result);
  });
};

//---------------------------------------------------------------------------------------------------

exports.getFilteredCalls = (req, res) => {
  const { range } = req.query;

  let dateCondition;
  if (range === "week") {
    dateCondition = "DATE_SUB(CURDATE(), INTERVAL 7 DAY) <= start_time";
  } else if (range === "month") {
    dateCondition = "DATE_SUB(CURDATE(), INTERVAL 1 MONTH) <= start_time";
  } else if (range === "year") {
    dateCondition = "DATE_SUB(CURDATE(), INTERVAL 1 YEAR) <= start_time";
  } else {
    return res.status(400).json({ error: "Invalid range" });
  }

  const query = `
    SELECT 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall
    FROM cdr
    WHERE ${dateCondition};
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching filtered call counts:", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch filtered call counts" });
    }

    res.json(results[0]);  
  });
};




exports.getcallReport = (req, res) => { 
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;

  let query = "";
  let queryParams = [];

  if (userType == 9) {
    query = `
      SELECT * FROM cdr
      WHERE admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
      OR admin IN (
        SELECT user_id FROM users
        WHERE admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
      )
      ORDER
       BY id DESC;
    `;
    queryParams.push(userId, userId);
  } 

  else if (userType == 8) {
    // ✅ Admin – see all users created by this admin
    query = `
      SELECT * FROM cdr 
      WHERE admin = ?
      ORDER BY id DESC;
    `;
    queryParams.push(userId);
  } 

 else if (userType == 7) {
  query = `
    SELECT cdr.*, 
      (SELECT recording_permission FROM users WHERE user_id = ?) AS recording_permission
    FROM cdr
    WHERE 
      admin = ? OR
      admin IN (
        SELECT user_id FROM users 
        WHERE admin = ? AND user_type IN (1, 2, 6) AND user_type != 8
      )
    ORDER BY id DESC;
  `;
  queryParams.push(userId, adminId, adminId);
}
else if (userType == 2) {
  query = `
    SELECT cdr.*, users.recording_permission 
    FROM cdr
    JOIN users ON users.user_id = ?
    WHERE (cdr.call_from = ? OR cdr.call_to = ?)
    ORDER BY cdr.id DESC;
  `;
  queryParams.push(userId, userId, userId);
}

else if (userType == 6 || userType == 1) {
  query = `
    SELECT cdr.*, users.recording_permission 
    FROM cdr
    JOIN users ON users.user_id = ? 
    WHERE (cdr.call_from = ? OR cdr.call_to = ?)
    ORDER BY cdr.id DESC;
  `;
  queryParams.push(userId, userId, userId);
}

  else {
    return res.status(403).json({ message: "Unauthorized user type." });
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching call records." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No call records found." });
    }

const updatedResults = results.map(row => {
  if (row.direction === "outbound") {
    const originalCallTo = row.call_to;
    const originalDid = row.did;
     const originalcallFrom = row.call_from;
    row.did = originalCallTo;
    row.call_from = originalDid;
    row.call_to = originalcallFrom;
  }  else if (row.direction === "inbound") {
    const originalDid = row.did;       
    row.did = row.call_to;
    row.call_to = originalDid;        
  }
  return row;
});

 
    return res.status(200).json(updatedResults);
  });
};


//-------------------------------Agent call REPORT PAGE--------------------------------------------------------------------

exports.getAgentcallReport = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;

  let query = "";
  let queryParams = [];

  const page = parseInt(req.query.page) || 1; 
  const limit = parseInt(req.query.limit) || 5;  
  const offset = (page - 1) * limit;

  if (userType == 8) {
    query = "SELECT * FROM cdr WHERE admin = ? LIMIT ? OFFSET ?";
    queryParams.push(userId, limit, offset);
  } else {
    
    query =
      "SELECT * FROM cdr WHERE (call_from = ? OR call_to = ?) LIMIT ? OFFSET ?";
    queryParams.push(userId, userId, limit, offset);
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching user data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No records found." });
    }

 
    const transformedResults = results.map((row) => {
      if (row.direction == "outbound") {
        const temp = row.call_to;
        row.call_to = row.did;
        row.did = temp;  
      } else {
        row.call_from = row.call_from;
      }
      return row;
    });

  
    db.query(
      "SELECT COUNT(*) as total FROM cdr WHERE (call_from = ? OR call_to = ?)",
      [userId, userId],
      (countErr, countResults) => {
        if (countErr) {
          console.error("❌ Error fetching total count:", countErr);
          return res
            .status(500)
            .json({ message: "Error fetching total count." });
        }

        return res.status(200).json({
          data: transformedResults,
          total: countResults[0].total,  
          page,
          limit,
        });
      }
    );
  });
};

//-------------------------------LEAD REPORT PAGE--------------------------------------------------------------------

exports.LeadReoprt = (req, res) => {
  const userId = req.user.userId;
  console.log("User ID from token:", req.user.userId); // Debug the userId

  const query = `SELECT DISTINCT company_info.* 
      FROM company_info 
      JOIN compaign_list 
      ON compaign_list.compaign_id = company_info.campaign_id
      WHERE compaign_list.admin = ? `;

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
      users.push(user); // Add user to an array for later use
      i++;
    }
    return res.status(200).json(users);
 
  });
};

 
exports.callReportAgentsDropdown = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;

  let query = "";
  let params = [];

  if (userType == 9) {
    query = `
      SELECT user_id , full_name
      FROM users
      WHERE (
        SuperAdmin = ? OR
        admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
      )
      AND user_type != 9
      ORDER BY id DESC
    `;
    params = [userId, userId];
  } else if (userType == 8) {
    query = `
      SELECT user_id, full_name
      FROM users
      WHERE admin = ? AND user_type != 8
      ORDER BY id DESC
    `;
    params = [userId];
  } else if (userType == 7) {
    query = `
      SELECT user_id, , full_name
      FROM users
      WHERE admin = ? AND user_type IN (1, 2, 6)
      ORDER BY id DESC
    `;
    params = [adminId];
  } else {
    return res.status(403).json({ message: "Access denied." });
  }

  console.log("👉 Executing query:", query);
  console.log("👉 With params:", params);

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ message: "Error fetching agent data." });
    }

    console.log("✅ Results from DB:", results);

    if (results.length === 0) {
      return res.status(404).json({ message: "No agents found." });
    }

    res.status(200).json(results);
  });
};


  

exports.getTotalCall = (req, res) => {
  const { type } = req.params;
  const userId = req.user.userId;
  const userType = req.user.userType;
  const adminId = req.user.admin;
  const { page = 1, pageSize = 10 } = req.query;

  if (!userId) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
 
  let whereClause = "";
  let queryParams = [];

  // User type conditions
  if (userType == 9) {
    whereClause = `
      admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
      OR admin IN (
        SELECT user_id FROM users
        WHERE admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
      )
    `;
    queryParams.push(userId, userId);
  } else if (userType == 8) {
    whereClause = `admin = ?`;
    queryParams.push(adminId);
  } else if (userType == 7 || userType == 2) {
    whereClause = `
      admin = ? OR
      admin IN (
        SELECT user_id FROM users 
        WHERE admin = ? AND user_type IN (1, 2, 6, 7) AND user_type != 8
      )
    `;
    queryParams.push(adminId, adminId);
  } else if (userType == 2) {
    whereClause = `
      admin = ? OR
      admin IN (
        SELECT user_id FROM users 
        WHERE admin = ? AND user_type IN (1, 2, 6) AND user_type != 8
      )
    `;
    queryParams.push(adminId, adminId);
  } else {
    whereClause = `(call_from = ? OR call_to = ?)`;
    queryParams.push(userId, userId);
  }

  // Call type filter
  if (type === "answerCall") {
    whereClause += " AND status = 'ANSWER'";
  } else if (type === "cancelCall") {
    whereClause += " AND status = 'CANCEL'";
  } else if (type === "noAnswerCall") {
    whereClause += " AND status = 'NOANSWER'";
  } else if (type === "inboundCall") {
    whereClause += " AND direction = 'inbound'";
  } else if (type === "outboundCall") {
    whereClause += " AND direction = 'outbound'";
  } else if (type === "otherCall") {
    whereClause += " AND status IN ('CONGESTION', 'CHANUNAVAIL')";
  }

  // Only include today's data
  whereClause += " AND DATE(start_time) = CURDATE()";
 
  const countQuery = `SELECT COUNT(*) AS total FROM cdr WHERE ${whereClause}`;
 

  db.query(countQuery, queryParams, (err, countResult) => {
    if (err) {
      console.error("❌ Error executing count query:", err.sqlMessage || err);
      return res.status(500).json({ error: "Failed to fetch data" });
    }

    const totalItems = countResult[0].total;
    const offset = (page - 1) * pageSize;

    const dataQuery = `
      SELECT * FROM cdr 
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
 
    db.query(dataQuery, [...queryParams, parseInt(pageSize), parseInt(offset)], (err, results) => {
      if (err) {
        console.error("❌ Error executing data query:", err.sqlMessage || err);
        return res.status(500).json({ error: "Failed to fetch data" });
      }

      res.json({
        data: results,
        totalItems,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalItems / pageSize),
        pageSize: parseInt(pageSize),
      });
    });
  });
};

exports.topCaller = (req, res) => {
  const adminId = req.user.userId;
  const userType = req.user.userType;

  // ✅ Only admins allowed
  // if (userType !== 8) {
  //   return res.status(403).json({ message: "Only admins can access this API." });
  // }

  const { range = "day" } = req.query;

  // ✅ Date filters
  let dateCondition = "DATE(start_time) = CURDATE()";
  if (range === "week") dateCondition = "YEARWEEK(start_time, 1) = YEARWEEK(CURDATE(), 1)";
  if (range === "month") dateCondition = "YEAR(start_time) = YEAR(CURDATE()) AND MONTH(start_time) = MONTH(CURDATE())";

  // ✅ Step 1: Get all users (agents, TLs, managers) under this admin
  const getUsersSql = `
    SELECT user_id, full_name 
    FROM users 
    WHERE admin = ? 
      AND user_type != 8
  `;
  db.query(getUsersSql, [adminId], (err, users) => {
    if (err) {
      console.error("🔥 Error fetching admin's users:", err);
      return res.status(500).json({ message: "Failed to fetch users." });
    }

    if (!users.length) {
      return res.status(200).json([]); // No sub-users
    }

    const userIds = users.map(u => u.user_id);

    // ✅ Step 2: Fetch calls for these users
    const cdrSql = `
      SELECT u.user_id, u.full_name, COUNT(*) AS calls
      FROM cdr c
      JOIN users u ON (u.user_id = c.call_from OR u.user_id = c.call_to)
      WHERE (${dateCondition})
        AND (c.call_from IN (?) OR c.call_to IN (?))
        AND c.admin = ?
      GROUP BY u.user_id, u.full_name
      ORDER BY calls DESC
      LIMIT 5
    `;

    db.query(cdrSql, [userIds, userIds, adminId], (err2, results) => {
      if (err2) {
        console.error("🔥 SQL Error in topCaller:", err2);
        return res.status(500).json({ message: "Failed to fetch top callers." });
      }

      if (!results.length) return res.status(200).json([]);

      // ✅ Calculate percentages & assign colors
      const totalCalls = results.reduce((sum, r) => sum + r.calls, 0);
      const colors = ["#4cafef","#ff9800","#8bc34a","#f44336","#9c27b0","#00bcd4","#cddc39","#ff5722","#3f51b5","#607d8b"];

      const response = results.map((r, i) => ({
        user_id: r.user_id,
        name: r.full_name || r.user_id,
        calls: Number(r.calls) || 0,
        percentage: totalCalls > 0 ? ((r.calls / totalCalls) * 100).toFixed(1) : 0,
        color: colors[i % colors.length],
      }));

      return res.status(200).json(response);
    });
  });
};


 
