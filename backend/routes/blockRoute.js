const express = require('express');
const router = express.Router();
const blockController = require('../controller/blockController')
 

router.get("/block", blockController.getBlock)
router.post("/blockStatus", blockController.statusBlock)
router.delete("/deleteBlock/:id", blockController.deleteBlock)
router.post("/addBlock", blockController.addBlock)
 router.get("/blockStatus/:id", blockController.getStatusBlock)
 
 

module.exports = router;