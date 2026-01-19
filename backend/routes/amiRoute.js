const express = require("express");
const router = express.Router();
const { hangupChannel } = require("../controller/call_hangup");

// Protect with JWT if needed
// router.post("/hangup", hangupChannel);

module.exports = router;
