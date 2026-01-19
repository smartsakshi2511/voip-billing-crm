const db= require("../models/db")

exports.chartData = (req, res) => {
  const userId = req.user.userId;
  const query = `
    SELECT
      SUM(CASE WHEN ci.dialstatus = 'interested' THEN 1 ELSE 0 END) AS interested,
      SUM(CASE WHEN ci.dialstatus = 'not interested' THEN 1 ELSE 0 END) AS not_interested
    FROM
      company_info ci
    JOIN
      compaign_list cl ON ci.campaign_id = cl.compaign_id
    WHERE
      cl.admin = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching dial status summary:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(results[0]);
  });
};

 

exports.addLead = (req, res) => {
  const userId = req.user.userId;
  const { city, email, name, phone_number, date, dialstatus, remark } = req.body;

  const getCampaignQuery = `
    SELECT campaign_name FROM login_log
    WHERE user_name = ? AND status = 1
    ORDER BY log_in_time DESC LIMIT 1
  `;

  db.query(getCampaignQuery, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching campaign_id:", err);
      return res.status(500).json({ error: "Failed to fetch campaign" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "No active login found for user" });
    }

    const campaign_id = result[0].campaign_name;

    const insertQuery = `
      INSERT INTO company_info (
        city, email, name, phone_number, date, dialstatus,
        campaign_id, upload_user, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      city || "",
      email || "",
      name || "",
      phone_number || "",
      date ? new Date(date) : new Date(),
      dialstatus || "No Answer",
      campaign_id,
      userId,
      remark || null,
    ];

    db.query(insertQuery, values, (err, result) => {
      if (err) {
        console.error("Error inserting lead:", err);
        return res.status(500).json({ error: "Failed to insert lead" });
      }
      return res.status(201).json({
        success: true,
        message: "Lead inserted successfully",
        lead_id: result.insertId, 
      });
    });
  });
};


//----------------------------------------------------------------------

exports.agentSummary = (req, res) => {
  const { status = '' } = req.query; // Remove 'date' since we filter for today
  const adminId = req.user.userId; // Extracting admin ID from the token

  let breakStatusCondition = '';
  if (status === 'Ready') {
    breakStatusCondition = "AND bt.break_status = '2' AND bt.status = '2'";
  } else if (status === 'pause') {
    breakStatusCondition = "AND bt.break_status = '2' AND bt.status = '1'";
  } else if (status === 'Logout') {
    breakStatusCondition = "AND (bt.break_status != '2' OR bt.status != '2')";
  }
  const query = `
  SELECT 
    u.user_id,  
  u.auto_dial_on,
    ll.status AS login_status,
    ll.log_in_time,
    ll.log_out_time,  
    bt.break_status,
    bt.status,
    bt.break_name,
    bt.start_time,
    bt.end_time,
    MAX(bt.end_time) AS ready_time,
    MAX(bt.start_time) AS stready_time,
    DATE_FORMAT(MAX(c.end_time), '%Y-%m-%d %H:%i:%s') AS wait_end_time,
    SEC_TO_TIME(TIMESTAMPDIFF(SECOND, MAX(c.start_time), MAX(bt.end_time))) AS wait_seconds,
    SEC_TO_TIME(TIMESTAMPDIFF(SECOND, MIN(bt.start_time), MAX(bt.end_time))) AS pause_seconds,
    SEC_TO_TIME(TIMESTAMPDIFF(SECOND, MIN(ll.log_in_time), MAX(ll.log_out_time))) AS login_duration_seconds,
 
    -- ✅ Fetch only today's call counts
    COALESCE(COUNT(CASE WHEN c.status = 'ANSWER' THEN 1 END), 0) AS answer_calls,
    COALESCE(COUNT(CASE WHEN c.status = 'CANCEL' THEN 1 END), 0) AS cancel_calls,
    COALESCE(COUNT(CASE WHEN c.status IN ('CONGESTION', 'CHANUNAVAIL', 'NOANSWER') THEN 1 END), 0) AS other_calls,
    COALESCE(COUNT(c.id), 0) AS total_calls  -- Total calls made by the agent

FROM users u
LEFT JOIN (
    SELECT ll1.* 
    FROM login_log ll1
    INNER JOIN (
        SELECT user_name, MAX(log_in_time) AS max_log_in_time
        FROM login_log
        WHERE DATE(log_in_time) = CURDATE() -- ✅ Only today's logins
        GROUP BY user_name
    ) ll2 ON ll1.user_name = ll2.user_name AND ll1.log_in_time = ll2.max_log_in_time
) ll ON ll.user_name = u.user_id
LEFT JOIN (
    SELECT bt1.* 
    FROM break_time bt1
    INNER JOIN (
        SELECT user_name, MAX(id) AS max_id
        FROM break_time
        WHERE DATE(start_time) = CURDATE() -- ✅ Only today's break time
        GROUP BY user_name
    ) bt2 ON bt1.user_name = bt2.user_name AND bt1.id = bt2.max_id
) bt ON bt.user_name = u.user_id
LEFT JOIN cdr c ON bt.user_name = c.call_to AND DATE(c.start_time) = CURDATE() -- ✅ Fetch only today's calls
WHERE u.admin = ? 
    AND u.user_type != 8 
    ${breakStatusCondition} -- Dynamic condition for status filtering
GROUP BY 
    u.user_id, 
      u.auto_dial_on,  
    ll.status, 
    ll.log_in_time, 
    ll.log_out_time, 
    bt.break_status, 
    bt.status, 
    bt.break_name, 
    bt.start_time, 
    bt.end_time
ORDER BY COALESCE(bt.id, 0) DESC;
`;

  const params = [adminId];

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Query Error:', err);
      return res.status(500).json({ error: 'Query Error' });
    }
    res.json(results);
  });
};


exports.featured = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  const filter = req.params.filter || "all";

  let dateCondition = "";

  if (filter === "today") {
    dateCondition = "AND DATE(start_time) = CURDATE()";
  } else if (filter === "weekly") {
    dateCondition = "AND WEEK(start_time) = WEEK(CURDATE())";
  } else if (filter === "monthly") {
    dateCondition = "AND MONTH(start_time) = MONTH(CURDATE())";
  }

  let baseCondition = "";
  let queryParams = [];

  if (userType == 9) {
    baseCondition = `
      admin IN (
        SELECT user_id FROM users WHERE SuperAdmin = ?
      )
      OR admin IN (
        SELECT user_id FROM users
        WHERE admin IN (
          SELECT user_id FROM users WHERE SuperAdmin = ?
        )
      )`;
    queryParams.push(userId, userId);
  } else if (userType == 8) {
    baseCondition = "admin = ?";
    queryParams.push(userId);
  } else if (userType == 7) {
    baseCondition = `
      admin = ? OR
      admin IN (
        SELECT user_id FROM users 
        WHERE admin = ? AND user_type IN (1, 2, 6) AND user_type != 8
      )`;
    queryParams.push(userId, userId);
  } else {
    baseCondition = "(call_from = ? OR call_to = ?)";
    queryParams.push(userId, userId);
  }

  const query = `
    SELECT 
      COUNT(CASE WHEN status = 'ANSWER' THEN 1 END) AS answerCall,
      COUNT(CASE WHEN status = 'CANCEL' THEN 1 END) AS cancelCall,
      COUNT(CASE WHEN status IN ('CONGESTION', 'CHANUNAVAIL') THEN 1 END) AS otherCall,
      COUNT(CASE WHEN direction = 'OUTBOUND' THEN 1 END) AS outboundCall,
      COUNT(CASE WHEN direction = 'INBOUND' THEN 1 END) AS inboundCall,
      COUNT(*) AS totalCall
    FROM cdr
    WHERE (${baseCondition}) ${dateCondition}`;

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching call counts:", err);
      return res.status(500).json({ error: "Failed to fetch call counts" });
    }

    res.json(results[0]);
  });
};

 

exports.submitVerificationForm = (req, res) => {
  const userId = req.user.userId; // Assume JWT middleware populates this

  const {
    name,
    mobile,
    altMobile,
    whoMet,
    documentsShown,
    relationWithApplicant,
    existenceInYears,
    ownedOrRented,
    personsVisited,
    feBehavior,
    contactNumberAsked,
    loanApplicationElsewhere,
    entercasenumber,
  } = req.body;

  // Step 1: Get the campaign_id of current user session
  const getCampaignQuery = `
    SELECT campaign_name FROM login_log
    WHERE user_name = ? AND status = 1
    ORDER BY log_in_time DESC LIMIT 1
  `;

  db.query(getCampaignQuery, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching campaign:", err);
      return res.status(500).json({ error: "Failed to fetch campaign" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "No active login found" });
    }

    const campaign_id = result[0].campaign_name;

    // Step 2: Insert verification form data
    const insertQuery = `
      INSERT INTO verify_form (
        name, mobile, alt_mobile, who_met, documents_shown, relation_with_applicant,
        existence_in_years, owned_or_rented, persons_visited, fe_behavior,
        contact_number_asked, loan_application_elsewhere, enter_case_number,
        campaign_id, submitted_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      mobile,
      altMobile,
      whoMet,
      documentsShown,
      relationWithApplicant,
      existenceInYears,
      ownedOrRented,
      personsVisited,
      feBehavior,
      contactNumberAsked,
      loanApplicationElsewhere,
      entercasenumber,
      campaign_id,
      userId,
    ];

    db.query(insertQuery, values, (err, result) => {
      if (err) {
        console.error("Error inserting verification form:", err);
        return res.status(500).json({ error: "Failed to insert verification form" });
      }

      return res.status(201).json({
        success: true,
        message: "Verification form submitted successfully",
        verification_id: result.insertId,
      });
    });
  });
};


exports.viewVerificationForm = (req, res) => {  
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  // login user details (JWT decode se aane chahiye)
  const loginUserId = req.user.userId;
  const loginUserType = req.user.userType;

  // Debug logs
  console.log("🔑 Login User ID:", loginUserId);
  console.log("👤 Login User Type:", loginUserType);

  // default condition: koi restriction nahi
  let whereCondition = "1=1";

  if (loginUserType == 1) {
    // Agent → sirf apna data
    whereCondition = `vf.submitted_by = ${db.escape(loginUserId)}`;
  } 
  else if (loginUserType == 8) {
    // Admin → apne sare users ka data (apne agents, managers, team leaders)
    whereCondition = `u.admin = ${db.escape(loginUserId)} OR vf.submitted_by = ${db.escape(loginUserId)}`;
  } 
  else if (loginUserType == 7) {
    // Manager → apne TL aur Agents ka data + apna
    whereCondition = `(u.admin = ${db.escape(loginUserId)} OR u.user_type IN (1,2) AND u.admin = ${db.escape(loginUserId)}) OR vf.submitted_by = ${db.escape(loginUserId)}`;
  } 
  else if (loginUserType == 2) {
    // Team Leader → apna + agents ka data
    whereCondition = `(vf.submitted_by = ${db.escape(loginUserId)} OR u.admin = ${db.escape(loginUserId)} AND u.user_type = 1)`;
  }

  console.log("📌 Final WHERE Condition:", whereCondition);

  const baseQuery = `
    SELECT 
      vf.id,
      vf.name,
      vf.mobile,
      vf.alt_mobile,
      vf.who_met,
      vf.documents_shown,
      vf.relation_with_applicant,
      vf.existence_in_years,
      vf.owned_or_rented,
      vf.persons_visited,
      vf.fe_behavior,
      vf.contact_number_asked,
      vf.loan_application_elsewhere,
      vf.enter_case_number,
      vf.campaign_id,
      vf.submitted_by,
      vf.submitted_at,
      u.full_name AS submitted_by_name,
      u.user_type AS submitted_by_type
    FROM verify_form vf
    JOIN users u ON vf.submitted_by = u.user_id   -- ✅ FIXED
    WHERE ${whereCondition}
    ORDER BY vf.submitted_at DESC
    LIMIT ? OFFSET ?
  `;

  const queryParams = [parseInt(limit), parseInt(offset)];
  console.log("📝 Final Query:", baseQuery);
  console.log("📊 Query Params:", queryParams);

  db.query(baseQuery, queryParams, (err, results) => {
    if (err) {
      console.error("❌ Error fetching verification forms:", err);
      return res.status(500).json({ error: "Database query error" });
    }

    // count with same condition
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM verify_form vf
      JOIN users u ON vf.submitted_by = u.user_id   -- ✅ FIXED
      WHERE ${whereCondition}
    `;

    console.log("🧮 Count Query:", countQuery);

    db.query(countQuery, (countErr, countResult) => {
      if (countErr) {
        console.error("❌ Error fetching count:", countErr);
        return res.status(500).json({ error: "Failed to fetch total count" });
      }

      res.status(200).json({
        data: results,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
      });
    });
  });
};




