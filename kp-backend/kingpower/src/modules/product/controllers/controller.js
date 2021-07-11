'use strict';
var mongoose = require('mongoose'),
    model = require('../models/model'),
    mq = require('../../core/controllers/rabbitmq'),
    Product = mongoose.model('Product'),
    errorHandler = require('../../core/controllers/errors.server.controller'),
    _ = require('lodash');

const async = require('async');

exports.getList = async function (req, res) {
    var pageNo = parseInt(req.query.pageNo);
    var size = parseInt(req.query.size);
    var query = {};
    if (pageNo < 0 || pageNo === 0) {
        response = { "error": true, "message": "invalid page number, should start with 1" };
        return res.json(response);
    }
    query.skip = size * (pageNo - 1);
    query.limit = size;

    var sku = [];
    var where = [];

    if(req.query.skus){
        sku = req.query.skus
    }

    for(let i=0;i < sku.length;i++){
        where.push(sku[i])
    }

    var dataProd = await Product.aggregate([
        { $match: { type : "child"} },
        { $match: {
            sku : { $in : where }
            }
        },
        {
          $group: {
             _id: "$parentSku",
          }
        },
      ])
    
    async.eachSeries(dataProd, (row, next) => {
        where.push(row._id)
        next()
    }, () => {
    const stages = []
    stages.push({
        $lookup:
        {
            from: 'stocks',
            let: { sku: "$sku" },
            pipeline: [{
                $match:
                {
                    $expr:
                    {
                        $and:
                            [
                                { $eq: ["$sku", "$$sku"] },
                                //{ quantity : { $not : 0 } }
                            ]
                    }
                }
            }, { $project: { _id: 0, quantity: 1 } }],
            as: 'stocks'
        }
    })
    
    if(where.length > 0){
        stages.push({
            $lookup:
            {
                from: 'products',
                let: { sku: "$sku" },
                pipeline: [{
                    $match:
                    {
                        $expr:
                        {
                            $and:
                                [
                                    { $eq: ["$parentSku", "$$sku"] },
                                ]
                        }
                    },
                },
                { $match: { sku : { $in : where } } },
                {
                    $lookup: {
                        from: "stocks",
                        localField: "sku",
                        foreignField: "sku",
                        as: "stocks",
                    }
                },
                { $project: { _id: 0, sku: 1, type:1, name: 1, stocks: 1 } }
                ],
                as: 'children'
            }
        })
    }else{
        stages.push({
            $lookup:
            {
                from: 'products',
                let: { sku: "$sku" },
                pipeline: [{
                    $match:
                    {
                        $expr:
                        {
                            $and:
                                [
                                    { $eq: ["$parentSku", "$$sku"] },
                                ]
                        }
                    },
                },
                {
                    $lookup: {
                        from: "stocks",
                        localField: "sku",
                        foreignField: "sku",
                        as: "stocks",
                    }
                }, 
                { $project: { _id: 0, sku: 1, type:1, name: 1, stocks: 1 } }
                ],
                as: 'children'
            }
        })
    }

    stages.push({ $match: { type : { $in : ["parent", "standalone"] } } })

    if(where.length > 0){
        stages.push({ $match: {
            sku : { $in : where }
            } 
        })
    }
    
    //stages.push({ $match: { "children.sku" : { $in : ["8101"] } } })
    stages.push({ $sort: { sku: 1 } })
    stages.push({ $project: {
            __v: 0
            , created: 0
            , _id: 0
            , "children.stocks._id": 0
            , "children.stocks.__v": 0
            , "children.stocks.created": 0
            , "children.stocks.sku": 0 
        }
    })
    //console.log(JSON.stringify(stages))
    Product.aggregate(stages, function (err, datas) {
        if (err) {
            return res.status(400).send({
                status: 400,
                error: errorHandler.getErrorMessage(err)
            });
        } else {
            var dataArr = []
            async.eachSeries(datas, (row, next) => {
                var children = []
                if(row.children.length > 0){
                    async.eachSeries(row.children, (row2, next) => {
                        if(row2.stocks.length > 0){
                            children.push(row2)
                            next()
                        }else{
                            next()
                        }
                    }, () => {
                        if(row.stocks.length > 0) {
                            dataArr.push({sku:row.sku, type: row.type, name: row.name, stocks:row.stocks, children})
                        }else{
                            dataArr.push({sku:row.sku, type: row.type, name: row.name, children})
                        }
                        next()
                    });
                }else{
                    if(row.stocks.length > 0) {
                        dataArr.push({sku:row.sku, type: row.type, name: row.name, stocks:row.stocks})
                    }else{
                        dataArr.push({sku:row.sku, type: row.type, name: row.name})
                    }
                    next()
                }
            }, () => {
                res.status(200).send(dataArr);
            });
        };
    });
            
})
};

exports.create = async function (req, res) {
    var addData = req.body
    async.eachSeries(addData, (row, next) => {
        if(!row.sku){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Sku'
            });
        }
        if(!row.name){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Name'
            });
        }
        if(!row.type){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Type'
            });
        }
        if(!(row.type === "parent" || row.type === "standalone" || row.type === "child")){
            return res.status(400).send({
                status: 400,
                error: 'Invalid format Type'
            });
        }
        Product.find({
            sku: row.sku,
        }, (err, result) => {
            if(result.length > 0){
                return res.status(400).send({
                    status: 400,
                    error: 'sku is already exist'
                });
            }else{
                if(row.type === "child" && row.parentSku === ""){
                    return res.status(400).send({
                        status: 400,
                        error: 'parentSku is invalid'
                    });
                }
                if(row.type === "child"){
                    Product.find({ type:"parent", sku: row.parentSku }, function (err, result) {
                        if(result.length === 0){
                            var dataMatch = addData.filter(datas => datas.type === "parent" && datas.sku === row.parentSku)
                            if(dataMatch.length === 0){
                                return res.status(400).send({
                                    status: 400,
                                    error: 'Parent Sku could not be found.'
                                });
                            }else{
                                next()
                            }
                        }else{
                            next()
                        }
                    });
                }else{
                    next()
                }
            }
        });
     }, () => {
        var ArrData = []
        async.eachSeries(addData, (row, next) => {
            var newProduct = new Product(row);
            newProduct.save(function (err, data) {
                ArrData.push({sku:data.sku})
                next()
            });
        }, () => {
            res.status(200).send(ArrData);
        })
    })
};

exports.getByID = function (req, res, next, id) {

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).send({
            status: 400,
            error: 'Id is invalid'
        });
    }

    Product.findById(id, function (err, data) {
        if (err) {
            return res.status(400).send({
                status: 400,
                error: errorHandler.getErrorMessage(err)
            });
        } else {
            req.data = data ? data : {};
            next();
        };
    });
};

exports.read = function (req, res) {
    res.status(200).send({
        status: 200,
        data: req.data ? req.data : []
    });
};

exports.update = function (req, res) {
    var updProduct = _.extend(req.data, req.body);
    updProduct.updated = new Date();
    //updProduct.updateby = req.user;

    if(req.body.type === "child" && req.body.parentSku === ""){
        return res.status(400).send({
            status: 400,
            error: 'parentSku is invalid'
        });
    }

    if(req.body.type === "child"){
        Product.find({ type:"parent", sku: req.body.parentSku }, function (err, data) {
            if (err) {
                return res.status(400).send({
                    status: 400,
                    error: errorHandler.getErrorMessage(err)
                });
            } else {
                if(data.length > 0){
                    updProduct.save(function (err, data) {
                        if (err) {
                            return res.status(400).send({
                                status: 400,
                                error: errorHandler.getErrorMessage(err)
                            });
                        } else {
                            res.status(200).send({
                                status: 200,
                                data: data
                            });
                        };
                    });
                }else{
                    return res.status(400).send({
                        status: 400,
                        error: 'Parent Sku could not be found.'
                    });
                }
            }
        });
    }else{
        updProduct.save(function (err, data) {
            if (err) {
                return res.status(400).send({
                    status: 400,
                    error: errorHandler.getErrorMessage(err)
                });
            } else {
                res.status(200).send({
                    status: 200,
                    data: data
                });
            };
        });
    }
};

exports.delete = function (req, res) {
    req.data.remove(function (err, data) {
        if (err) {
            return res.status(400).send({
                status: 400,
                error: errorHandler.getErrorMessage(err)
            });
        } else {
            res.status(200).send({
                status: 200,
                data: data
            });
        };
    });
};
