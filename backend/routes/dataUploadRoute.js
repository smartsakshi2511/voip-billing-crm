const express =require('express');
const router = express.Router();

const dataUploadController = require('../controller/dataUploadController')

router.get('/get_data_upload' , dataUploadController.getList)


module.exports = router