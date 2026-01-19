const express = require('express');
const router = express.Router();
const campaignController = require('../controller/campaignController');

 
router.get('/', campaignController.getCampaigns);
router.post('/addCampaign', campaignController.postCampaign);  
 router.put('/editCampaign/:id', campaignController.editCampaign);
router.put("/statusCompaign/:id", campaignController.statusToggler);
router.put("/clearIvr/:id", campaignController.clearIVRs);
router.delete('/deleteCampaign/:id',campaignController.deleteCampaign)
router.get('/checkDuplicateId/:id',campaignController.checkDuplicate)



 

module.exports = router;
