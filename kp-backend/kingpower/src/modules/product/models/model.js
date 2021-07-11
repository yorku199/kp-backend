'use strict';
// use model
var mongoose = require('mongoose');
var Schema = mongoose.Schema;


var ProductSchema = new Schema({
    name: {
        type: String,
        required: 'Please fill a Product name',
    },
    sku: {
        type: String,
        required: 'Please fill a Sku',
    },
    type: {
        type: String,
        enum: ["parent", "standalone", "child"],
        required: 'Please fill a Type',
        //"parent", "standalone", "child"
    },
    parentSku: {
        type: String
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
ProductSchema.pre('save', function(next){
    let Product = this;
    const model = mongoose.model("Product", ProductSchema);
    if (Product.isNew) {
        // create
        next();
    }else{
        // update
        Product.updated = new Date();
        next();
    }
    
    
})
mongoose.model("Product", ProductSchema);