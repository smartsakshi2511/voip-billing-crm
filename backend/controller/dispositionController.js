const db = require("../models/db");

exports.getDispo = (req, res) => {
  const { userId, userType } = req.user;

  let query;
  let queryParam = [userId];

  if (userType == 8) {
    query = `SELECT * FROM dispo WHERE admin = ? ORDER BY id DESC`;
  } else {
    query = `SELECT * FROM dispo WHERE username = ? ORDER BY id DESC`;
  }

  db.query(query, queryParam, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching data." });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "No dispositions found." });
    }

    return res.status(200).json(result);
  });
};

 
exports.editDispo = (req, res) => {
  const { id } = req.params;
  const { dispo, campaign_id, status, admin } = req.body; 

  const adminUserId = req.user.userId;   // token wala user
  const userType = req.user.userType;    // token se user_type

  console.log("🔹 API Hit: /updateDis/:id");
  console.log("➡️ Params.id:", id);
  console.log("➡️ Body:", req.body);
  console.log("➡️ Token User:", { adminUserId, userType });

  if (!dispo || !campaign_id || !status) {
    console.warn("⚠️ Missing required fields");
    return res.status(400).json({ message: "All fields are required." });
  }

  const campaignIdString = Array.isArray(campaign_id)
    ? campaign_id.join(",")
    : campaign_id;

  const statusValue =
    status?.toLowerCase?.() === "active" || status === 1 ? 1 : 2;

  let query, params;

  if (userType === "9") {
    query = `
      UPDATE dispo 
      SET dispo = ?, campaign_id = ?, status = ?, admin = ?, username = ?
      WHERE id = ?
    `;
    params = [dispo, campaignIdString, statusValue, admin, adminUserId, id];
  } else {
    query = `
      UPDATE dispo 
      SET dispo = ?, campaign_id = ?, status = ?, username = ?
      WHERE id = ? AND admin = ?
    `;
    params = [dispo, campaignIdString, statusValue, adminUserId, id, adminUserId];
  }

  console.log("📝 Final Query:", query);
  console.log("📝 Query Params:", params);

  db.query(query, params, (err, result) => {
    if (err) {
      console.error("❌ Error updating record:", err);
      return res.status(500).json({ message: "Failed to update record." });
    }

    console.log("✅ Query Result:", result);

    if (result.affectedRows === 0) {
      console.warn("⚠️ No record updated (maybe wrong id/admin mismatch)");
      return res.status(404).json({ message: "Record not found." });
    }

    res.status(200).json({ message: "Record updated successfully." });
  });
};



exports.deleteDispo = (req, res) => {
  const id = req.params.id;
  const adminId = req.user.userId;

  const query = " DELETE FROM dispo WHERE id = ? AND admin = ?";

  db.query(query, [id, adminId], (error, result) => {
    if (error) {
      console.error("Error deleting disposition:", error);
      return res
        .status(500)
        .json({ error: "Database error", details: error.message });
    }
    if (result.affectedRows > 0) {
      res.status(200).json({ message: "Disposition deleted successfully" });
    } else {
      res.status(404).json({ message: "Disposition not found " });
    }
  });
};

// exports.addDispo = (req, res) => {
//   console.log("Request Body:", req.body);

//   const { admin, userId } = req.user; // Assuming token contains both admin and user_id

//   if (!admin || !userId) {
//     return res.status(400).json({ error: "Invalid token: missing admin or user_id" });
//   }

//   let { dispositionName, campaignId, status } = req.body;

//   status = status.toLowerCase() === "active" ? 1 : 2;

//   const currentDateTime = new Date();

//   const query = `INSERT INTO dispo (dispo, campaign_id, status, ins_date, admin, username) VALUES (?,?,?,?,?,?)`;
//   const values = [
//     dispositionName,
//     campaignId,
//     status,
//     currentDateTime,
//     admin,   // admin from token
//     userId  // user_id from token
//   ];

//   db.query(query, values, (err, result) => {
//     if (err) {
//       console.error("Error inserting data:", err.message);
//       return res
//         .status(500)
//         .json({ error: "Database insertion failed", details: err.message });
//     }

//     res.status(201).json({ message: "Disposition added successfully", result });
//   });
// };

// exports.addDispo = (req, res) => {
//   console.log("Request Body:", req.body);

//   const { admin, userId } = req.user;

//   if (!admin || !userId) {
//     return res.status(400).json({ error: "Invalid token: missing admin or user_id" });
//   }

//   let { dispositionName, campaignId, status, reminder } = req.body;
//   status = status?.toLowerCase() === "active" ? 1 : 2;

//   const currentDateTime = new Date();

//   const dispoQuery = `INSERT INTO dispo (dispo, campaign_id, status, ins_date, admin, username) VALUES (?,?,?,?,?,?)`;
//   const dispoValues = [
//     dispositionName,
//     campaignId,
//     status,
//     currentDateTime,
//     admin,
//     userId
//   ];

//   db.query(dispoQuery, dispoValues, (err, result) => {
//     if (err) {
//       console.error("Error inserting into dispo:", err.message);
//       return res.status(500).json({ error: "Dispo insertion failed", details: err.message });
//     }

//     // If reminder checkbox is checked
//     if (reminder === true || reminder === "true") {
//       const reminderQuery = `INSERT INTO reminders (user_id, datetime, message, created_at) VALUES (?, ?, ?, ?)`;
//       const reminderValues = [
//         userId,
//         currentDateTime,
//         dispositionName, // use as message
//         currentDateTime
//       ];

//       db.query(reminderQuery, reminderValues, (remErr, remResult) => {
//         if (remErr) {
//           console.error("Error inserting into reminders:", remErr.message);
//           return res.status(500).json({ error: "Reminder insertion failed", details: remErr.message });
//         }

//         res.status(201).json({
//           message: "Disposition and Reminder added successfully",
//           dispoResult: result,
//           reminderResult: remResult
//         });
//       });
//     } else {
//       // If no reminder is checked
//       res.status(201).json({
//         message: "Disposition added successfully",
//         result
//       });
//     }
//   });
// };



// exports.addDispo = (req, res) => {
//   // console.log("Request Body:", req.body);

//   const { admin, userId } = req.user;
//   if (!admin || !userId) {
//     return res.status(400).json({ error: "Invalid token: missing admin or user_id" });
//   }

//   let { dispositionName, campaignId, status, reminder, datetime } = req.body;
//   status = status?.toLowerCase() === "active" ? 1 : 2;

//   const currentDateTime = new Date();

//   const dispoQuery = `INSERT INTO dispo (dispo, campaign_id, status, ins_date, admin, username) VALUES (?,?,?,?,?,?)`;
//   const dispoValues = [
//     dispositionName,
//     campaignId,
//     status,
//     currentDateTime,
//     admin,
//     userId,
//   ];

//   db.query(dispoQuery, dispoValues, (err, result) => {
//     if (err) {
//       console.error("Error inserting into dispo:", err.message);
//       return res.status(500).json({ error: "Dispo insertion failed", details: err.message });
//     }

//     // Insert reminder only if checkbox is checked and time is provided
//     if ((reminder === true || reminder === "true") && datetime) {
//       const reminderQuery = `INSERT INTO reminders (user_id, datetime, message) VALUES (?, ?, ?)`;
//       const reminderValues = [
//         userId,
//         datetime,         // 👈 Use selected date-time
//         dispositionName,      // Message
//             // Created at = now
//       ];

//       db.query(reminderQuery, reminderValues, (remErr, remResult) => {
//         if (remErr) {
//           console.error("Error inserting into reminders:", remErr.message);
//           return res.status(500).json({ error: "Reminder insertion failed", details: remErr.message });
//         }

//         res.status(201).json({
//           message: "Disposition and Reminder added successfully",
//           dispoResult: result,
//           reminderResult: remResult
//         });
//       });
//     } else {
//       res.status(201).json({
//         message: "Disposition added successfully",
//         result
//       });
//     }
//   });
// };

exports.addDispo = (req, res) => {
  console.log("Request Body:", req.body);
  console.log("Decoded User:", req.user);
  // const userType = req.user.userType;

  const { admin, userId, userType } = req.user;
  if (!userId) {
    return res.status(400).json({ error: "Invalid token: missing user_id" });
  }
  console.log("Decoded User:", req.user);  
  console.log("Admin:", req.user?.admin, " | UserId--:", req.user?.userId);

  let { dispositionName, campaignId, status, reminder } = req.body;

  // ✅ superadmin case handle
  let finalAdmin = admin;
  let finalUsername = userId;

  if (userType === "9") {
    // superadmin → dropdown से लिया हुआ admin
    finalAdmin = req.body.admin;  
    finalUsername = userId;       // token से आया userId username में
  }

  // ✅ Join multiple campaign IDs into a comma-separated string
  campaignId = Array.isArray(campaignId) ? campaignId.join(",") : campaignId;

  // Convert status to number format
  status = status?.toLowerCase() === "active" ? 1 : 2;

  const currentDateTime = new Date();

  const dispoQuery = `
    INSERT INTO dispo (
      dispo,
      campaign_id,
      status,
      ins_date,
      admin,
      username,
      reminder
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const dispoValues = [
    dispositionName,
    campaignId,
    status,
    currentDateTime,
    finalAdmin,
    finalUsername,
    reminder === 1 ? 1 : 0,
  ];

  db.query(dispoQuery, dispoValues, (err, result) => {
    if (err) {
      console.error("Error inserting into dispo:", err.message);
      return res.status(500).json({ error: "Dispo insertion failed", details: err.message });
    }

    const insertedId = result.insertId;

    const selectQuery = `SELECT * FROM dispo WHERE id = ?`;
    db.query(selectQuery, [insertedId], (selectErr, selectResult) => {
      if (selectErr) {
        console.error("Error fetching inserted dispo:", selectErr.message);
        return res.status(500).json({ error: "Dispo fetch failed", details: selectErr.message });
      }

      const insertedDispo = selectResult[0];

      return res.status(201).json({
        message: "Disposition added successfully",
        data: insertedDispo,
      });
    });
  });
};





exports.ViewById = (req, res) => {
  const id = req.params.id;
  const sql = "SELECT * FROM dispo WHERE id = ?";
  db.query(sql, [id], (err, data) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    if (data.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given ID" });
    }
    return res.json(data[0]);
  });
};

exports.statusToggler = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Receive numeric status (1 or 2)

    console.log(`Updating status for id: ${id}, status: ${status}`);

    // Update the status in the database
    const result = await new Promise((resolve, reject) => {
      db.query(
        "UPDATE dispo SET status = ? WHERE id = ?",
        [status, id],
        (error, results) => {
          if (error) reject(error);
          else resolve(results);
        }
      );
    });

    if (result.affectedRows > 0) {
      res.status(200).json({ message: "Status updated successfully" });
    } else {
      res.status(404).json({ message: "Disposition not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating status", error });
  }
};
