'use strict';
var mongoose = require('mongoose'),
    model = require('../models/model'),
    mq = require('../../core/controllers/rabbitmq'),
    Stock = mongoose.model('Stock'),
    Product = mongoose.model('Product'),
    errorHandler = require('../../core/controllers/errors.server.controller'),
    _ = require('lodash');

const async = require('async');

exports.getList = function (req, res) {
    var pageNo = parseInt(req.query.pageNo);
    var size = parseInt(req.query.size);
    var query = {};
    if (pageNo < 0 || pageNo === 0) {
        response = { "error": true, "message": "invalid page number, should start with 1" };
        return res.json(response);
    }
    query.skip = size * (pageNo - 1);
    query.limit = size;

    Stock.find({}, {_id: 0, sku: 1, quantity: 1}, query, function (err, datas) {
        if (err) {
            return res.status(400).send({
                error: errorHandler.getErrorMessage(err)
            });
        } else {
            res.status(200).send(datas);
        };
    });
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
        if(row.quantity === undefined){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Quantity'
            });
        }
        Product.find({
            sku: row.sku,
        }, (err, result) => {
            if(result.length === 0){
                return res.status(400).send({
                    status: 400,
                    error: 'sku does not exist'
                });
            } else {
                if(result[0].type === "parent"){
                    return res.status(400).send({
                        status: 400,
                        error: 'sku is parent product'
                    });
                }else{
                    Stock.find({
                        sku: row.sku,
                    }, (err, result) => {
                        if(result.length > 0){
                            return res.status(400).send({
                                status: 400,
                                error: 'stock is already exist'
                            });
                        }else{
                            next()
                        }
                    })
                }
            }
        })
    }, () => {
        var ArrData = []
        async.eachSeries(addData, (row, next) => {
            var newStock = new Stock (row);
            newStock.save(function (err, data) {
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

    Stock.findById(id, function (err, data) {
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

exports.adjust = function (req, res) {
    var addData = req.body
    async.eachSeries(addData, (row, next) => {

        if(!row.sku){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Sku'
            });
        }
        if(row.quantity === undefined){
            return res.status(400).send({
                status: 400,
                error: 'Please fill a Quantity'
            });
        }

        if(row.operator === "add"){
            Product.find({
                sku: row.sku,
            }, (err, result) => {
                if(result.length === 0){
                    return res.status(400).send({
                        status: 400,
                        error: 'sku does not exist'
                    });
                } else {
                    if(result[0].type === "parent"){
                        return res.status(400).send({
                            status: 400,
                            error: 'sku is parent product'
                        });
                    }else{
                        Stock.find({
                            sku: row.sku,
                        }, (err, result) => {
                            if(result.length === 0){
                                return res.status(400).send({
                                    status: 400,
                                    error: 'stock does not exist'
                                });
                            }else{
                                    next()
                            }
                        })
                    }
                }
            })
        }else if(row.operator === "deduct"){
            Product.find({
                sku: row.sku,
            }, (err, result) => {
                if(result.length === 0){
                    return res.status(400).send({
                        status: 400,
                        error: 'sku does not exist'
                    });
                } else {
                    if(result[0].type === "parent"){
                        return res.status(400).send({
                            status: 400,
                            error: 'sku is parent product'
                        });
                    }else{
                        Stock.find({
                            sku: row.sku,
                        }, (err, result) => {
                            if(result.length === 0){
                                return res.status(400).send({
                                    status: 400,
                                    error: 'stock does not exist'
                                });
                            }else{
                                if(result[0].quantity < row.quantity ){
                                    return res.status(400).send({
                                        status: 400,
                                        error: 'not enough quantity'
                                    });
                                }else{
                                    next()
                                }
                            }
                        })
                    }
                }
            })
        }else{
            return res.status(400).send({
                status: 400,
                error: 'Operator not found'
            });
        }
    }, () => {
        var ArrData = []
        async.eachSeries(addData, (row, next) => {
            if(row.operator === "add"){
                Stock.updateOne({ "sku": row.sku }
                , { $inc: { "quantity": row.quantity } }
                , function () {
                    ArrData.push({ sku:row.sku })
                    next()
                });
            }else if(row.operator === "deduct"){
                Stock.updateOne({ "sku": row.sku }
                , { $inc: { "quantity": -row.quantity } }
                , function () {
                    ArrData.push({ sku:row.sku })
                    next()
                });
            }
        }, () => {
            res.status(200).send(ArrData);
        })
    })
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
