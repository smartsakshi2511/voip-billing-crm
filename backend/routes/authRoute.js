const express = require('express');
const router = express.Router();
const List = require('../controller/authController');
  
router.get('/profile', List.profile);
router.get("/agents", List.getAgent);
router.get('/agentReport',List.getAllAgentReport);
router.get("/user/:userid", List.viewAgentDetails);
router.post("/add/agents", List.addAgent);
router.put("/agents/:userId", List.editAgent);
router.put("/status/:user_id", List.toggleUserStatus);
router.put("/update-api-key/:userId", List.generateApiKey);
router.delete("/agents/:id", List.deleteAgent);
router.get("/agent-breaks", List.getAgentBreak);
router.get("/agent-login-report", List.getAgentLoginReport);
router.get("/Agentfeature/:user_id/:filter", List.AgentDetailFeature);
router.get("/agent-chart-data/:userId",List.ViewAgentDetailChart);
router.get("/Agent-Summary/:userId", List.AgentSummary)
router.get("/admin", List.getAdmins);
router.post("/add/admin", List.createAdmin);
router.put("/admin/:user_id", List.editAdmin);

// router.put("/admin/:id", (req, res) => {
//   console.log("🔥 Hit PUT /admin/:id", req.params);
//   res.send("Route works");
// });

router.post("/add/user", List.superUser);

module.exports = router;

