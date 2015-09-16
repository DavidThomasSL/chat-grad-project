var Promise = require("promise");
var mongo = require("mongodb");

function MessageService(db) {

    var messages = db.collection("messages");

    this.expandMessages = function(conversation) {
        return new Promise(function (resolve, reject) {
            var conversationId = mongo.ObjectID(conversation._id);
            messages.find({conversation: conversationId}).toArray(function (err, fullMessages) {
                if (err) {
                    reject({code: 500, msg: err});
                } else {
                    conversation.messages = fullMessages;
                    resolve(conversation);
                }
            });
        });
    };

    this.insertOne = function (message) {
        return new Promise(function (resolve, reject) {
            messages.insertOne(message, function (err, result) {
                if (err) {
                    reject({code: 500, msg: err});
                } else {
                    message._id = result.insertedId;
                    resolve(message);
                }
            });
        });
    };
}

module.exports = MessageService;
