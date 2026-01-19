const db= require("../models/db")

exports.getList =(req, res) => {
  const userId = req.user.userId;

  const query = "SELECT * FROM lists WHERE admin=? ORDER BY id ASC"; // Adjust the table name if necessary
  db.query(query,  [userId], (err, result) => {
    if (err) {
      console.error("Error fetching data from database:", err);
      return res.status(500).send("Error fetching data");
    } 
     if (result.length === 0) {  // Corrected to `result`
      return res.status(404).json({ message: "No extensions found." });
    }

    return res.status(200).json(result);  // Corrected to `result`

  });
};

  
  












//   app.put("/lists/:id", authenticateToken, (req, res) => {
//     const { id } = req.params; // This id is the URL parameter
//     const { NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE } = req.body;
//     const LIST_UP_DATE = new Date(); // Current timestamp
  
//     // Assuming the ID in the URL is the correct identifier
//     const query = ` 
//       UPDATE lists
//       SET NAME = ?, DESCRIPTION = ?, LEADS_COUNT = ?, CAMPAIGN = ?, ACTIVE = ?, LIST_UP_DATE = ?
//       WHERE ID = ? AND ADMIN = ?` // Changed LIST_ID to ID
//     ;
  
//     db.query(
//       query,
//       [NAME, DESCRIPTION, LEADS_COUNT, CAMPAIGN, ACTIVE ? 1 : 0, LIST_UP_DATE, id, req.user.userId],
//       (err, result) => {
//         if (err) {
//           console.error("Error updating list:", err);
//           return res.status(500).json({ message: "Error updating list.", error: err });
//         }
  
//         if (result.affectedRows === 0) {
//           return res.status(404).json({ message: "List not found or unauthorized." });
//         }
  
//         res.status(200).json({
//           message: "List updated successfully.",
//           updatedList: {
//             ID: id,  // Make sure to return the correct identifier here
//             NAME,
//             DESCRIPTION,
//             LEADS_COUNT,
//             CAMPAIGN,
//             ACTIVE,
//             LIST_UP_DATE,
//           },
//         });
//       }
//     );
//   });
  