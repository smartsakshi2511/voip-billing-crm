const express = require("express");
const router = express.Router();
const logController = require("../controller/LogController");


// router.get("/checkSession", logController.checkSession);
router.post("/login", logController.login);
router.post("/verify_otp", logController.verifyAdminOTP);
router.post("/resend-otp", logController.resendOtp);


router.post('/select_campaign', logController.selectCampaign)
router.get('/get_agent_status', logController.getBreakStatus)
router.post("/break_time", logController.updateBreak);
router.post("/logout", logController.logout);
router.post("/adminLogoutUser", logController.adminLogoutUser);
router.post("/logoutAllAgents", logController.adminLogoutAllUsers);
router.post("/emergencyReset", logController.emergencyReset);


module.exports = router;
