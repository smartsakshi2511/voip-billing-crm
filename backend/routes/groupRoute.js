// groupRoute
const express = require('express');
const router = express.Router();
 const groupController = require('../controller/groupController')

router.get('/', groupController.getGroup)
router.post('/add_group', groupController.addGroup);
router.delete('/delete_group/:id' , groupController.deleteGroup)
router.put('/edit_group/:id', groupController.editGroup);

router.post('/create', groupController.addGroupChats);
router.get('/myGroups/:userId', groupController.getChatGroup);

 
  

module.exports = router;