// 'use strict';

// Dependencies
var RC = require('ringcentral');
var http = require('http');

var mysql = require('mysql');
var dbpool = require('./database');



const { Console } = require('console');

// Handle local development and testing
if (process.env.RC_ENVIRONMENT !== 'Production') {
    require('dotenv').config();
}

// CONSTANTS - obtained from environment variables
var PORT = process.env.PORT;

// VARS
var _devices = [];
var _extensionFilterArray = [];

var server = http.createServer(

    async function (req, res) {


        const headers = {
            'Content-Type': 'application/json; charset=utf-8' ,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
            'Access-Control-Max-Age': 2592000, // 30 days
            /** add other headers as per requirement */
          };


        if (req.method == 'POST') {

            if (req.url == "/webhook") {

                if (req.headers.hasOwnProperty("validation-token")) {
                    res.setHeader('Validation-Token', req.headers['validation-token']);
                    res.statusCode = 200;
                    res.end();
                } else {
                    var body = []
                    req.on('data', function (chunk) {
                        body.push(chunk);
                    }).on('end', function () {
                        body = Buffer.concat(body).toString();
                        var msg = JSON.parse(body)
                        //console.log(msg.body);
                        InsertData(msg);
                    });
                }
            }
            else if (req.url == "/presencewebhook") {

                if (req.headers.hasOwnProperty("validation-token")) {
                    res.setHeader('Validation-Token', req.headers['validation-token']);
                    res.statusCode = 200;
                    res.end();
                } else {
                    var body = []
                    req.on('data', function (chunk) {
                        body.push(chunk);
                    }).on('end', function () {
                        body = Buffer.concat(body).toString();
                        var msg = JSON.parse(body)
                        console.log("Agent webhook");
                        //InsertData(msg);
                        insertAgentPresence(msg.body)
                    });
                }
            }

        } else {

            if (req.url == "/getMonitorCount") {
                const data = await getCallMonitorData();
                res.writeHead(200, headers);
                res.write(JSON.stringify(data), 'utf-8');
                res.end();
            }
            else {
                console.log("IGNORE OTHER METHODS")
            }
        }
    }

);

// Initialize the sdk for RC
var sdk = new RC({
    server: process.env.RC_API_BASE_URL,
    appKey: process.env.RC_APP_KEY,
    appSecret: process.env.RC_APP_SECRET,
    cachePrefix: process.env.RC_CACHE_PREFIX
});

// Bootstrap Platform and Subscription
var platform = sdk.platform();

//login
login();


function login() {
    return platform.login({
        username: process.env.RC_USERNAME,
        password: process.env.RC_PASSWORD,
        extension: process.env.RC_EXTENSION
    })
        .then(function (response) {
            //console.log("The RC auth object is :", JSON.stringify(response.json(), null, 2));
            console.log("Succesfully logged into the RC Account");

            //getSubscriptionList();  //If you facing subscription limit error then uncomment this line

            subscribe_for_notification();
            subscribe_for_Presence();

        })
        .catch(function (e) {
            console.log("Login Error into the Ringcentral Platform :", e);
            throw e;
        });
}

// Start the server
server.listen(PORT);


function getSubscriptionList() {
    platform.get(`/restapi/v1.0/subscription`).then((r) => {
        console.log(JSON.parse(r._text))

        var datalist = JSON.parse(r._text);

        //Delete Subscription
        datalist.records.forEach(element => {
            console.log(element.id)
            platform.delete(`/restapi/v1.0/subscription/${element.id}`).then((r) => {
                // PROCESS RESPONSE
            });
        });

    });
}


async function subscribe_for_notification() {
    var params = {
        eventFilters: [
            '/restapi/v1.0/account/~/telephony/sessions'
        ],
        deliveryMode: {
            transportType: "WebHook",
            address: process.env.DELIVERY_ADDRESS
        }
    }

    try {
        var resp = await platform.post('/restapi/v1.0/subscription', params)
        var jsonObj = await resp.json()
        console.log(jsonObj.id)
        console.log("Ready to receive incoming SMS via WebHook.")
    } catch (e) {
        console.error(e.message);
        throw e;
    }
}

async function subscribe_for_Presence() {

    var devices = [];
    var page = 1;

    function getDevicesPage() {

        return platform
            .get('/account/~/extension', {
                page: page,
                perPage: process.env.DEVICES_PER_PAGE                                             //REDUCE NUMBER TO SPEED BOOTSTRAPPING
            })
            .then(function (response) {

                console.log("The account level extensions are :", JSON.stringify(response.json(), null, 2));
                var data = response.json();

                console.log("************** THE NUMBER OF ACCOUNT LEVEL Extensions ARE : ***************", data.records.length);

                devices = devices.concat(data.records);
                if (data.navigation.nextPage) {
                    page++;
                    return getDevicesPage();                                                     // this will be chained
                } else {
                    return devices;                                                              // this is the finally resolved thing
                }
            });

    }

    getDevicesPage()
        .then(function (devices) {
            console.log("************** The total extensions are : **********", devices.length);
            return devices;
        })
        .then(async () => {

            var eventFilters = [];
            devices.map(item => {
                eventFilters.push(`/restapi/v1.0/account/~/extension/${item.id}/presence`)
            })

            console.log(eventFilters);

            var params = {
                eventFilters: eventFilters,
                deliveryMode: {
                    transportType: "WebHook",
                    address: process.env.DELIVERY_ADDRESS_Agent_Status
                }
            }

            try {
                var resp = await platform.post('/restapi/v1.0/subscription', params)
                var jsonObj = await resp.json()
                console.log(jsonObj.id)
                console.log("Ready to receive agent status via WebHook.")
            } catch (e) {
                console.error(e.message);
                throw e;
            }


        })
        .catch(function (e) {
            console.error(e);
            throw e;
        });


}

function InsertData(mainObj) {

    var data = mainObj.body;

    for (var i = 0; i <= data.parties.length - 1; i++) {

        console.log("status code");
        console.log(data.parties[i].status);

        var reason = "";
        console.log("reason " + data.parties[i].status.reason)
        if (data.parties[i].status.reason != undefined) {
            reason = data.parties[i].status.reason;
        }

        var sqlquery = "INSERT INTO rc_csn (sessionId, eventTime,accountId,extensionId,id,to_phoneNumber,queue_name,from_phoneNumber,status,uuid,statusReason) VALUES ("
            + '"' + data.sessionId + '"' + ","
            + '"' + data.eventTime + '"' + ","
            + '"' + data.parties[i].accountId + '"' + ","
            + '"' + data.parties[i].extensionId + '"' + ","
            + '"' + data.parties[i].id + '"' + ","
            + '"' + data.parties[i].to?.phoneNumber + '"' + ","
            + '"' + data.parties[i].to?.name + '"' + ","
            + '"' + data.parties[i].from?.phoneNumber + '"' + ","
            + '"' + data.parties[i].status.code + '"' + ","
            + '"' + mainObj.uuid + '"' + ","
            + '"' + reason + '"' + ")";


        //callcontrol(data.telephonySessionId);

        dbpool.query(sqlquery, (error, results, fields) => {
            if (error) console.log(error);
            console.log("1 row inserted");
        });

    }

    return 1;

}

function callcontrol(telephonySessionId) {

    try {
        const queryParams = {
            //timestamp: '<ENTER VALUE>',
            //timeout: '<ENTER VALUE>'
        };

        platform.get(`/restapi/v1.0/account/${process.env.RC_ACCOUNTID}/telephony/sessions/${telephonySessionId}`, queryParams).then((r) => {
            // PROCESS RESPONSE
            console.log("tele session")
            console.log(r)
        });
    }
    catch (e) {
        console.log(e);
    }

}

async function insertAgentPresence(dataObj) {

    const selectQuery = `select count(*) as 'avaiCount' from rc_agents where extensionId='${dataObj.extensionId}'`
    await dbpool.query(selectQuery, (err, res, cols) => {
        if (err) console.log(err);

        let actionType = "I";

        console.log("show count " + res[0].avaiCount);
        if (res[0].avaiCount > 0) {
            actionType = "U";
        }
        console.log(dataObj);
        CheckCallQueue(dataObj, actionType);
    });

}


async function CheckCallQueue(dataObject, action) {
    try {
        let IsQueueMember = 1;

        if (action == "I") {
            const InsertQuery = `
            Insert into rc_agents(extensionId,presenceStatus,LastUpdated,IsQueueMember,userStatus,meetingStatus,dndStatus) 
            values('${dataObject.extensionId}','${dataObject.presenceStatus}',CURDATE(),${IsQueueMember},'${dataObject.userStatus}','${dataObject.telephonyStatus}','${dataObject.dndStatus}')`

            dbpool.query(InsertQuery, (error, results, fields) => {
                if (error) console.log(error);
                console.log("1 row Agents Inserted");
            });

        }
        else {

            const updateQuery = `update rc_agents set presenceStatus='${dataObject.presenceStatus}',userStatus='${dataObject.userStatus}',meetingStatus='${dataObject.telephonyStatus}',dndStatus='${dataObject.dndStatus}',LastUpdated=CURDATE(),IsQueueMember=${IsQueueMember} where extensionId='${dataObject.extensionId}' `;

            dbpool.query(updateQuery, (error, results, fields) => {
                if (error) console.log(error);
                console.log("1 row Agents updated");
            });

        }
    }
    catch (e) {
        console.log(e);
    }

}

async function getCallMonitorData() {

    let response = {
        availableCount: 0,
        queueCount: 0
    };

    var dbextList = [];
    const availSql = `select distinct extensionId from rc_agents where presenceStatus='Available' and userStatus='Available' and meetingStatus='NoCall' and dndStatus='TakeAllCalls' and IsQueueMember=1`;
    const result = await dbpool.query(availSql);
    if (result.length > 0) {
        dbextList = result;
    }

    var datalist = [];

    const queryParams = {
        page: 1,
        perPage: 1000
    };

    const result3 = await platform.get(`/restapi/v1.0/account/${process.env.RC_ACCOUNTID}/call-queues/${process.env.RC_GROUPID}/members`, queryParams);

    datalist = JSON.parse(result3._text);
    console.log(datalist);

    if (datalist.records.length > 0) {

        var availableCount = 0;
        datalist.records.map(item => {
            var maplist = dbextList.filter(m => m.extensionId == item.id).length;
            if (maplist > 0) {
                availableCount++;
            }
        });

        response.availableCount = availableCount;

        console.log("list of queue agents checked");
    }

    const result1 = await dbpool.query(`
        select count(*) as 'queueCount' from rc_csn c
        inner join 
        (
            select max(a.sequence) as 'sequence',a.sessionId 
            from rc_csn a where DATE_ADD(UTC_TIMESTAMP(),interval -1 hour)<=a.eventTime and a.queue_name IN ('Inbound - Utility Switchboard', 'Callback - Utility Switchboard')
            group by a.sessionId ) as b on c.sequence=b.sequence and c.sessionId=b.sessionId
        where c.status='Proceeding' or c.status='Setup' or (c.status='Disconnected' and statusReason='BlindTransfer' ) 
        and c.queue_name='General - Utility Switchboard' `
    );


    if (result1.length > 0) {
        response.queueCount = result1[0].queueCount;
    }

    console.log(response)

    return response;
}
