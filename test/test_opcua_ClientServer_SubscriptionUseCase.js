var OPCUAClient = require("../lib/client/opcua_client").OPCUAClient;
var OPCUASession = require("../lib/client/opcua_client").OPCUASession;
var ClientSubscription = require("../lib/client/client_subscription").ClientSubscription;
var assert = require('better-assert');
var async = require("async");
var should = require('should');
var build_server_with_temperature_device = require("./helpers/build_server_with_temperature_device").build_server_with_temperature_device;
var AttributeIds = require("../lib/services/read_service").AttributeIds;
var resolveNodeId = require("../lib/datamodel/nodeid").resolveNodeId;

var perform_operation_on_client_session = require("./helpers/perform_operation_on_client_session").perform_operation_on_client_session;
var perform_operation_on_subscription = require("./helpers/perform_operation_on_client_session").perform_operation_on_subscription;

describe("testing Client-Server subscription use case, on a fake server exposing the temperature device", function () {

    var server , client, temperatureVariableId, endpointUrl;

    var port = 2001;
    before(function (done) {
        // we use a different port for each tests to make sure that there is
        // no left over in the tcp pipe that could generate an error
        port += 1;
        server = build_server_with_temperature_device({ port: port}, function () {
            endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
            temperatureVariableId = server.temperatureVariableId;
            done();
        });
    });

    beforeEach(function (done) {
        client = new OPCUAClient();
        done();
    });

    afterEach(function (done) {
        client = null;
        done();
    });

    after(function (done) {
        server.shutdown(done);
    });

    it("should create a ClientSubscription to manage a subscription", function (done) {

        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            assert(session instanceof OPCUASession);

            var subscription = new ClientSubscription(session, {
                requestedPublishingInterval: 100,
                requestedLifetimeCount: 100 * 60 * 10,
                requestedMaxKeepAliveCount: 5,
                maxNotificationsPerPublish: 5,
                publishingEnabled: true,
                priority: 6
            });
            subscription.on("started", function () {
                setTimeout(function () {
                    subscription.terminate();
                }, 200);
            });
            subscription.on("terminated", function () {
                done();
            });
        }, done);
    });

    it("should dump statistics ", function (done) {

        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            assert(session instanceof OPCUASession);

            var subscription = new ClientSubscription(session, {
                requestedPublishingInterval: 100,
                requestedLifetimeCount: 100 * 60 * 10,
                requestedMaxKeepAliveCount: 5,
                maxNotificationsPerPublish: 5,
                publishingEnabled: true,
                priority: 6
            });
            subscription.on("started", function () {
                setTimeout(function () {
                    subscription.terminate();
                }, 200);
            });
            subscription.on("terminated", function () {
                done();
            });
        }, done);
    });

    it("a ClientSubscription should receive keep-alive events from the server", function (done) {

        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            assert(session instanceof OPCUASession);

            var nb_keep_alive_received = 0;

            var subscription = new ClientSubscription(session, {
                requestedPublishingInterval: 100,
                requestedLifetimeCount: 10,
                requestedMaxKeepAliveCount: 2,
                maxNotificationsPerPublish: 2,
                publishingEnabled: true,
                priority: 6
            });
            subscription.on("started", function () {
                setTimeout(function () {
                    subscription.terminate();
                }, 1000);
            });
            subscription.on("keepalive", function () {
                nb_keep_alive_received += 1;
            });
            subscription.on("terminated", function () {
                console.log(" subscription has received ", nb_keep_alive_received, " keep-alive event(s)");
                nb_keep_alive_received.should.be.greaterThan(0);
                done();
            });
        }, done);
    });

    xit("a ClientSubscription should survive longer than the life time", function (done) {
        // todo
        done();
    });

    it("should be possible to monitor an nodeId value with a ClientSubscription", function (done) {

        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            assert(session instanceof OPCUASession);

            var subscription = new ClientSubscription(session, {
                requestedPublishingInterval: 150,
                requestedLifetimeCount: 10 * 60 * 10,
                requestedMaxKeepAliveCount: 10,
                maxNotificationsPerPublish: 2,
                publishingEnabled: true,
                priority: 6
            });


            subscription.on("started", function () {

            });
            subscription.on("terminated", function () {
                done();
            });

            var monitoredItem = subscription.monitor(
                {nodeId: resolveNodeId("ns=0;i=2258"), attributeId: AttributeIds.Value},
                {samplingInterval: 10, discardOldest: true, queueSize: 1 });

            // subscription.on("item_added",function(monitoredItem){
            monitoredItem.on("initialized", function () {
                monitoredItem.terminate(function () {
                    subscription.terminate();
                });
            });

        }, done);
    });

    it("should be possible to monitor several nodeId value with a single client subscription",function(done){

        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            assert(session instanceof OPCUASession);

            var subscription = new ClientSubscription(session, {
                requestedPublishingInterval: 10,
                requestedLifetimeCount: 10 * 60 * 10,
                requestedMaxKeepAliveCount: 10,
                maxNotificationsPerPublish: 2,
                publishingEnabled: true,
                priority: 6
            });



            var currentTime_changes = 0;
            var monitoredItemCurrentTime = subscription.monitor(
                {nodeId: resolveNodeId("ns=0;i=2258"), attributeId: AttributeIds.Value},
                {samplingInterval: 10, discardOldest: true, queueSize: 1 });

            // subscription.on("item_added",function(monitoredItem){
            monitoredItemCurrentTime.on("changed", function (dataValue) {

                console.log(" current time",dataValue.value.value);
                currentTime_changes++;
            });

            var pumpSpeedId = "ns=4;b=0102030405060708090a0b0c0d0e0f10";
            var monitoredItemPumpSpeed = subscription.monitor(
                {nodeId: resolveNodeId(pumpSpeedId), attributeId: AttributeIds.Value},
                {samplingInterval: 10, discardOldest: true, queueSize: 1 });

            var pumpSpeed_changes = 0;
            monitoredItemPumpSpeed.on("changed", function (dataValue) {
                console.log(" pump speed ",dataValue.value.value);
                pumpSpeed_changes++;

            });

            setTimeout(function(){

                pumpSpeed_changes.should.be.greaterThan(1);
                currentTime_changes.should.be.greaterThan(1);
                done();
            },200);

        }, done);
    });

    it("should terminate any pending subscription when the client is disconnected",function(done){


        var the_session;

        async.series([

        // connect
        function (callback) {
            client.connect(endpointUrl, callback);
        },

        // create session
        function (callback) {
            client.createSession(function (err, session) {
                assert(session instanceof OPCUASession);
                if (!err) {
                    the_session = session;
                }
                callback(err);
            });
        },

        // create subscription
        function (callback) {

            var subscription = new ClientSubscription(the_session, {
                requestedPublishingInterval: 100,
                requestedLifetimeCount: 100 * 60 * 10,
                requestedMaxKeepAliveCount: 5,
                maxNotificationsPerPublish: 5,
                publishingEnabled: true,
                priority: 6
            });
            subscription.on("started", function () {

                var monitoredItem = subscription.monitor(
                    {
                        nodeId: resolveNodeId("ns=0;i=2258"),
                        attributeId: 13
                    },
                    {samplingInterval: 100, discardOldest: true, queueSize: 1 });

                callback();

            });

        },
        // wait a little bit
        function (callback) {
            setTimeout(function() {
                // client.disconnect(done);
                callback();
            },100);
        },

        // now disconnect the client , without closing the subscription first
        function (callback) {
            client.disconnect(callback);
        }

        ] , function(err) {
            done(err);
        });

    });

});

describe("testing server and subscription", function () {
    var server , client, temperatureVariableId, endpointUrl;
    var port = 2001;
    before(function (done) {
        console.log(" Creating Server");
        server = build_server_with_temperature_device({ port: port}, function () {
            endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
            temperatureVariableId = server.temperatureVariableId;
            done();
        });
    });

    beforeEach(function (done) {
        //xx console.log(" creating new client");
        client = new OPCUAClient();
        done();
    });

    afterEach(function (done) {
        //xx console.log(" shutting down client");
        client.disconnect(function (err) {
            client = null;
            done();
        });
    });

    after(function (done) {
        //xx console.log(" shutting down Server");
        server.shutdown(done);
    });

    it(" a server should accept several Publish Requests from the client without sending notification immediately," +
        " and should still be able to reply to other requests", function (done) {

        var subscriptionId;
        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            async.series([

                function (callback) {
                    session.createSubscription({
                        requestedPublishingInterval: 100,  // Duration
                        requestedLifetimeCount: 10,         // Counter
                        requestedMaxKeepAliveCount: 10,     // Counter
                        maxNotificationsPerPublish: 10,     // Counter
                        publishingEnabled: true,            // Boolean
                        priority: 14                        // Byte
                    }, function (err, response) {
                        subscriptionId = response.subscriptionId;
                        callback(err);
                    });
                },
                function (callback) {
                    session.readVariableValue("RootFolder", function (err, dataValues, diagnosticInfos) {
                        callback(err);
                    });
                },
                function (callback) {

                    // send many publish requests, in one go
                    session.publish({}, function (err, response) {
                    });
                    session.publish({}, function (err, response) {
                    });
                    session.publish({}, function (err, response) {
                    });
                    session.publish({}, function (err, response) {
                    });
                    session.publish({}, function (err, response) {
                    });
                    session.publish({}, function (err, response) {
                    });
                    callback();
                },
                function (callback) {
                    session.readVariableValue("RootFolder", function (err, dataValues, diagnosticInfos) {
                        callback();
                    });
                },
                function (callback) {
                    session.deleteSubscriptions({
                        subscriptionIds: [subscriptionId]
                    }, function (err, response) {
                        callback();
                    });
                }
            ], function (err) {
                done(err);
            });

        }, done);
    });

    it("A Subscription can be added and then deleted", function (done) {
        var subscriptionId;
        perform_operation_on_client_session(client, endpointUrl, function (session, done) {

            async.series([

                function (callback) {
                    session.createSubscription({
                        requestedPublishingInterval: 100,  // Duration
                        requestedLifetimeCount: 10,         // Counter
                        requestedMaxKeepAliveCount: 10,     // Counter
                        maxNotificationsPerPublish: 10,     // Counter
                        publishingEnabled: true,            // Boolean
                        priority: 14                        // Byte
                    }, function (err, response) {
                        subscriptionId = response.subscriptionId;
                        callback(err);
                    });
                },


                function (callback) {
                    session.deleteSubscriptions({
                        subscriptionIds: [subscriptionId]
                    }, function (err, response) {
                        callback();
                    });
                }
            ], function (err) {
                done(err);
            });

        }, done)

    });

    it("A MonitoredItem can be added to a subscription and then deleted", function (done) {

        perform_operation_on_subscription(client, endpointUrl, function (session, subscription, callback) {

            var monitoredItem = subscription.monitor(
                {nodeId: resolveNodeId("ns=0;i=2258"), attributeId: AttributeIds.Value},
                {samplingInterval: 10, discardOldest: true, queueSize: 1 });

            // subscription.on("item_added",function(monitoredItem){
            monitoredItem.on("initialized", function () {
                monitoredItem.terminate(function () {
                    callback();
                });
            });
        }, done);

    });

    it("A MonitoredItem should received changed event", function (done) {

        perform_operation_on_subscription(client, endpointUrl, function (session, subscription, callback) {

            var monitoredItem = subscription.monitor(
                {
                    nodeId: resolveNodeId("ns=0;i=2258"),
                    attributeId: 13
                },
                {samplingInterval: 100, discardOldest: true, queueSize: 1 });

            monitoredItem.on("initialized", function () {
            });

            monitoredItem.on("changed", function (value) {

                // the changed event has been received !

                // lets stop monitoring this item
                monitoredItem.terminate(function () {
                });
            });
            monitoredItem.on("terminated", function (value) {
                callback();
            });

        }, done);

    });

    it("A Server should reject a CreateMonitoredItemRequest if timestamp is invalid ( catching error on monitored item )", function (done) {


        var TimestampsToReturn = require("../lib/services/read_service").TimestampsToReturn;

        perform_operation_on_subscription(client, endpointUrl, function (session, subscription, callback) {

            var monitoredItem = subscription.monitor(
                {
                    nodeId: resolveNodeId("ns=0;i=2258"),
                    attributeId: 13
                },
                {samplingInterval: 100, discardOldest: true, queueSize: 1 },

                TimestampsToReturn.Invalid
            );

            var err_counter = 0;
            // subscription.on("item_added",function(monitoredItem){
            monitoredItem.on("initialized", function () {
            });

            monitoredItem.on("changed", function (value) {

            });
            monitoredItem.on("err", function (value) {
                err_counter ++;
            });
            monitoredItem.on("terminated", function () {
                err_counter.should.eql(1);
                callback();
            });

        }, done);
    });

    it("A Server should reject a CreateMonitoredItemRequest if timestamp is invalid ( catching error on callback)", function (done) {

        var TimestampsToReturn = require("../lib/services/read_service").TimestampsToReturn;

        perform_operation_on_subscription(client, endpointUrl, function (session, subscription, callback) {

            var monitoredItem = subscription.monitor(
                {
                    nodeId: resolveNodeId("ns=0;i=2258"),
                    attributeId: 13
                },
                {samplingInterval: 100, discardOldest: true, queueSize: 1 },


                TimestampsToReturn.Invalid, // <= A invalid  TimestampsToReturn

                function (err) {

                    should(err).be.instanceOf(Error);
                    callback(!err);
                }
            );


        }, done);
    });

    it("A Server should be able to revise publish interval to avoid trashing if client specify a very small or zero requestedPublishingInterval",function(done){

        // from spec 1.02  Part 4 $5.13.2.2 : requestedPublishingInterval:
        // The negotiated value for this parameter returned in the response is used as the
        // default sampling interval for MonitoredItems assigned to this Subscription.
        // If the requested value is 0 or negative, the server shall revise with the fastest
        // supported publishing interval.
        perform_operation_on_client_session(client, endpointUrl, function (session, inner_done) {

            session.createSubscription({
                requestedPublishingInterval: -1
            },function(err,createSubscriptionResponse){

                createSubscriptionResponse.revisedPublishingInterval.should.be.greaterThan(10);

                inner_done(err);
            });
        },done);


    });
});
