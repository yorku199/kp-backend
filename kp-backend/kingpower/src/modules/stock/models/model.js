'use strict';
// use model
var mongoose = require('mongoose');
var Schema = mongoose.Schema;


var StockSchema = new Schema({
    sku: {
        type: String,
        required: 'Please fill a Stock name',
    },
    quantity: {
        type: Number,
        required: 'Please fill a quantity',
    },
    created: {
        type: Date,
        default: Date.now
    },
    updated: {
        type: Date
    },
    createby: {
        _id: {
            type: String
        },
        username: {
            type: String
        },
        displayname: {
            type: String
        }
    },
    updateby: {
        _id: {
            type: String
        },
        username: {
            type: String
        },
        displayname: {
            type: String
        }
    }
});
StockSchema.pre('save', function(next){
    let Stock = this;
    const model = mongoose.model("Stock", StockSchema);
    if (Stock.isNew) {
        // create
        next();
    }else{
        // update
        Stock.updated = new Date();
        next();
    }
})
mongoose.model("Stock", StockSchema);