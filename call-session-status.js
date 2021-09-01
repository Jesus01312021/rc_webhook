// https://developers.ringcentral.com/my-account.html#/applications
// Find your credentials at the above url, set them as environment variables, or enter them below

// PATH PARAMETERS
const accountId = '~';
const telephonySessionId = 's-4022dc30df5b4b398a3f0849942a57bd';

// OPTIONAL QUERY PARAMETERS
const queryParams = {
    //timestamp: '<ENTER VALUE>',
    //timeout: '<ENTER VALUE>'
};

const SDK = require('ringcentral');
const rcsdk = new SDK({server: process.env.RC_API_BASE_URL, appKey: process.env.RC_APP_KEY, appSecret: process.env.RC_APP_SECRET});
const platform = rcsdk.platform();
platform.login({ username: process.env.RC_USERNAME, extension: process.env.RC_EXTENSION, password: process.env.RC_PASSWORD }).then(() => {
    platform.get(`/restapi/v1.0/account/${accountId}/telephony/sessions/${telephonySessionId}`, queryParams).then((r) => {
        // PROCESS RESPONSE
    });
});

