 // group controller 
 
 const db= require("../models/db")


//---------------------------edit group------------------------------------------------------

exports.editGroup = (req, res) => {
  const { id } = req.params; // The group id from the URL
  const adminId = req.user.userId; // Decoded user ID from JWT token
  const { group_id, agent_name, press_key, campaign_id } = req.body;
 
  if (!group_id || !agent_name || !press_key) {
    return res.status(400).json({ message: "Group ID, Agent Name, and Press Key are required." });
  }

  // Update query
  const query = `
    UPDATE group_agent 
    SET group_id = ?, agent_name = ?, press_key = ?, campaign_id = ? 
    WHERE id = ? AND admin = ?
  `;
 
  db.query(
    query,
    [group_id, agent_name, press_key, campaign_id || null, id, adminId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Error updating group." });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ message: "Group not found or not authorized to update." });
      }

      return res.status(200).json({ message: "Group updated successfully." });
    }
  );
};




//-------------------------delete group-----------------------------------------------------

exports.deleteGroup = (req, res) => {
  const adminId = req.user.userId; // Assuming `req.user` contains decoded JWT data
  const groupId = req.params.id;

  // Validate the group ID
  const query = "SELECT * FROM group_agent WHERE id = ? AND admin = ?";
  db.query(query, [groupId, adminId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error checking group data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Group not found or unauthorized." });
    }
 
    const deleteQuery = "DELETE FROM group_agent WHERE id = ?";
    db.query(deleteQuery, [groupId], (err) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Error deleting group." });
      }

      return res.status(200).json({ message: "Group deleted successfully." });
    });
  });
};

//----------------------------------create group-----------------------------------------------

exports.addGroup = (req, res) => {
  const adminId = req.user.userId;
  const { group_id, agent_id, agent_name, campaign_id, press_key } = req.body;
 
  if (!group_id || !agent_id || !agent_name || !press_key) {
    return res.status(400).json({ message: "All required fields must be filled." });
  }

  const query = `
    INSERT INTO group_agent (group_id, agent_id, agent_name, admin, campaign_id, press_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    query,
    [group_id, agent_id, agent_name, adminId, campaign_id || null, press_key],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Error adding group." });
      }

      return res.status(200).json({ message: "Group added successfully." });
    }
  );
}


// ----------------------------------------------- get data from database to show in frontend----------------------------------- 
exports.getGroup= (req, res) => {
  const adminId = req.user.userId;  
  const query = "SELECT * FROM group_agent WHERE admin = ? ORDER BY group_id DESC";

  db.query(query, [adminId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching group data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No groups found." });
    }

    // Return groups as a JSON response
    return res.status(200).json(results);
  });
};



// -----------------------------------------------group chat ----------------------------------- 

// ✅ Create Group (Admin only)
exports.addGroupChats = (req, res) => {
  try {
    const { group_name, created_by, members } = req.body;

    console.log("➡️ Received group_name:", group_name);
    console.log("➡️ Received created_by:", created_by);
    console.log("➡️ Received members (raw):", members);

    // Convert members array to valid JSON string
    const membersJSON = JSON.stringify(members);

    console.log("➡️ Final membersJSON:", membersJSON);

    const query = `INSERT INTO chat_groups (group_name, created_by, members) VALUES (?, ?, ?)`;

    console.log("🟢 Executing SQL:", query, "with values:", [group_name, created_by, membersJSON]);

    db.query(query, [group_name, created_by, membersJSON], (err, result) => {
      if (err) {
        console.error("❌ Database insert error:", err);
        return res.status(500).json({ success: false, error: err.message });
      }

      console.log("✅ Group created successfully!");
      res.status(200).json({ success: true, message: "Group created successfully!" });
    });
  } catch (error) {
    console.error("❌ Error in addGroupChats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};



// ✅ Get groups of a particular user (Admin/User)
exports.getChatGroup = (req, res) => {
  const userId = req.params.userId;
  console.log("➡️ Received userId:", userId);

  // ✅ Show groups where user is either a member OR the creator
  const sql = `
    SELECT * FROM chat_groups
    WHERE JSON_CONTAINS(members, JSON_QUOTE(?))
    OR created_by = ?
  `;

  db.query(sql, [userId, userId], (err, rows) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    console.log("📦 Query Result Rows:", rows);

    if (rows.length === 0) {
      console.warn(`⚠️ No groups found for user: ${userId}`);
    }

    res.json(rows);
  });
};

