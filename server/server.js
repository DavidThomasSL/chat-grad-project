var express = require("express");
var cookieParser = require("cookie-parser");
var ConversationService = require("./conversations.js");
var UserService = require("./users.js");
var MessageService = require("./messages.js");
var bodyParser = require("body-parser");

var ObjectId = require("mongodb").ObjectID;

module.exports = function (port, db, githubAuthoriser) {
    var app = express();
    var router = express.Router();

    app.use(express.static("public"));
    app.use(bodyParser.json());
    app.use(cookieParser());

    var conversations = db.collection("conversations");
    var users = db.collection("users");
    var messages = db.collection("messages");
    var sessions = {};
    var cService = new ConversationService(db);
    var uService = new UserService(db);
    var mService = new MessageService(db);

    app.get("/oauth", function (req, res) {
        githubAuthoriser.authorise(req, function (githubUser, token) {
            if (githubUser) {
                users.findOne({
                    _id: githubUser.login
                }, function (err, user) {
                    if (!user) {
                        // TODO: Wait for this operation to complete
                        users.insertOne({
                            _id: githubUser.login,
                            name: githubUser.name,
                            avatarUrl: githubUser.avatar_url
                        });
                    }
                    sessions[token] = {
                        user: githubUser.login
                    };
                    res.cookie("sessionToken", token);
                    res.header("Location", "/");
                    res.sendStatus(302);
                });
            }
            else {
                res.sendStatus(400);
            }

        });
    });

    app.get("/api/oauth/uri", function (req, res) {
        res.json({
            uri: githubAuthoriser.oAuthUri
        });
    });

    app.use(function (req, res, next) {
        if (req.cookies.sessionToken) {
            req.session = sessions[req.cookies.sessionToken];
            if (req.session) { ////////////////////////////////////
                next();
            } else {
                res.sendStatus(401);
            }
        } else {
            res.sendStatus(401);
        }
    });

    app.get("/api/user", function (req, res) {
        users.findOne({
            _id: req.session.user
        }, function (err, user) {
            if (!err) {
                res.json(user);
            } else {
                res.sendStatus(500);
            }
        });
    });

    app.get("/api/users", function (req, res) {
        uService.getUsers()
            .then(uService.marshalUserList)
            .then(function (users) {
                res.json(users);
            })
            .catch(function (err) {
                res.set("responseText", err.msg);
                res.sendStatus(err.code);
            });
    });

    router.route("/conversations")
        .get(function (req, res) {
            cService.getConversations(req.session.user)
                //.then(uService.expandUsersForList)
                .then(cService.marshalConversationList)
                .then(
                function (conversations) {
                    res.json(conversations);
                },
                function (err) {
                    res.set("responseText", err.msg);
                    res.sendStatus(500);
                }
            );
        })
        .post(function (req, res) {
            var conversation = req.body;
            var consUsers = [req.session.user];

            conversation.users.forEach(function (user) {
                if (consUsers.indexOf(user) < 0) {
                    consUsers.push(user);
                }
            });
            conversation.users = consUsers.map(function(user) {
                return {id: user, lastRead: 0};
            });
            uService.userListExists(conversation.users)
                .then(function () {
                    return cService.insertOne(conversation);
                })
                .then(function () {
                    res.sendStatus(201);
                })
                .catch(function (err) {
                    res.sendStatus(err.code);
                });
        });

    router.route("/conversations/:id")
        .get(function (req, res) {
            var id = req.params.id;
            if (!ObjectId.isValid(id)) {
                res.set("responseText", "Invalid ID");
                res.sendStatus(400);
            } else {
                cService.getConversation(id)
                    //.then(uService.expandUsers)
                    .then(mService.expandMessages)
                    .then(cService.marshalConversation)
                    .then(
                    function (conversation) {
                        res.json(conversation);
                    })
                    .catch(
                    function (err) {
                        res.sendStatus(err.code);
                    }
                );
            }
        });

    router.route("/conversations/:conversation/user/:user")
        .put(function (req, res) {
            var conversationId = req.params.conversation;
            var userId = req.params.user;
            cService.updateLastRead(conversationId, userId).then(function (update) {
                res.json(update);
            }).catch(function (err) {
                res.set("responseText", err.msg);
                res.sendStatus(err.code);
            });

        });

    router.route("/conversations/:id/messages")
        .post(function (req, res) {
            var id = req.params.id;
            var message = req.body;
            message.conversation = ObjectId(id);
            message.sender = req.session.user;
            message.timestamp = Date.now();
            cService.getConversation(id)
                .then(function () {
                    return uService.getUser(message.sender);
                })
                .then(function () {
                    return mService.insertOne(message);
                })
                .then(function () {
                    res.sendStatus(201);
                })
                .catch(function (err) {
                    res.set("responseText", err.msg);
                    res.sendStatus(err.code);
                });
        });

    app.use("/api", router);

    return app.listen(port);
};
