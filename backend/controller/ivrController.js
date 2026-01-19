const db= require("../models/db")
const path = require('path');
const fs = require('fs');
const axios = require('axios')

const audioDir = path.join(__dirname, '..', 'ivr');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}



exports.getIVR =  (req, res) => {
  const userId = req.user.userId;

  const query = `SELECT * FROM texttospeech WHERE admin = ?`;

  db.query(query, [userId], (err, results) => {
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


exports.EditIVR = (req, res) => {
  const { id } = req.params;
  const { type, campaign_name } = req.body;
  const adminId = req.user.userId;

  const query = "UPDATE texttospeech SET type = ?, campaign_name = ? WHERE id = ?  AND admin = ?";
  db.query(query, [type, campaign_name, id, adminId], (err, result) => {
    if (err) {
      console.error("Error updating record:", err);
      res.status(500).json({ error: "Failed to update record" });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ error: "Record not found" });
    } else {
      res.status(200).json({ message: "Record updated successfully" });
    }
  });
};

 exports.deleteIVR =  (req, res) => {
  const id = req.params.id;

  console.log(`Delete request received for ID: ${id}`); // Log incoming request

  const query = "DELETE FROM texttospeech WHERE id = ?";
  db.query(query, [id], (error, result) => {
    if (error) {
      console.error("Error deleting disposition:", error);
      return res
        .status(500)
        .json({ error: "Database error", details: error.message });
    }

    console.log("Query Result:", result); // Log query result

    if (result.affectedRows > 0) {
      res.status(200).json({ message: "Disposition deleted successfully" });
    } else {
      res.status(404).json({ message: "Disposition not found" });
    }
  });
};





exports.AddIVR = async (req, res) => {
  const { type, text, lang, campaign_name } = req.body;
  const adminId = req.user.userId;

  if (!text || !lang) {
    return res.status(400).json({ error: "Text and language are required." });
  }

  const apiUrl = `http://ivrapi.indiantts.co.in/tts?type=indiantts&text=${encodeURIComponent(
    text
  )}&api_key=101200b0-2710-11ef-b58f-bd77d76bd7b6&user_id=190495&action=play&numeric=hcurrency&lang=${lang}&ver=2`;

  try {
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

    const filename = `${Date.now()}_${campaign_name}.wav`;
    const filePath = path.join(audioDir, filename);

    fs.writeFileSync(filePath, response.data);

    // Create IST datetime string manually
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000; // +5:30 IST offset
    const istTime = new Date(now.getTime() + istOffsetMs);
    const date = istTime.toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:mm:ss'

    const query = `
      INSERT INTO texttospeech (file_name, type, date, status, campaign_name, admin)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const status = '1';

    db.query(
      query,
      [filename, type, date, status, campaign_name, adminId],
      (err, result) => {
        if (err) {
          console.error("Error inserting data into DB:", err.message);
          return res.status(500).json({ error: "Database insertion failed." });
        }

        res.status(200).json({
          message: "Speech generated and data inserted successfully.",
          filePath: `/ivr/${filename}`,
          result,
        });
      }
    );
  } catch (error) {
    console.error("Error generating TTS:", error.message);
    if (error.response) {
      console.error("TTS API response:", error.response.data);
    }
    res.status(500).json({ error: "Failed to generate text-to-speech." });
  }
};





 
// app.post('/texttospeech', authenticateToken, async (req, res) => {
//   const { file_name, type, text, lang, campaign_name } = req.body;
//   const adminId = req.user?.userId;  // Ensure adminId exists

//   if (!text || !lang) {
//     return res.status(400).json({ error: "Text and language are required." });
//   }

//   const apiUrl = `http://ivrapi.indiantts.co.in/tts?type=indiantts&text=${encodeURIComponent(text)}&api_key=101200b0-2710-11ef-b58f-bd77d76bd7b6&user_id=190495&action=play&numeric=hcurrency&lang=${lang}&ver=2`;

//   try {
//     console.log("Fetching from API:", apiUrl);
//     const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
//     console.log("API Response Received");    

//     if (!fs.existsSync(audioDir)) {
//       fs.mkdirSync(audioDir, { recursive: true });  // Ensure directory exists first
//     }

//     const filename = file_name || `${Date.now()}_${campaign_name}.wav`;
//     const filePath = path.join(audioDir, filename);
//     fs.writeFileSync(filePath, response.data);

//     console.log("File saved at:", filePath);

//     const query = 'INSERT INTO texttospeech (file_name, type, status, campaign_name, admin) VALUES (?, ?, ?, ?, ?)';
//     // const date = new Date().toISOString();
//     const status = '1';

//     db.query(query, [filename, type, status, campaign_name, adminId], (err, result) => {
//       if (err) {
//         console.error("Database Insertion Error:", err.message);
//         return res.status(500).json({ error: "Database insertion failed", details: err.message });
//       }
//       console.log("Database Insert Success:", result);
//       res.status(200).json({
//         message: "Speech generated and data inserted successfully.",
//         filePath: `/ivr/${filename}`,
//         result,
//       });
//     });

//   } catch (error) {
//     console.error("TTS API Error:", error.response?.data || error.message);
//     return res.status(500).json({ error: "Failed to generate text-to-speech." });
//   }
// });