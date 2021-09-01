// 'use strict';

// Dependencies
var RC = require('ringcentral');
var http = require('http');

var mysql = require('mysql');
var dbpool = require('./database');

var cron = require('node-cron');

const rotaAPI = require("./rota-cloud/rotaAPI");

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
            'Content-Type': 'application/json; charset=utf-8',
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
            else if (req.url == "/rota_webhook") {
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
                        console.log(msg);

                        msg.forEach(item => {
                            if (item.event == "clocked_out") {
                                rotaAPI.getAttendance(item.data.id, false);
                            }
                            else if (item.event == "Clocked_in") {
                                rotaAPI.getAttendance(item.data.id, true);
                            }
                        });

                        //InsertData(msg);
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
            else if (req.url == "/getMonitorSumCount") {

                const data = await getSumMonitorData();
                res.writeHead(200, headers);
                res.write(JSON.stringify(data), 'utf-8');
                res.end();

            }
            else if (req.url == "/getAgentOnBreak") {
                res.writeHead(200, headers);
                const data = await rotaAPI.getAgentonBreakCount();
                res.write(JSON.stringify(data), 'utf-8');
                res.end();
            }
            else {
                console.log("IGNORE OTHER METHODS")
            }
        }
    }
    ,
    cron.schedule('* * * * *', () => {
        console.log('running a task every minute');
        setTimeout(() => {
            UpdateGroupID1();
        }, 2000); 
    }),
    cron.schedule('0 */2 * * * *', () => {
        console.log('running a task every 2 minute');
        setTimeout(() => {
            rotaAPI.getCheckedInUserList();
        }, 3000);
    })
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

            // getSubscriptionList();  //If you facing subscription limit error then uncomment this line

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
        availableCount1: 0,
        queueCount1: 0,
        availableCount2: 0,
        queueCount2: 0
    };

    const availSql = `select Count(distinct extensionId) as 'availableCount' from rc_agents where presenceStatus='Available' and userStatus='Available' and meetingStatus='NoCall' and dndStatus='TakeAllCalls' and IsQueueMember=1 and GroupID1='${process.env.RC_GROUPID}' `;
    const result = await dbpool.query(availSql);
    if (result.length > 0) {
        response.availableCount1 = result[0].availableCount;
    }

    const availSql1 = `select Count(distinct extensionId) as 'availableCount' from rc_agents where presenceStatus='Available' and userStatus='Available' and meetingStatus='NoCall' and dndStatus='TakeAllCalls' and IsQueueMember=1 and GroupID2='${process.env.RC_GROUPID2}' `;
    const result2 = await dbpool.query(availSql1);
    if (result2.length > 0) {
        response.availableCount2 = result2[0].availableCount;
    }

    const result1 = await dbpool.query(`
        select count(*) as 'queueCount' from rc_csn c
        inner join 
        (
            select max(a.sequence) as 'sequence',a.sessionId 
            from rc_csn a where DATE_ADD(UTC_TIMESTAMP(),interval -1 hour)<=a.eventTime and a.queue_name='${process.env.RC_QUEUE1}'
            group by a.sessionId ) as b on c.sequence=b.sequence and c.sessionId=b.sessionId
        where c.status='Proceeding' or c.status='Setup' or (c.status='Disconnected' and statusReason='BlindTransfer' )  or (c.extensionId='undefined' and c.status='Answered')
        and c.queue_name='${process.env.RC_QUEUE1}' `
    );

    if (result1.length > 0) {
        response.queueCount1 = result1[0].queueCount;
    }

    const resultQueue2 = await dbpool.query(`
        select count(*) as 'queueCount' from rc_csn c
        inner join 
        (
            select max(a.sequence) as 'sequence',a.sessionId 
            from rc_csn a where DATE_ADD(UTC_TIMESTAMP(),interval -1 hour)<=a.eventTime and a.queue_name='${process.env.RC_QUEUE2}'
            group by a.sessionId ) as b on c.sequence=b.sequence and c.sessionId=b.sessionId
        where c.status='Proceeding' or c.status='Setup' or (c.status='Disconnected' and statusReason='BlindTransfer' ) or (c.extensionId='undefined' and c.status='Answered')
        and c.queue_name='${process.env.RC_QUEUE2}' `
    );

    if (resultQueue2.length > 0) {
        response.queueCount2 = resultQueue2[0].queueCount;
    }

    console.log(response)

    return response;
}

async function getSumMonitorData() {

    let response = {
        availableCount1: 0,
        Sumofqueue1callsinlastminute: 0,
        availableCount2: 0,
        Sumofqueue2callsinlastminute: 0
    };

    const availSql = `select Count(distinct extensionId) as 'availableCount' from rc_agents where presenceStatus='Available' and userStatus='Available' and meetingStatus='NoCall' and dndStatus='TakeAllCalls' and IsQueueMember=1 and GroupID1='${process.env.RC_GROUPID}' `;
    const result = await dbpool.query(availSql);
    if (result.length > 0) {
        response.availableCount1 = result[0].availableCount;
    }

    const availSql1 = `select Count(distinct extensionId) as 'availableCount' from rc_agents where presenceStatus='Available' and userStatus='Available' and meetingStatus='NoCall' and dndStatus='TakeAllCalls' and IsQueueMember=1 and GroupID2='${process.env.RC_GROUPID2}' `;
    const result2 = await dbpool.query(availSql1);
    if (result2.length > 0) {
        response.availableCount2 = result2[0].availableCount;
    }

    const result1 = await dbpool.query(`
        Select Count(sessionId) as 'queueCount' from (
            select min(a.eventtime) as 'eventtime',a.sessionId from rc_csn a
            where  
            a.queue_name='${process.env.RC_QUEUE1}'
            group by a.sessionId having  DATE_ADD(UTC_TIMESTAMP(),interval -30 minute)<=min(a.eventTime)
        ) as b where DATE_ADD(UTC_TIMESTAMP(),interval -60 second)<=b.eventTime
    `
    );

    if (result1.length > 0) {
        response.Sumofqueue1callsinlastminute = result1[0].queueCount;
    }

    const resultQueue2 = await dbpool.query(`
            Select Count(sessionId) as 'queueCount' from (
            select min(a.eventtime) as 'eventtime',a.sessionId from rc_csn a
            where  
            a.queue_name='${process.env.RC_QUEUE2}'
            group by a.sessionId having  DATE_ADD(UTC_TIMESTAMP(),interval -30 minute)<=min(a.eventTime)
            ) as b where DATE_ADD(UTC_TIMESTAMP(),interval -60 second)<=b.eventTime
        `
    );

    if (resultQueue2.length > 0) {
        response.Sumofqueue2callsinlastminute = resultQueue2[0].queueCount;
    }

    return response;

}


async function UpdateGroupID1() {


    const queryParams = {
        page: 1,
        perPage: 1000
    };

    var dbextList = [];
    const availSql = `select distinct extensionId from rc_agents`;
    const result = await dbpool.query(availSql);
    if (result.length > 0) {
        dbextList = result;
    }

    const result3 = await platform.get(`/restapi/v1.0/account/${process.env.RC_ACCOUNTID}/call-queues/${process.env.RC_GROUPID}/members`, queryParams);
    var datalist = JSON.parse(result3._text);
    //console.log(datalist);

    if (datalist.records.length > 0) {

        dbextList.forEach(item => {

            console.log("extensionID " + item.extensionId);
            console.log(datalist.records.filter(m => m.id == item.extensionId));
            var maplist = datalist.records.filter(m => m.id == item.extensionId).length;

            if (maplist > 0) {
                dbpool.query(`update rc_agents set GroupID1='${process.env.RC_GROUPID}'  where extensionId='${item.extensionId}'`);
            }
            else {
                dbpool.query(`update rc_agents set GroupID1=''  where extensionId='${item.extensionId}'`);
            }

        });
    }

    setTimeout(() => {
        UpdateGroupID2(dbextList);
    }, 500);

    getAgentDetails();
    rotaAPI.customLogout();

}

async function UpdateGroupID2(dbextList) {

    const queryParams = {
        page: 1,
        perPage: 1000
    };

    const result3 = await platform.get(`/restapi/v1.0/account/${process.env.RC_ACCOUNTID}/call-queues/${process.env.RC_GROUPID2}/members`, queryParams);
    var datalist = JSON.parse(result3._text);
    //console.log(datalist);

    if (datalist.records.length > 0) {

        dbextList.forEach(item => {
            var maplist = datalist.records.filter(m => m.id == item.extensionId).length;
            if (maplist > 0) {
                dbpool.query(`update rc_agents set GroupID2='${process.env.RC_GROUPID2}'  where extensionId='${item.extensionId}'`);
            }
            else {
                dbpool.query(`update rc_agents set GroupID2=''  where extensionId='${item.extensionId}'`);
            }

        });
    }
}


async function getAgentDetails() {
    const availSql_rota = `select distinct extensionId from rc_agents where LastEmailUpdatedon<>CURDATE() or LastEmailUpdatedon is null`;
    const rota_response = await dbpool.query(availSql_rota);
    console.log(rota_response);
    if (rota_response.length > 0) {

        let timeout = 1200;
        rota_response.forEach(element => {

            setTimeout(() => {
                rotaAPI.updateEmailFromRC(element.extensionId, platform);
            }, timeout);

            timeout = timeout + 1200;
        });

    }
}
