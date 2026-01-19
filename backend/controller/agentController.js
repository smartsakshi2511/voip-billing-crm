const db= require("../models/db")

exports.getList =  (req, res) => {
    db.query('SELECT * FROM agentlist', (err, result) => {
      if (err) return res.json(err);
      return res.json(result);
    });
  };
  //----------------------update--------------------------------------

  exports.editAgent =  (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;
  
    console.log("Incoming Request Body:", updatedData);   
  
    const sql = `UPDATE agentlist SET username = ?, password = ?, external = ?, campaign = ?, usertype = ?, did = ? WHERE userid = ?`;
    const values = [
      updatedData.username,
      updatedData.password,
      updatedData.external,
      updatedData.campaign,
      updatedData.usertype,
      updatedData.did,
      id,
    ];
  
    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error executing query:", err);
        res.status(500).json({ message: 'Error updating user' });
        return;
      }
      res.status(200).json({ message: 'User updated successfully' });
    });
  };

  //---------------------------add AGENT---------------------------------------

  exports.addAgent =  (req, res) => {
    console.log("Request Body:", req.body);  // Log the request body
  
    const { userID, username, did, password, usertype, external, campaign } = req.body;
  
    const query = `INSERT INTO agentlist (userid, username, did, password, usertype, external, campaign) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const values = [userID, username, did, password, usertype, external, campaign];
  
    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error inserting data:", err.message);
        return res.status(500).json({ error: "Database insertion failed", details: err.message });
      }
      res.status(201).json({ message: "User added successfully", result });
    });
  };

  //--------------------------delete --------------------

  exports.deleteAgent =  (req, res) => {
    const { id } = req.params;
  
    const query = "DELETE FROM agentlist WHERE userid = ?";
    console.log(`Deleting user with ID: ${id}`);
  
    db.query(query, [id], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send({ message: "Error deleting user", error: err });
      }
  
      if (result.affectedRows === 0) {
        return res.status(404).send({ message: "User not found" });
      }
  
      res.status(200).send({ message: `User with ID ${id} deleted successfully.` });
    });
  }

// ------------search query---------------

 exports.searchAgent = (req, res) => {
    const userid = req.params.userid;
  
    const sql = "SELECT * FROM agentlist WHERE userid = ?";
    db.query(sql, [userid], (err, data) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Database query failed" });
      }
  
      if (data.length === 0) {
        return res.status(404).json({ message: "No records found for the given ID" });
      }
  
  
      return res.json(data[0]);
    });
  }


  
//------------ view agent query---------------
 
 exports.ViewAgentDeatils =  (req, res) => { 
  const userId = req.params.userid; // Ensure this matches the frontend useParams()

  const sql = "SELECT password, user_type, agent_priorty, full_name, status, campaigns_id, use_did, ext_number FROM users WHERE user_id = ? AND admin = ?";
  db.query(sql, [userId], (err, data) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (data.length === 0) {
      return res.status(404).json({ message: "No records found for the given ID" });
    }

    return res.json(data[0]); // Return user details
  });
};


//   //============================== AGENTS DETAILS ========================================================
 