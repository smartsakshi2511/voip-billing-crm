const express =require('express');
const router = express.Router();
const AgentController = require('../controller/agentController')


router.get('/',AgentController.getList)
router.put('/update/:id',AgentController.editAgent)
router.post('/addUser',AgentController.addAgent)
router.delete('/deleteUser/:id',AgentController.deleteAgent)
router.get('/user/:userid',AgentController.searchAgent)
// router.get('/agentBreak',AgentController.agentBreak)
// router.get('/agentlogin',AgentController.agentLogin)


module.exports = router