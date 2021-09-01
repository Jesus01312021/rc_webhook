var dbpool = require('../database');
const axios = require('axios');
const token = "xaVHBV0xTVWFDn1s36pqTRFryujeDgbnwh9Y8ee08hyKwHsqa2vTxsqvtuRsMHfG";
axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

var extensionIds = "";

const getAttendance = async (dataID, IsLogin, IsCustom = false) => {

    if (dataID == null) {
        return;
    }

    try {
        //console.log("Attendance Called")
        const res = await axios.get(`${process.env.ROTA_CLOUD_ENDPOINT}attendance/${dataID}`);
        if (res.status == 200) {
            //console.log(res.data);

            var userId = res.data.user;
            var inTime = res.data.in_time;
            var outTime = res.data.out_time;
            var minuteBreak = res.data.minutes_break;
            var minuteLate = res.data.minutes_late;
            var hours = res.data.hours;

            const userResponse = await axios.get(`${process.env.ROTA_CLOUD_ENDPOINT}users/${userId}`);
            if (userResponse.status == 200) {

                //console.log(userResponse.data);
                var user_Name = `${userResponse.data.first_name} ${userResponse.data.last_name}`
                var emailId = userResponse.data.email;

                const availSql = `select extensionId from rc_agents where Email='${emailId}' limit 1`;
                const result = await dbpool.query(availSql);

                let extensionId = "";

                if (result.length > 0) {
                    extensionId = result[0].extensionId;
                    const updateStatusQuery = `update rc_agents set ISLogin=${(IsLogin == true ? 1 : 0)} where extensionId='${extensionId}'`;
                    const updateResult = await dbpool.query(updateStatusQuery);
                }

                const insertLogQuery = `Insert into rc_attendance_log (extensionId, inOutId, 
                                        userId, inTime, outTime, minuteBreak, hours, name, emailId, IsLogin, IsCustomLogout,CreatedDate)
                                        values('${extensionId}','${dataID}','${userId}','${inTime}',
                                        '${outTime}','${minuteBreak}','${hours}','${user_Name}','${emailId}',${(IsLogin == true ? 1 : 0)},${(IsCustom == true ? 1 : 0)},UTC_TIMESTAMP())`;

                const logInsertResult = await dbpool.query(insertLogQuery);

            }

        }
    } catch (err) {
        console.error('Error:', err);
    }

}

const updateEmailFromRC = async (extensionId, platform) => {

    try {

        const userRes = await platform.get(`/restapi/v1.0/account/${process.env.RC_ACCOUNTID}/extension/${extensionId}`);
        var userData = JSON.parse(userRes._text);
        //console.log("ahead res")
        if (userData != null) {
            let name = userData.contact.firstName + " " + userData.contact.lastName;
            const updateEmailQuery = `update rc_agents set Name="${name}",Email='${userData.contact.email}',LastEmailUpdatedon=CURDATE() where extensionId='${extensionId}'`;
            const updateResult = await dbpool.query(updateEmailQuery);
        }
    }
    catch (err) {
        console.log(err);
        const updateEmailQuery = `delete from rc_agents where extensionId='${extensionId}'`;
        const updateResult = await dbpool.query(updateEmailQuery);
    }

    //console.log(userData);
}

const getAgentonBreakCount = async () => {
    let obj = { BreakQueue1: 0, BreakQueue2: 0, BreakQueue3: 0 }

    let BreakCount1 = 0, BreakCount2 = 0, BreakCount3 = 0;
    let BreakArray1 = [], BreakArray2 = [], BreakArray3 = [];
    const res = await axios.get(`${process.env.ROTA_CLOUD_ENDPOINT}users_clocked_in`);
    if (res.status == 200) {
        //console.log(res.data);

        for (var i = 0; i < res.data.length; i++) {
            if (res.data[i].breaks_clocked.length > 0) {
                var breaks_clocked = res.data[i].breaks_clocked;
                console.log(breaks_clocked);

                for (var j = 0; j < breaks_clocked.length; j++) {

                    if (breaks_clocked[j].end_time == undefined) {
                        const userQueueQuery = `select distinct Name,Email,GroupID1,GroupID2,GroupID3 from rc_agents where userid=${res.data[i].user}`;
                        const resultuserQueue = await dbpool.query(userQueueQuery);

                        if (resultuserQueue.length > 0) {
                            if (resultuserQueue[0].GroupID1 != null && resultuserQueue[0].GroupID1 != "") {
                                BreakCount1 = BreakCount1 + 1;
                                BreakArray1.push(resultuserQueue[0].Name)
                            }

                            if (resultuserQueue[0].GroupID2 != null && resultuserQueue[0].GroupID2 != "") {
                                BreakCount2 = BreakCount2 + 1;
                                BreakArray2.push(resultuserQueue[0].Name)
                            }

                            if (resultuserQueue[0].GroupID3 != null && resultuserQueue[0].GroupID3 != "") {
                                BreakCount3 = BreakCount3 + 1;
                                BreakArray3.push(resultuserQueue[0].Name)
                            }
                        }

                    }

                }


            }
        }


    }


    obj.BreakQueue1 = BreakCount1;
    obj.BreakQueue2 = BreakCount2;
    obj.BreakQueue3 = BreakCount3;
    obj.AgentonBreak1 = BreakArray1;
    obj.AgentonBreak2 = BreakArray2;
    obj.AgentonBreak3 = BreakArray3;


    // const query = `select 
    //         (select count(distinct extensionId) from rc_agents  where dndStatus='DoNotAcceptAnyCalls' and ISLogin=1 and groupid1='${process.env.RC_GROUPID}') as 'BreakInQueue1',
    //         (select count(distinct extensionId) from rc_agents  where dndStatus='DoNotAcceptAnyCalls' and ISLogin=1 and groupid2='${process.env.RC_GROUPID2}') as 'BreakInQueue2'`;

    // const query2 = `select distinct Name,extensionId from rc_agents  where dndStatus='DoNotAcceptAnyCalls' and ISLogin=1 and groupid1='${process.env.RC_GROUPID}'`;
    // const query3 = `select distinct Name,extensionId from rc_agents  where dndStatus='DoNotAcceptAnyCalls' and ISLogin=1 and groupid2='${process.env.RC_GROUPID2}'`;

    // const result = await dbpool.query(query);
    // const result1 = await dbpool.query(query2);
    // const result2 = await dbpool.query(query3);
    // if (result.length > 0) {
    //     obj.BreakQueue1 = result[0].BreakInQueue1;
    //     obj.BreakQueue2 = result[0].BreakInQueue2;
    //     obj.AgentonBreak1 = result1.reduce((a, o) => (o.extensionId && a.push(o.Name), a), []);
    //     obj.AgentonBreak2 = result2.reduce((a, o) => (o.extensionId && a.push(o.Name), a), [])
    // }

    return obj;
}

const customLogout = async () => {
    let ln_date_string = new Date().toLocaleString("en-US", { timeZone: "Europe/London" });
    let date_ln = new Date(ln_date_string);
    console.log(date_ln.getHours());
    console.log(ln_date_string);

    let ln_hours = date_ln.getHours();

    if (ln_hours >= 19) {

        selQuery = `select distinct a.extensionId,
        (select inOutId from rc_attendance_log b where a.extensionId=b.extensionId order by createdDate desc limit 1 ) as 'inOutId',
        (select userId from rc_attendance_log b where a.extensionId=b.extensionId order by createdDate desc limit 1 ) as 'userId',
        (select inTime from rc_attendance_log b where a.extensionId=b.extensionId order by createdDate desc limit 1 ) as 'inTime',
        a.Name,a.Email from rc_agents a
        where a.ISLogin=1 and a.groupid1!='' and a.groupid2!='' and a.dndStatus='DoNotAcceptAnyCalls'`;

        const result1 = await dbpool.query(selQuery);
        if (result1.length > 0) {

            result1.forEach(element => {
                getAttendance(element.inOutId, false, true);
            });

        }

    }

}

const updateUserId = async (userId) => {

    const userResponse = await axios.get(`${process.env.ROTA_CLOUD_ENDPOINT}users/${userId}`);
    //console.log(userResponse);
    if (userResponse.status == 200) {

        var emailId = userResponse.data.email;

        console.log("emailId:" + emailId);
        const availSql = `select extensionId from rc_agents where Email='${emailId}' limit 1`;
        const result = await dbpool.query(availSql);

        let extensionId = "";

        if (result.length > 0) {
            extensionId = result[0].extensionId;
            console.log("Extension : " + extensionId)
            extensionIds = extensionIds == "" ? extensionId : (extensionIds + "','" + extensionId);
            const updateStatusQuery = `update rc_agents set ISLogin=1,UserId=${userId} where extensionId='${extensionId}'`;
            const updateResult = await dbpool.query(updateStatusQuery);
        }
    }


}

const getCheckedInUserList = async () => {

    const res = await axios.get(`${process.env.ROTA_CLOUD_ENDPOINT}users_clocked_in`);
    if (res.status == 200) {
        //console.log(res.data);

        //let extensionIds = '';
        var timeoutNew = 0;

        // for (var i = 0; i < res.data.length; i++) {

        //     timeoutNew = timeoutNew + 1500;
        //     console.log(res.data[i]);
        //     var userId = res.data[i].user;
        //     setTimeout(() => { updateUserId(userId) }, timeoutNew);

        // }

        res.data.forEach(element => {

            setTimeout(() => {
                updateUserId(element.user);
            }, timeoutNew);

            timeoutNew = timeoutNew + 1500;
        });


        const updateStatusQuery2 = `update rc_agents set ISLogin=0 where extensionId not in ('${extensionIds}')`;
        console.log(updateStatusQuery2);
        const uResult = await dbpool.query(updateStatusQuery2);

    }

   



}

module.exports = { getAttendance, updateEmailFromRC, getAgentonBreakCount, customLogout, getCheckedInUserList }
