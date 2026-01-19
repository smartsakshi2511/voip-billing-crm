// groupRoute
const express = require('express');
const router = express.Router();
const disponsitionController = require('../controller/dispositionController')
 

router.get("/searchDis", disponsitionController.getDispo)
router.put("/updateDis/:id", disponsitionController.editDispo)
router.delete("/deleteDispo/:id", disponsitionController.deleteDispo)
router.post('/addDis', disponsitionController.addDispo)
router.get("/view/:id", disponsitionController.ViewById)
router.put("/statusDispo/:id", disponsitionController.statusToggler)
 
 

module.exports = router;