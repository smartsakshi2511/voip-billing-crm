const express = require('express');
const router = express.Router();

const ivrController = require('../controller/ivrController')

router.get('/ivrConverter', ivrController.getIVR)
router.delete("/deleteIVR/:id", ivrController.deleteIVR)
router.put("/updateSpeech/:id", ivrController.EditIVR)
router.post('/texttospeech', ivrController.AddIVR)


module.exports = router