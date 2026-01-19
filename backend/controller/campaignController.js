const db = require('../models/db');
 
const multer = require('multer');
 
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');  
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);  
  }
});

const upload = multer({ storage: storage }).fields([
  { name: 'welcome_ivr', maxCount: 1 },
  { name: 'after_office_ivr', maxCount: 1 },
  { name: 'music_on_hold', maxCount: 1 },
  { name: 'ring_tone_music', maxCount: 1 },
  { name: 'no_agent_ivr', maxCount: 1 },
  { name: 'week_off_ivr', maxCount: 1 },
]);
 
exports.postCampaign = (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("File upload error:", err);
      return res.status(500).json({ message: "Error uploading files." });
    }
    const {
      compaign_id,
      compaignname,
      campaign_number,
      outbond_cli,
      campaign_dis,
      status,
      local_call_time,
      week_off,
      script_notes,
      ring_time,
      auto_dial_level,
      auto_dial_status,
      type,
      ivr, // ✅ include ivr here
      admin: providedAdmin,
    } = req.body;

    const userId = req.user.userId;
    const userType = req.user.userType;
    const admin = userType === "9" ? providedAdmin : userId;

    const idRegex = /^[A-Za-z0-9]+$/;
    if (!idRegex.test(compaign_id)) {
      return res.status(400).json({
        message: "Invalid Campaign ID. Only letters and numbers allowed (no spaces or special characters).",
      });
    }

    const checkQuery = "SELECT COUNT(*) AS count FROM compaign_list WHERE compaign_id = ?";
    db.query(checkQuery, [compaign_id], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error while checking duplicate ID." });
      }

      if (results[0].count > 0) {
        return res.status(400).json({ message: "Campaign ID already exists. Please use a unique one." });
      }

      const welcome_ivr = req.files["welcome_ivr"]
        ? req.files["welcome_ivr"][0].path.replace(/\\/g, "/")
        : null;
      const after_office_ivr = req.files["after_office_ivr"]
        ? req.files["after_office_ivr"][0].path.replace(/\\/g, "/")
        : null;
      const music_on_hold = req.files["music_on_hold"]
        ? req.files["music_on_hold"][0].path.replace(/\\/g, "/")
        : null;
      const ring_tone_music = req.files["ring_tone_music"]
        ? req.files["ring_tone_music"][0].path.replace(/\\/g, "/")
        : null;
      const no_agent_ivr = req.files["no_agent_ivr"]
        ? req.files["no_agent_ivr"][0].path.replace(/\\/g, "/")
        : null;
      const week_off_ivr = req.files["week_off_ivr"]
        ? req.files["week_off_ivr"][0].path.replace(/\\/g, "/")
        : null;

      // ✅ FIX: Added `ivr` before `type`
      const insertQuery = `
        INSERT INTO compaign_list (
          compaign_id, compaignname, campaign_number, outbond_cli,
          campaign_dis, status, local_call_time, week_off,
          script_notes, ring_time, auto_dial_level, auto_dial_status,
          ivr, type, admin,
          welcome_ivr, after_office_ivr, music_on_hold,
          ring_tone_music, no_agent_ivr, week_off_ivr
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        compaign_id,
        compaignname,
        campaign_number,
        outbond_cli,
        campaign_dis,
        status,
        local_call_time,
        week_off,
        script_notes,
        ring_time,
        auto_dial_level,
        auto_dial_status,
        ivr, // ✅ matches position
        type,
        admin,
        welcome_ivr,
        after_office_ivr,
        music_on_hold,
        ring_tone_music,
        no_agent_ivr,
        week_off_ivr,
      ];

      console.log("Values being inserted:", values);

      db.query(insertQuery, values, (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Error adding campaign." });
        }

        return res.status(200).json({
          message: "Campaign added successfully.",
          id: result.insertId,
          audioPaths: {
            welcome_ivr,
            after_office_ivr,
            music_on_hold,
            ring_tone_music,
            no_agent_ivr,
            week_off_ivr,
          },
        });
      });
    });
  });
};



// GET /campaigns/checkDuplicateId/:id

 exports.checkDuplicate = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT COUNT(*) AS count FROM compaign_list WHERE compaign_id = ?",
    [id],
    (error, results) => {
      if (error) {
        console.error("Error checking duplicate campaign ID:", error);
        return res
          .status(500)
          .json({ message: "Internal server error" });
      }

      if (results[0].count > 0) {
        res.json({ exists: true });
      } else {
        res.json({ exists: false });
      }
    }
  );
};


exports.getCampaigns = (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.userType;
  let query;
  let values;

  if (userType === "9") {
 
  query = `
    SELECT c.* 
    FROM compaign_list c
    WHERE c.admin IN (
      SELECT u.admin FROM users u WHERE u.SuperAdmin = ?
    )
    ORDER BY c.id DESC
  `;
    values = [userId];
  } else {
 
    query = `SELECT * FROM compaign_list WHERE admin = ? ORDER BY id DESC`;
    values = [userId];
  }

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error fetching campaign data." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "No campaigns found." });
    }

    const baseURL = "http://localhost:5000/uploads/";

    const campaigns = results.map((campaign) => {
      return {
        ...campaign,
        week_off_audio: campaign.week_off ? baseURL + campaign.week_off.replace(/\\/g, '/') : null,
        after_office_ivr_audio: campaign.after_office_ivr ? baseURL + campaign.after_office_ivr.replace(/\\/g, '/') : null,
        ivr_audio: campaign.ivr ? baseURL + campaign.ivr.replace(/\\/g, '/') : null,
        no_agent_ivr_audio: campaign.no_agent_ivr ? baseURL + campaign.no_agent_ivr.replace(/\\/g, '/') : null,
        ringtone_audio: campaign.ring_tone_music ? baseURL + campaign.ring_tone_music.replace(/\\/g, '/') : null,
      };
    });

    return res.status(200).json(campaigns);
  });
};




exports.editCampaign =  (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(500).json({ message: 'Error uploading files.' });
    }

    const {
      compaignname,
      campaign_number,
      outbond_cli,
      campaign_dis,
      status,
      local_call_time,
      week_off,
      script_notes,
      ring_time,
      auto_dial_level,
      ivr,
      type,
    } = req.body;

    const campaignId = req.params.id;
 
    const getQuery = 'SELECT * FROM compaign_list WHERE compaign_id = ?';
    db.query(getQuery, [campaignId], (getErr, results) => {
      if (getErr || results.length === 0) {
        console.error('Error fetching campaign:', getErr || 'Campaign not found');
        return res.status(404).json({ message: 'Campaign not found' });
      }

      const existingCampaign = results[0];
 
      const welcome_ivr = req.files['welcome_ivr']
        ? req.files['welcome_ivr'][0].path
        : existingCampaign.welcome_ivr;
      const after_office_ivr = req.files['after_office_ivr']
        ? req.files['after_office_ivr'][0].path
        : existingCampaign.after_office_ivr;
      const music_on_hold = req.files['music_on_hold']
        ? req.files['music_on_hold'][0].path
        : existingCampaign.music_on_hold;
      const ring_tone_music = req.files['ring_tone_music']
        ? req.files['ring_tone_music'][0].path
        : existingCampaign.ring_tone_music;
      const no_agent_ivr = req.files['no_agent_ivr']
        ? req.files['no_agent_ivr'][0].path
        : existingCampaign.no_agent_ivr;
      const week_off_ivr = req.files['week_off_ivr']
        ? req.files['week_off_ivr'][0].path
        : existingCampaign.week_off_ivr;

        const updateQuery = `
        UPDATE compaign_list SET
          compaignname = ?, campaign_number = ?, outbond_cli = ?, 
          campaign_dis = ?, status = ?, local_call_time = ?, week_off = ?, 
          script_notes = ?, ring_time = ?, auto_dial_level = ?, type = ?, 
          welcome_ivr = ?, after_office_ivr = ?, music_on_hold = ?, 
          ring_tone_music = ?, no_agent_ivr = ?, week_off_ivr = ?, ivr = ?
        WHERE compaign_id = ?
      `;
      
      const values = [
        compaignname,
        campaign_number,
        outbond_cli,
        campaign_dis,
        status,
        local_call_time,
        week_off,
        script_notes,
        ring_time,
        auto_dial_level,
        type,
        welcome_ivr,
        after_office_ivr,
        music_on_hold,
        ring_tone_music,
        no_agent_ivr,
        week_off_ivr,
        ivr,             
        campaignId     
      ];
      
      db.query(updateQuery, values, (updateErr, result) => {
        if (updateErr) {
          console.error('Database error during update:', updateErr);
          return res.status(500).json({ message: 'Error updating campaign.' });
        }

        return res.status(200).json({ message: 'Campaign updated successfully.' });
      });
    });
  });
};


// Route: PUT /campaigns/clearIvr/:id
exports.clearIVRs = (req, res) => {
  const campaignId = req.params.id;
  const clearQuery = `
    UPDATE compaign_list SET
      welcome_ivr = NULL,
      after_office_ivr = NULL,
      music_on_hold = NULL,
      ring_tone_music = NULL,
      no_agent_ivr = NULL,
      week_off_ivr = NULL
    WHERE compaign_id = ?
  `;
  db.query(clearQuery, [campaignId], (err, result) => {
    if (err) {
      console.error("Error clearing IVRs:", err);
      return res.status(500).json({ message: "Failed to clear IVRs." });
    }
    return res.status(200).json({ message: "IVRs cleared successfully." });
  });
};



exports.deleteCampaign = async (req, res) => {
  const campaignId = req.params.id;

  try {
      const result = await db.query('DELETE FROM compaign_list WHERE compaign_id = ?', [campaignId]);

   
      if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Campaign not found.' });
      }

      res.status(200).json({ message: 'Campaign deleted successfully.' });
  } catch (error) {
      console.error('Error deleting campaign:', error);
      res.status(500).json({ message: 'An error occurred while deleting the campaign.' });
  }
};


exports.statusToggler = async (req, res) => { 
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`Updating ID: ${id} with status: ${status}`);

    // Convert frontend status to DB value
    const dbStatus = status === "active" ? "Y" : "N";

    const result = await db.query(
      "UPDATE compaign_list SET status = ? WHERE id = ?",
      [dbStatus, id]
    );

    if (result.affectedRows > 0) {
      res.status(200).json({ message: "Status updated successfully" });
    } else {
      res.status(404).json({ message: "Campaign not found" });
    }
  } catch (error) {
    console.error("❌ Error updating status:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

