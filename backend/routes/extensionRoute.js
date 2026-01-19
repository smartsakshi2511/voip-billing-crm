const express =require('express');
const router = express.Router();
const   extController = require('../controller/extensionController');

router.get("/viewExtension", extController.getExtension)
router.post("/addExtension", extController.addExtn);
router.delete("/deleteExtension/:id", extController.deleteExtn);
router.put("/extensionUpdate/:id", extController.editExtn);

router.get("/agentsExtension", extController.getAgentExt)

router.get("/getAgentsExtension/:group_id", extController.getAgentsExtension)
 router.post("/assignAgent", extController.assignAgent)
 router.delete("/deletelist/:id", extController.deleteAssignAgents)
router.get("/getAgentsByGroup/:group_id", extController.getAgentsByGroup);

module.exports = router