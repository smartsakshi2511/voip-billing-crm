const db = require('../models/db');

exports.getExtension =  (req, res) => {
  const userId = req.user.userId;

  const query = `
    SELECT vicidial_group.* 
    FROM vicidial_group 
    JOIN compaign_list 
    ON compaign_list.compaign_id = vicidial_group.campaign_id 
    WHERE compaign_list.admin = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No extensions found." });
    }

    return res.status(200).json(results);
  });
};

  //-------------------------------------------------------------------------------------------------

  exports.addExtn = (req, res) => { 
    const { group_id, group_name, campaign_id, press_key } = req.body;
    
    // ✅ Only include menu_id if needed
    const menu_id = req.body.menu_id || 0;

    if (!group_id || !group_name || !campaign_id || !press_key) {
        console.log("❌ Missing fields:", { group_id, group_name, campaign_id, press_key });
        return res.status(400).json({ message: "All fields are required." });
    }

    const query = `
      INSERT INTO vicidial_group (group_id, group_name, campaign_id, press_key, menu_id) 
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(query, [group_id, group_name, campaign_id, press_key, menu_id], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err.sqlMessage);
            return res.status(500).json({ message: "Error inserting data.", error: err.sqlMessage });
        }

        console.log("✅ Extension added:", { group_id, group_name, campaign_id, press_key, menu_id });
        return res.status(201).json({
            message: "Extension added successfully.",
            data: { group_id, group_name, campaign_id, press_key, menu_id },
        });
    });
};



  //---------------------------------------------------------------------------------------------------------

  exports.deleteExtn = (req, res) => {
    const id = req.params.id;
  
    console.log(`Delete request received for ID: ${id}`); // Log incoming request
  
    const query = "DELETE FROM vicidial_group WHERE id = ?";
    db.query(query, [id], (error, result) => {
      if (error) {
        console.error("Error deleting disposition:", error);
        return res.status(500).json({ error: "Database error", details: error.message });
      }
  
      console.log("Query Result:", result); // Log query result
  
      if (result.affectedRows > 0) {
        res.status(200).json({ message: "Disposition deleted successfully" });
      } else {
        res.status(404).json({ message: "Disposition not found" });
      }
    });
  };
  //--------------------------------------------------------------------------------------------------------


  exports.editExtn = (req, res) => {
    const { id } = req.params;
    const { group_id, group_name, campaign_id, press_key, menu_id } = req.body;

    console.log("Received update request:", { id, group_id, group_name, campaign_id, press_key, menu_id });

    if (!group_id || !group_name || !press_key) {
        return res.status(400).json({ message: "Group ID, Group Name, and Press Key are required." });
    }

    // Ensure menu_id has a valid default value if NULL is not allowed
    const validMenuId = menu_id ?? "";  // Use an empty string or default value

    const query = `
      UPDATE vicidial_group
      SET group_id = ?, group_name = ?, campaign_id = ?, press_key = ?, menu_id = ?
      WHERE id = ?
    `;

    db.query(
        query,
        [group_id, group_name, campaign_id, press_key, validMenuId, id],  // Ensure a valid menu_id
        (err, results) => {
            if (err) {
                console.error("Database error:", err.sqlMessage || err);
                return res.status(500).json({ message: "Database error", error: err.sqlMessage || err });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ message: "Group not found or not authorized to update." });
            }

            return res.status(200).json({ message: "Group updated successfully." });
        }
    );
};




  //=================================================================================================

  // exports.getAgentExt = (req, res) => {
  //   const userId = req.user.userId;
  //   const query = "SELECT user_id, full_name FROM users WHERE admin = ? AND user_type != 8 ORDER BY id DESC";
  //   // const query = "SELECT * FROM group_agent WHERE agent_id=? AND group_id=?";
  
  
  //   db.query(query, [userId], (err, results) => {
  //     if (err) {
  //       console.error("Database error:", err);
  //       return res.status(500).json({ message: "Error fetching agent data." });
  //     }
  
  //     if (results.length === 0) {
  //       return res.status(404).json({ message: "No agents found." });
  //     }
  
  //     res.status(200).json(results);
  //   });
  // }




  // exports.getAgentExt = (req, res) => {
  //   const userId = req.user.userId;
  //   const userType = req.user.userType
  //   // const adminId = req.user.admin;
  //   console.log("user_type:", userType);
  //   console.log("userId:", userId);
  //   // console.log("adminId:", adminId);
  
  //   let query = "";
  //   let params = [];
  
  //   if (userType == 9) {
  //     // Super Admin: get admins created by this super admin
  //     query = `
  //       SELECT u.user_id, u.full_name
  //       FROM users u
  //       WHERE u.admin IN (
  //         SELECT user_id FROM users WHERE SuperAdmin = ?
  //       )
  //       AND u.user_type != 9
  //       ORDER BY u.id DESC
  //     `;
  //     params = [userId, userId];
  
  //   } else if (userType == 8) {
  //     // Admin: show all users created by this admin
  //     query = `
  //       SELECT user_id, full_name
  //       FROM users
  //       WHERE admin = ? AND user_type != 8
  //       ORDER BY id DESC
  //     `;
  //     params = [userId];
  
  //   } else if (userType == 7) {
  //     // Manager: show only their team (agents, TLs, QAs)
  //     query = `
  //       SELECT user_id, full_name
  //       FROM users
  //       WHERE admin = ? AND user_type IN (1, 2, 6)
  //       ORDER BY id DESC
  //     `;
  //     params = [userId];
  
  //   } else {
  //     return res.status(403).json({ message: "Access denied." });
  //   }
  
  //   db.query(query, params, (err, results) => {
  //     if (err) {
  //       console.error("Database error:", err);
  //       return res.status(500).json({ message: "Error fetching agent data." });
  //     }
  
  //     if (results.length === 0) {
  //       return res.status(404).json({ message: "No agents found." });
  //     }
  
  //     res.status(200).json(results);
  //   });
  // };
  
  exports.getAgentExt = (req, res) => {
    const userId = req.user.userId;
    const userType = req.user.userType;
    const adminId = req.user.admin;
  
    console.log("user_type:", userType);
    console.log("userId:", userId);
    console.log("adminId:", adminId);
  
    let query = "";
    let params = [];
  
    if (userType == 9) {
      // ✅ Super Admin: get their admins + users under those admins
      query = `
        SELECT user_id, full_name
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
      // Admin: show all users created by this admin
      query = `
        SELECT user_id, full_name
        FROM users
        WHERE admin = ? AND user_type != 8
        ORDER BY id DESC
      `;
      params = [userId];
  
    } else if (userType == 7) {
      // Manager: show only their team (agents, TLs, QAs)
      query = `
        SELECT user_id, full_name
        FROM users
        WHERE admin = ? AND user_type IN (1, 2, 6)
        ORDER BY id DESC
      `;
      params = [adminId];
  
    } else {
      return res.status(403).json({ message: "Access denied." });
    }
    console.log("Query to run:", query);
    console.log("Query params:", params);
    
    db.query(query, params, (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Error fetching agent data." });
      }
  
      if (results.length === 0) {
        return res.status(404).json({ message: "No agents found." });
      }
  
      res.status(200).json(results);
    });
  };
  

  //====================================================================================================

  exports.getAgentsExtension = (req, res) => {
    const { group_id } = req.params;
    if (!group_id) {
      console.error("Group ID is missing from request params.");
      return res.status(400).send("Group ID is required.");
    }
    const query = `SELECT * FROM group_agent WHERE group_id = ?`;
    db.query(query, [group_id], (err, results) => {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).send("Internal Server Error.");
      }  
      console.log("Results:", results); // Log the database results
      if (!results.length) {
        console.warn(`No agents found for group_id: ${group_id}`);
        return res.json([]); // Return empty array if no agents found
      }  
      res.json(results); // Send results
    });  
  };
  
  //--------------------------------Extension (ManageAccountsIcon) GET (Agent Name & Agent ID) query-------------------------------


exports.agentsExtension= (req, res) => {
  const userId = req.user.userId;
  const query = "SELECT user_id, full_name FROM users WHERE admin = ? AND user_type != 8 ORDER BY id DESC";
  // const query = "SELECT * FROM group_agent WHERE agent_id=? AND group_id=?";


  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching agent data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No agents found." });
    }

    res.status(200).json(results);
  });
};


//--------------------------------Extension (assign an agent) POST (Agent Name & Agent ID) query------------------------------

// exports.assignAgent =  (req, res) => {
//   const { groupId, campaignId, agents, admin } = req.body; // Add 'admin' to the request body
//   const userId = req.user?.userId;

//   if (!userId) {
//     return res.status(403).json({ message: "Unauthorized access." });
//   }

//   if (!Array.isArray(agents) || agents.length === 0) {
//     return res.status(400).json({ message: "Invalid agents array." });
//   }

//   try {
//     // Construct values for insertion
//     const values = agents.map((agent) => {
//       if (!agent.user_id || !agent.full_name) {
//         throw new Error(`Invalid agent data: ${JSON.stringify(agent)}`);
//       }
//       return [
//         groupId,
//         campaignId,
//         agent.user_id,
//         agent.full_name,
//         admin || userId, // Use admin from request or default to userId
//         1 ||null, // press_key is null by default
//       ];
//     });

//     const query = `
//       INSERT INTO group_agent (group_id, campaign_id, agent_id, agent_name, admin, press_key)
//       VALUES ? 
//       ON DUPLICATE KEY UPDATE 
//       group_id = VALUES(group_id), 
//       campaign_id = VALUES(campaign_id),
//       admin = VALUES(admin),
//       press_key = VALUES(press_key);
//     `;

//     // Debug logs
//     console.log("Constructed Query:", query);
//     console.log("Constructed Values:", values);

//     // Execute the query
//     db.query(query, [values], (err, result) => {
//       if (err) {
//         console.error("SQL Error:", err.sqlMessage || err.message, err);
//         return res.status(500).json({ message: "Error assigning agents.", error: err });
//       }
//       res.status(200).json({
//         message: "Agents assigned successfully.",
//         affectedRows: result.affectedRows,
//       });
//     });
//   } catch (error) {
//     console.error("Processing Error:", error.message);
//     res.status(500).json({ message: "Internal Server Error.", error: error.message });
//   }
// };


exports.assignAgent = (req, res) => {
  const { groupId, campaignId, agents, admin } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(403).json({ message: "Unauthorized access." });
  }

  if (!Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ message: "Invalid agents array." });
  }

  try {
    const values = agents.map((agent) => {
      const agentName = agent.full_name && agent.full_name.trim() !== "" ? agent.full_name : agent.user_id; // Use agent_id if full_name is empty
      return [
        groupId,
        campaignId,
        agent.user_id,
        agentName,  
        admin || userId,
        1 || null,
      ];
    });

    const query = `
      INSERT INTO group_agent (group_id, campaign_id, agent_id, agent_name, admin, press_key)
      VALUES ? 
      ON DUPLICATE KEY UPDATE 
      group_id = VALUES(group_id), 
      campaign_id = VALUES(campaign_id),
      agent_name = VALUES(agent_name),
      admin = VALUES(admin),
      press_key = VALUES(press_key);
    `;

    console.log("Constructed Query:", query);
    console.log("Constructed Values:", values);

    db.query(query, [values], (err, result) => {
      if (err) {
        console.error("SQL Error:", err.sqlMessage || err.message, err);
        return res.status(500).json({ message: "Error assigning agents.", error: err });
      }
      res.status(200).json({
        message: "Agents assigned successfully.",
        affectedRows: result.affectedRows,
      });
    });
  } catch (error) {
    console.error("Processing Error:", error.message);
    res.status(500).json({ message: "Internal Server Error.", error: error.message });
  }
};


//=================================================================================


exports.deleteAssignAgents = (req, res) => {
  const { id } = req.params; // Use 'id' instead of 'group_id'

  if (!id) {
    console.error("ID is missing from request params.");
    return res.status(400).send("ID is required.");
  }

  const query = `DELETE FROM group_agent WHERE id = ?`;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).send("Internal Server Error.");
    }

    if (result.affectedRows === 0) {
      console.warn(`No record found with id: ${id}`);
      return res.status(404).send("Record not found.");
    }

    res.status(200).send("Record deleted successfully.");
  });
};


//============================================================================

exports.getAgentsByGroup= (req, res) => {
  const { group_id } = req.params;

  if (!group_id) {
    console.error("Group ID is missing from request params.");
    return res.status(400).send("Group ID is required.");
  }

  const query = `SELECT * FROM group_agent WHERE group_id = ?`;

  db.query(query, [group_id], (err, results) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).send("Internal Server Error.");
    }

    console.log("Query result:", results);

    if (!results.length) {
      console.warn(`No agents found for group_id: ${group_id}`);
      return res.status(404).send("No agents found for the given group ID.");
    }

    res.json(results);
  });
}