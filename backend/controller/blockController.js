const db = require('../models/db')


exports.getBlock =  (req, res) => {
    const adminId = req.user.admin;
  
    const query = `SELECT * FROM block_no WHERE admin=? ORDER BY id ASC`;
    db.query(query, [adminId], (err, result) => {  // Use `result` here instead of `results`
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Error fetching data." });
      }
  
      if (result.length === 0) {  // Corrected to `result`
        return res.status(404).json({ message: "No extensions found." });
      }
  
      return res.status(200).json(result);  // Corrected to `result`
    });
  };


exports.addBlock = (req, res) => {
  let { block_no } = req.body;
  const adminId = req.user.admin;

  const cleanedBlockNo = block_no.replace(/\D/g, '');
  const last10Digits = cleanedBlockNo.slice(-10);

  const checkQuery = `
    SELECT * FROM block_no 
    WHERE RIGHT(block_no, 10) = ? AND admin = ?
  `;

  db.query(checkQuery, [last10Digits, adminId], (checkError, checkResult) => {
    if (checkError) {
      console.error("Error checking block:", checkError.message);
      return res.status(500).json({
        success: false,
        message: "Database error during check",
        details: checkError.message,
      });
    }

    if (checkResult.length > 0) {
      const existingBlock = checkResult[0];
      if (existingBlock.status === 1) {
        // Already blocked
        return res.status(409).json({
          success: false,
          message: "This number is already blocked",
        });
      } else {
        // Unblocked, so re-block it
        const updateQuery = `UPDATE block_no SET status = 1 WHERE id = ?`;
        db.query(updateQuery, [existingBlock.id], (updateError, updateResult) => {
          if (updateError) {
            console.error("Error updating block status:", updateError.message);
            return res.status(500).json({
              success: false,
              message: "Error updating block status",
              details: updateError.message,
            });
          }

          return res.status(200).json({
            success: true,
            message: "Number re-blocked successfully",
            id: existingBlock.id,
          });
        });
        return;
      }
    }

    // If not found, insert as new
    const insertQuery = "INSERT INTO block_no (block_no, admin, status) VALUES (?, ?, 1)";
    db.query(insertQuery, [block_no, adminId], (insertError, result) => {
      if (insertError) {
        console.error("Error inserting block:", insertError.message);
        return res.status(500).json({
          success: false,
          message: "Database error during insert",
          details: insertError.message,
        });
      }

      res.status(201).json({
        success: true,
        message: "Block added successfully",
        id: result.insertId,
      });
    });
  });
};


 
exports.deleteBlock=(req, res) => {
    const blockId = req.params.id; // Get the id from the request parameters
    const adminId = req.user.admin; // Extract userId from the decoded token
  
    const query = "DELETE FROM block_no WHERE id = ? AND admin = ?"; // Ensure the admin is authorized to delete the block
  
    db.query(query, [blockId, adminId], (error, result) => {
      if (error) {
        console.error("Error deleting block:", error);
        return res.status(500).json({ error: "Database error", details: error.message });
      }
  
      if (result.affectedRows > 0) {
        res.status(200).json({ message: "Block deleted successfully" });
      } else {
        res.status(404).json({ message: "Block not found or not authorized" });
      }
    });
  }

 

exports.statusBlock =  (req, res) => {
  const { id, status } = req.body;

  if (id === undefined || status === undefined) {
    return res.status(400).json({ success: false, message: "ID and status are required." });
  }

  const query = "UPDATE block_no SET status = ? WHERE id = ?";
  
  db.query(query, [status, id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ success: false, message: "Error updating status." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Block ID not found." });
    }

    res.json({ success: true, message: "Status updated successfully.", newStatus: status });
  });
};
 
exports.getStatusBlock = async (req, res) => {
    try {
      const query = "SELECT id, block_no, IF(status=1, 'active', 'inactive') AS status FROM block_no";
      const results = await db.query(query);
      res.status(200).json(results);
    } catch (error) {
      console.error("Error in GET /blockStatus:", error); // Add detailed logs
      res.status(500).json({
        message: "Internal Server Error",
        error: error.message, // Include detailed error in the response (development only)
      });
    }
  };
 