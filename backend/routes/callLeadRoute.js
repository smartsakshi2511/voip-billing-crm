const express = require('express');
const router = express.Router();

const callLeadController = require('../controller/CallLeadController')

// router.get("/viewLead", callLeadController.getLead)
router.get("/chart-data", callLeadController.chartData)
router.get("/agent-summary", callLeadController.agentSummary)
router.get("/feature/:filter", callLeadController.featured)
router.post("/add-lead", callLeadController.addLead)
router.post("/submit-verification", callLeadController.submitVerificationForm)
router.get("/viewVerificationForm", callLeadController.viewVerificationForm)


module.exports = router